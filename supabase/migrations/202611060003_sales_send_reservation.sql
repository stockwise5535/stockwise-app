-- Atomic outbound reservation with strict per-day limit.
-- This does not send messages. Review and test against a staging database.
create or replace function public.sales_reserve_send(
 p_contact_id uuid,p_campaign_id text,p_idempotency_key text,p_daily_limit integer
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_contact public.sales_contacts%rowtype;
declare v_id uuid;
declare v_count bigint;
begin
 if p_contact_id is null or p_campaign_id is null or length(trim(p_campaign_id))=0
    or p_idempotency_key is null or length(trim(p_idempotency_key))<16
    or p_daily_limit is null or p_daily_limit<1 or p_daily_limit>25 then
  return null;
 end if;
 -- Global per-day advisory lock serializes reservations across all campaigns.
 perform pg_advisory_xact_lock(hashtext('stockwise_sales_send_quota'),hashtext((now() at time zone 'utc')::date::text));
 select * into v_contact from public.sales_contacts where id=p_contact_id for update;
 if not found or v_contact.suppressed_at is not null or v_contact.replied_at is not null
    or v_contact.contact_basis_verified is not true or v_contact.source_terms_verified is not true then
  return null;
 end if;
 -- Never reserve the same contact in the same campaign more than once.
 if exists(select 1 from public.sales_send_ledger where contact_id=p_contact_id and campaign_id=p_campaign_id) then return null; end if;
 -- Every reserved, sent, or uncertain send consumes quota; cancellation
 -- also counts conservatively to prevent retries from bypassing limits.
 select count(*) into v_count from public.sales_send_ledger
 where reserved_at >= date_trunc('day',now() at time zone 'utc') at time zone 'utc'
   and reserved_at < (date_trunc('day',now() at time zone 'utc')+interval '1 day') at time zone 'utc';
 if v_count>=p_daily_limit then return null; end if;
 insert into public.sales_send_ledger(contact_id,campaign_id,idempotency_key,state)
 values(p_contact_id,p_campaign_id,p_idempotency_key,'reserved')
 on conflict(idempotency_key) do nothing returning id into v_id;
 return v_id;
end $$;
revoke all on function public.sales_reserve_send(uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.sales_reserve_send(uuid,text,text,integer) to service_role;
