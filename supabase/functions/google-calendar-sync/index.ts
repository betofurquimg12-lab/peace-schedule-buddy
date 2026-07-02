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

  // Require an authenticated (non-anon) caller. Allowed: a signed-in clinic
  // user (role = authenticated) or pg_cron / server-to-server (service_role).
  // Anon must be rejected because the anon key is public and this function
  // mutates appointments and reads patient data via the service-role client.
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return json({ error: 'Unauthorized' }, 401);
  }
  try {
    const [, payloadB64] = token.split('.');
    const claims = JSON.parse(
      atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'))
    );
    const role = claims?.role;
    if (role !== 'authenticated' && role !== 'service_role') {
      return json({ error: 'Forbidden' }, 403);
    }
  } catch {
    return json({ error: 'Invalid token' }, 401);
  }


  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const GCAL_API_KEY = Deno.env.get('GOOGLE_CALENDAR_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    if (!LOVABLE_API_KEY || !GCAL_API_KEY) {
      return json({ error: 'Missing connector credentials' }, 500);
    }
    const supabase = createClient(supabaseUrl, serviceKey);

    // Respect the global on/off toggle from agenda_settings, and capture the
    // owner_id so imported events get a created_by (needed for conflict detection).
    const { data: syncSettings } = await supabase
      .from('agenda_settings')
      .select('google_sync_enabled, owner_id')
      .limit(1)
      .maybeSingle();
    const ownerId: string | null = (syncSettings as any)?.owner_id ?? null;
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

    // Track which event ids came back from Google so we can hard-delete the rest
    const seenEventIds = new Set<string>();

    // Preload patients for Vittude name → patient_id matching
    const { data: allPatients } = await supabase.from('patients').select('id, full_name');
    const patientByName = new Map<string, string>();
    for (const p of allPatients ?? []) {
      if (p.full_name) patientByName.set(p.full_name.trim().toLowerCase(), p.id);
    }

    // All Google-imported events are treated as Vittude (per business rule).
    // Strip common Vittude prefixes to extract a clean patient name.
    const parseVittude = (summary: string | null | undefined) => {
      const s = (summary ?? '').trim();
      let name = s.replace(/^vittude\s*-\s*consulta\s*virtual\s*com\s*/i, '').trim();
      if (!name || /^vittude$/i.test(name)) {
        const m = s.match(/com\s+(.+)$/i);
        name = m ? m[1].trim() : s.replace(/vittude/ig, '').replace(/^[\s\-:]+|[\s\-:]+$/g, '').trim();
      }
      return { isVittude: true, cleanName: name || s || 'Paciente Vittude' };
    };

    for (const ev of items) {
      if (ev.id) seenEventIds.add(ev.id);
      const eventId: string = ev.id;
      if (!eventId) { skipped++; skippedDetails.push({ id: '?', reason: 'no id' }); continue; }
      statusCounts[ev.status ?? 'unknown'] = (statusCounts[ev.status ?? 'unknown'] ?? 0) + 1;

      // Find existing row by google_event_id
      const { data: existing } = await supabase
        .from('appointments')
        .select('id, source, google_etag, is_vittude, patient_id')
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
        const summary = ev.summary ?? '';
        const { isVittude, cleanName } = parseVittude(summary);
        const matchedPatient = isVittude ? patientByName.get(cleanName.toLowerCase()) ?? null : null;
        const displaySummary = (isAllDay ? '[dia inteiro] ' : '') + (isVittude ? cleanName : summary);
        await supabase.from('appointments').update({
          starts_at: startISO,
          ends_at: endISO,
          duration_minutes: dur,
          external_summary: displaySummary,
          meet_link: ev.hangoutLink ?? null,
          google_etag: ev.etag ?? null,
          google_updated_at: ev.updated ?? null,
          last_synced_at: new Date().toISOString(),
          is_vittude: isVittude,
          patient_id: matchedPatient ?? existing.patient_id ?? null,
        }).eq('id', existing.id);
        updated++;
      } else {
        // New external event
        const dur = Math.max(1, Math.round((+new Date(endISO) - +new Date(startISO)) / 60000));
        const summary = ev.summary ?? '';
        const { isVittude, cleanName } = parseVittude(summary);
        const matchedPatient = isVittude ? patientByName.get(cleanName.toLowerCase()) ?? null : null;
        const displaySummary = (isAllDay ? '[dia inteiro] ' : '') + (isVittude ? cleanName : (summary || '(Evento do Google)'));
        const { error: insErr } = await supabase.from('appointments').insert({
          patient_id: matchedPatient,
          starts_at: startISO,
          ends_at: endISO,
          duration_minutes: dur,
          modality: 'in_person',
          status: 'scheduled',
          recurrence: 'none',
          price: 0,
          source: 'google',
          is_vittude: isVittude,
          external_summary: displaySummary,
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

    // Hard-delete: any external rows whose google_event_id was NOT seen in the
    // current Google response window are gone from Google → drop them locally.
    {
      const past = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const future = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
      const { data: localExternal } = await supabase
        .from('appointments')
        .select('id, google_event_id')
        .eq('source', 'google')
        .gte('starts_at', past)
        .lte('starts_at', future);
      const stale = (localExternal ?? []).filter((r) => r.google_event_id && !seenEventIds.has(r.google_event_id));
      if (stale.length) {
        const { error: delErr } = await supabase
          .from('appointments')
          .delete()
          .in('id', stale.map((r) => r.id));
        if (!delErr) deleted += stale.length;
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
