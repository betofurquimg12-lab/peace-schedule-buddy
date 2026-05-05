import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/google_calendar/calendar/v3';

type Action = 'create' | 'update' | 'delete';
interface Body {
  action: Action;
  appointment_id: string;
  // For create/update:
  summary?: string;
  description?: string;
  starts_at?: string; // ISO
  ends_at?: string;   // ISO
  attendees?: { email: string; displayName?: string }[];
  google_event_id?: string; // for update/delete
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    // Authn: require a valid Supabase user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'Missing Authorization header' }, 401);
    }
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnon = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) return json({ error: 'Unauthorized' }, 401);

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const GCAL_API_KEY = Deno.env.get('GOOGLE_CALENDAR_API_KEY');
    if (!LOVABLE_API_KEY) return json({ error: 'LOVABLE_API_KEY not configured' }, 500);
    if (!GCAL_API_KEY) return json({ error: 'GOOGLE_CALENDAR_API_KEY not configured' }, 500);

    const body = (await req.json()) as Body;
    if (!body?.action || !body?.appointment_id) {
      return json({ error: 'Missing action or appointment_id' }, 400);
    }

    const headers = {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      'X-Connection-Api-Key': GCAL_API_KEY,
      'Content-Type': 'application/json',
    };

    if (body.action === 'delete') {
      if (!body.google_event_id) return json({ error: 'google_event_id required' }, 400);
      const r = await fetch(
        `${GATEWAY_URL}/calendars/primary/events/${encodeURIComponent(body.google_event_id)}?sendUpdates=all`,
        { method: 'DELETE', headers },
      );
      if (!r.ok && r.status !== 410 && r.status !== 404) {
        const t = await r.text();
        return json({ error: `Calendar delete failed [${r.status}]: ${t}` }, 500);
      }
      return json({ ok: true });
    }

    if (!body.starts_at || !body.ends_at) return json({ error: 'starts_at and ends_at required' }, 400);

    const eventPayload = {
      summary: body.summary ?? 'Sessão',
      description: body.description ?? '',
      start: { dateTime: body.starts_at, timeZone: 'America/Sao_Paulo' },
      end: { dateTime: body.ends_at, timeZone: 'America/Sao_Paulo' },
      attendees: (body.attendees ?? []).filter((a) => a.email),
      conferenceData: {
        createRequest: {
          requestId: `meet-${body.appointment_id}-${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 1440 },
          { method: 'email', minutes: 10 },
          { method: 'popup', minutes: 5 },
        ],
      },
    };

    let response: Response;
    if (body.action === 'create') {
      response = await fetch(
        `${GATEWAY_URL}/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all`,
        { method: 'POST', headers, body: JSON.stringify(eventPayload) },
      );
    } else {
      // update
      if (!body.google_event_id) return json({ error: 'google_event_id required for update' }, 400);
      response = await fetch(
        `${GATEWAY_URL}/calendars/primary/events/${encodeURIComponent(body.google_event_id)}?conferenceDataVersion=1&sendUpdates=all`,
        { method: 'PATCH', headers, body: JSON.stringify(eventPayload) },
      );
    }

    const result = await response.json();
    if (!response.ok) {
      return json({ error: `Calendar API failed [${response.status}]`, details: result }, 500);
    }

    const meetLink: string | undefined =
      result.hangoutLink ||
      result.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === 'video')?.uri;

    return json({
      ok: true,
      event_id: result.id,
      meet_link: meetLink ?? null,
      html_link: result.htmlLink ?? null,
    });
  } catch (err) {
    console.error('google-calendar-event error', err);
    return json({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
