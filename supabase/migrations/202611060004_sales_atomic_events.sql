-- Durable, idempotent inbound event recording. Every event and contact
-- suppression/reply update commits in the SAME transaction.
create or replace function public.sales_record_outreach_event(
 p_contact_id uuid,p_event_key text,p_event_type text,p_occurred_at timestamptz default now()
) returns boolean language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
 if p_contact_id is null or p_event_key is null or length(trim(p_event_key))<8
   or p_event_type not in ('accepted','delivered','reply','unsubscribe','complaint','hard_bounce','uncertain')
   or p_occurred_at is null then return false; end if;
 -- Serialize with the send-reservation row lock for the same contact.
 perform 1 from public.sales_contacts where id=p_contact_id for update;
 if not found then return false; end if;
 insert into public.sales_outreach_events(contact_id,event_key,event_type,occurred_at)
 values(p_contact_id,p_event_key,p_event_type,p_occurred_at)
 on conflict(event_key) do nothing returning id into v_id;
 if v_id is null then
  -- Existing event key must match the same event; never accept collisions.
  return exists(select 1 from public.sales_outreach_events
    where event_key=p_event_key and contact_id=p_contact_id and event_type=p_event_type);
 end if;
 if p_event_type in ('unsubscribe','complaint','hard_bounce') then
  update public.sales_contacts set suppressed_at=coalesce(suppressed_at,now())
  where id=p_contact_id;
 elsif p_event_type='reply' then
  update public.sales_contacts set replied_at=coalesce(replied_at,now())
  where id=p_contact_id;
 end if;
 return true;
end $$;
revoke all on function public.sales_record_outreach_event(uuid,text,text,timestamptz)
 from public,anon,authenticated;
grant execute on function public.sales_record_outreach_event(uuid,text,text,timestamptz) to service_role;
