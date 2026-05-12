// Pulls events from Google Calendar (primary) for the next 60 days and
// upserts/deletes appointments accordingly. Source-of-truth split:
//  - source = 'system'  -> created in this app, do NOT overwrite from Google
//  - source = 'google'  -> external event mirrored from Google Calendar
//
// Designed to be called by pg_cron every 5 minutes AND on-demand from the app.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/google_calendar/calendar/v3';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const GCAL_API_KEY = Deno.env.get('GOOGLE_CALENDAR_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    if (!LOVABLE_API_KEY || !GCAL_API_KEY) {
      return json({ error: 'Missing connector credentials' }, 500);
    }
    const supabase = createClient(supabaseUrl, serviceKey);

    // Respect the global on/off toggle from agenda_settings
    const { data: syncSettings } = await supabase
      .from('agenda_settings')
      .select('google_sync_enabled')
      .limit(1)
      .maybeSingle();
    if (syncSettings && syncSettings.google_sync_enabled === false) {
      return json({ ok: true, skipped: true, reason: 'sync disabled' });
    }

    const now = new Date();
    const future = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
    const past = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const params = new URLSearchParams({
      timeMin: past.toISOString(),
      timeMax: future.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '500',
    });

    const headersAuth = {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      'X-Connection-Api-Key': GCAL_API_KEY,
    };

    // Fetch all writable/owned calendars (skip holidays/birthdays/contacts)
    const calListR = await fetch(`${GATEWAY_URL}/users/me/calendarList`, { headers: headersAuth });
    if (!calListR.ok) {
      return json({ error: `calendarList failed [${calListR.status}]: ${await calListR.text()}` }, 500);
    }
    const calList = await calListR.json();
    const calendars = (calList.items ?? []).filter((c: any) => {
      const id = c.id ?? '';
      if (id.includes('#holiday@') || id.startsWith('addressbook#') || id === 'en.usa#holiday@group.v.calendar.google.com') return false;
      return true;
    });
    const calendarAccount: string | undefined = calendars.find((c: any) => c.primary)?.id;

    // Aggregate items from each calendar
    const items: any[] = [];
    for (const cal of calendars) {
      const r = await fetch(`${GATEWAY_URL}/calendars/${encodeURIComponent(cal.id)}/events?${params}`, { headers: headersAuth });
      if (!r.ok) {
        console.warn('events fetch failed for calendar', cal.id, r.status, await r.text());
        continue;
      }
      const p = await r.json();
      for (const ev of (p.items ?? [])) {
        items.push({ ...ev, _calendarId: cal.id, _calendarSummary: cal.summary });
      }
    }


    let created = 0, updated = 0, deleted = 0, skipped = 0;
    const skippedDetails: { id: string; reason: string; status?: string }[] = [];
    const statusCounts: Record<string, number> = {};

    for (const ev of items) {
      const eventId: string = ev.id;
      if (!eventId) { skipped++; skippedDetails.push({ id: '?', reason: 'no id' }); continue; }
      statusCounts[ev.status ?? 'unknown'] = (statusCounts[ev.status ?? 'unknown'] ?? 0) + 1;

      // Find existing row by google_event_id
      const { data: existing } = await supabase
        .from('appointments')
        .select('id, source, google_etag')
        .eq('google_event_id', eventId)
        .maybeSingle();

      // Cancellation from Google
      if (ev.status === 'cancelled') {
        if (existing) {
          await supabase.from('appointments').delete().eq('id', existing.id);
          deleted++;
        } else {
          skipped++;
          skippedDetails.push({ id: eventId, reason: 'cancelled, no local row', status: ev.status });
        }
        continue;
      }

      // Determine start/end. Support all-day events (start.date) and timed (start.dateTime).
      let startISO: string | undefined = ev.start?.dateTime;
      let endISO: string | undefined = ev.end?.dateTime;
      let isAllDay = false;
      if ((!startISO || !endISO) && ev.start?.date && ev.end?.date) {
        isAllDay = true;
        // Google all-day end.date is exclusive (next day). Use 23:59:59 of (end - 1 day) for display.
        const startDate = ev.start.date as string;
        const endDateExclusive = new Date(ev.end.date as string);
        endDateExclusive.setUTCDate(endDateExclusive.getUTCDate() - 1);
        const endDate = endDateExclusive.toISOString().slice(0, 10);
        startISO = `${startDate}T00:00:00-03:00`;
        endISO = `${endDate}T23:59:59-03:00`;
      }
      if (!startISO || !endISO) {
        console.log('skip event (no start/end)', { id: eventId, status: ev.status, hasDateTime: !!ev.start?.dateTime, hasDate: !!ev.start?.date });
        skippedDetails.push({ id: eventId, reason: 'no start/end' });
        skipped++;
        continue;
      }

      if (existing) {
        // System-owned event: app is the source of truth, don't overwrite, but keep meet link in sync
        if (existing.source === 'system') {
          if (existing.google_etag !== ev.etag) {
            await supabase.from('appointments').update({
              meet_link: ev.hangoutLink ?? null,
              google_etag: ev.etag ?? null,
              google_updated_at: ev.updated ?? null,
              last_synced_at: new Date().toISOString(),
            }).eq('id', existing.id);
            updated++;
          }
          continue;
        }
        // External event: mirror changes
        if (existing.google_etag === ev.etag) {
          skipped++;
          continue;
        }
        const dur = Math.max(1, Math.round((+new Date(endISO) - +new Date(startISO)) / 60000));
        await supabase.from('appointments').update({
          starts_at: startISO,
          ends_at: endISO,
          duration_minutes: dur,
          external_summary: (isAllDay ? '[dia inteiro] ' : '') + (ev.summary ?? ''),
          meet_link: ev.hangoutLink ?? null,
          google_etag: ev.etag ?? null,
          google_updated_at: ev.updated ?? null,
          last_synced_at: new Date().toISOString(),
        }).eq('id', existing.id);
        updated++;
      } else {
        // New external event
        const dur = Math.max(1, Math.round((+new Date(endISO) - +new Date(startISO)) / 60000));
        const { error: insErr } = await supabase.from('appointments').insert({
          patient_id: null,
          starts_at: startISO,
          ends_at: endISO,
          duration_minutes: dur,
          modality: 'in_person',
          status: 'scheduled',
          recurrence: 'none',
          price: 0,
          source: 'google',
          external_summary: (isAllDay ? '[dia inteiro] ' : '') + (ev.summary ?? '(Evento do Google)'),
          google_event_id: eventId,
          google_etag: ev.etag ?? null,
          google_updated_at: ev.updated ?? null,
          meet_link: ev.hangoutLink ?? null,
          last_synced_at: new Date().toISOString(),
        });
        if (insErr) {
          console.error('insert failed', { id: eventId, err: insErr });
          skipped++;
          skippedDetails.push({ id: eventId, reason: `insert: ${insErr.message}` });
        } else {
          created++;
        }
      }
    }

    console.log('sync result', { total: items.length, created, updated, deleted, skipped, statusCounts });
    return json({ ok: true, created, updated, deleted, skipped, total: items.length, calendarAccount, statusCounts, skippedDetails: skippedDetails.slice(0, 20) });
  } catch (err) {
    console.error('google-calendar-sync error', err);
    return json({ error: err instanceof Error ? err.message : 'Unknown' }, 500);
  }
});

function json(p: unknown, status = 200) {
  return new Response(JSON.stringify(p), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
