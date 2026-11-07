-- Atomic, one-time OAuth state consumption and durable opt-out.
-- Apply only after reviewing 202611060001_sales_autopilot_foundation.sql.
create or replace function public.sales_consume_oauth_state(p_state_hash text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare row_data public.sales_oauth_transactions%rowtype;
begin
 update public.sales_oauth_transactions
 set consumed_at=now()
 where state_hash=p_state_hash and consumed_at is null and expires_at>now()
 returning * into row_data;
 if not found then return null; end if;
 return jsonb_build_object('encrypted_verifier',row_data.encrypted_verifier);
end $$;
create or replace function public.sales_commit_unsubscribe(p_organization_id text,p_contact_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare affected integer;
begin
 update public.sales_contacts
 set suppressed_at=coalesce(suppressed_at,now())
 where id=p_contact_id and organization_id=p_organization_id;
 get diagnostics affected=row_count;
 return affected=1;
end $$;
revoke all on function public.sales_consume_oauth_state(text) from public,anon,authenticated;
revoke all on function public.sales_commit_unsubscribe(text,uuid) from public,anon,authenticated;
grant execute on function public.sales_consume_oauth_state(text) to service_role;
grant execute on function public.sales_commit_unsubscribe(text,uuid) to service_role;
