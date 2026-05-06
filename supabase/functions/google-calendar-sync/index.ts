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

    const now = new Date();
    const future = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
    const past = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const params = new URLSearchParams({
      timeMin: past.toISOString(),
      timeMax: future.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '500',
      showDeleted: 'true',
    });

    const r = await fetch(`${GATEWAY_URL}/calendars/primary/events?${params}`, {
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'X-Connection-Api-Key': GCAL_API_KEY,
      },
    });
    if (!r.ok) {
      const t = await r.text();
      return json({ error: `Calendar list failed [${r.status}]: ${t}` }, 500);
    }
    const payload = await r.json();
    const items: any[] = payload.items ?? [];

    let created = 0, updated = 0, deleted = 0, skipped = 0;

    for (const ev of items) {
      const eventId: string = ev.id;
      if (!eventId) continue;

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
        }
        continue;
      }

      // Skip events without a real time block (all-day or malformed)
      const startISO = ev.start?.dateTime;
      const endISO = ev.end?.dateTime;
      if (!startISO || !endISO) {
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
          external_summary: ev.summary ?? null,
          meet_link: ev.hangoutLink ?? null,
          google_etag: ev.etag ?? null,
          google_updated_at: ev.updated ?? null,
          last_synced_at: new Date().toISOString(),
        }).eq('id', existing.id);
        updated++;
      } else {
        // New external event
        const dur = Math.max(1, Math.round((+new Date(endISO) - +new Date(startISO)) / 60000));
        await supabase.from('appointments').insert({
          patient_id: null,
          starts_at: startISO,
          ends_at: endISO,
          duration_minutes: dur,
          modality: 'in_person',
          status: 'scheduled',
          recurrence: 'none',
          price: 0,
          source: 'google',
          external_summary: ev.summary ?? '(Evento do Google)',
          google_event_id: eventId,
          google_etag: ev.etag ?? null,
          google_updated_at: ev.updated ?? null,
          meet_link: ev.hangoutLink ?? null,
          last_synced_at: new Date().toISOString(),
        });
        created++;
      }
    }

    return json({ ok: true, created, updated, deleted, skipped, total: items.length });
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
