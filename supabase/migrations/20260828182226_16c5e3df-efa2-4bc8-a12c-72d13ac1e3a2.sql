alter table public.appointments add column if not exists google_calendar_id text;

update public.appointments
set google_calendar_id = case
      when is_vittude then 'c_8e713b29bf6bdd33df9049fbbb6445b63823bfa43163c38826821f3f6b3e5f6b@group.calendar.google.com'
      else 'primary'
    end,
    google_etag = null
where source = 'google';