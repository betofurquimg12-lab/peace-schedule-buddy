const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const r = await fetch('https://connector-gateway.lovable.dev/google_calendar/calendar/v3/users/me/calendarList', {
    headers: {
      Authorization: `Bearer ${Deno.env.get('LOVABLE_API_KEY')}`,
      'X-Connection-Api-Key': Deno.env.get('GOOGLE_CALENDAR_API_KEY')!,
    },
  });
  const data = await r.json();
  const items = (data.items ?? []).map((c: any) => ({ id: c.id, summary: c.summary, primary: c.primary, accessRole: c.accessRole }));
  return new Response(JSON.stringify({ items }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
