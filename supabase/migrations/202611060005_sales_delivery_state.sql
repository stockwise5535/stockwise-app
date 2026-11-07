-- Conservative post-reservation delivery state machine. Never retry a
-- reserved/uncertain Gmail send without independent reconciliation.
create or replace function public.sales_mark_send_result(
 p_reservation_id uuid,p_state text,p_provider_message_id text default null
) returns boolean language plpgsql security definer set search_path=public as $$
declare v_state text;
begin
 if p_reservation_id is null or p_state not in ('sent','uncertain')
    or (p_state='sent' and (p_provider_message_id is null or length(trim(p_provider_message_id))=0))
    or (p_state='uncertain' and p_provider_message_id is not null) then return false; end if;
 select state into v_state from public.sales_send_ledger where id=p_reservation_id for update;
 if not found then return false; end if;
 if v_state=p_state then
  return exists(select 1 from public.sales_send_ledger where id=p_reservation_id
   and (p_state='uncertain' or provider_message_id=p_provider_message_id));
 end if;
 if v_state<>'reserved' then return false; end if;
 update public.sales_send_ledger
 set state=p_state,provider_message_id=p_provider_message_id,
     sent_at=case when p_state='sent' then now() else null end
 where id=p_reservation_id;
 return true;
end $$;
revoke all on function public.sales_mark_send_result(uuid,text,text) from public,anon,authenticated;
grant execute on function public.sales_mark_send_result(uuid,text,text) to service_role;
