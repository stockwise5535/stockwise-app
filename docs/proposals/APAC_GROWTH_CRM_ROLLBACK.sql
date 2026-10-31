-- DISPOSABLE EMPTY DATABASE ONLY. Human approval required. Never run automatically.
-- No CASCADE, no deletion of existing foundation/customer data.
begin;
lock table public.nexops_crm_activity,public.nexops_growth_delivery_attempts,public.nexops_growth_approvals,public.nexops_growth_campaign_items,public.nexops_crm_contacts,public.nexops_crm_companies,public.nexops_growth_population in access exclusive mode;
do $$ declare t text; occupied boolean; begin
 foreach t in array array['nexops_crm_activity','nexops_growth_delivery_attempts','nexops_growth_approvals','nexops_growth_campaign_items','nexops_crm_contacts','nexops_crm_companies','nexops_growth_population'] loop
  execute format('select exists(select 1 from public.%I)',t) into occupied;
  if occupied then raise exception 'Rollback denied: CRM records exist';end if;
 end loop;
end $$;
drop function public.nexops_crm_claim(uuid,uuid,integer,text);
drop function public.nexops_crm_approve(uuid,uuid,integer,text);
drop function public.nexops_crm_save_draft(uuid,jsonb,text,uuid);
drop table public.nexops_crm_activity;
drop table public.nexops_growth_delivery_attempts;
drop table public.nexops_growth_approvals;
drop table public.nexops_growth_campaign_items;
drop table public.nexops_crm_contacts;
drop table public.nexops_crm_companies;
drop table public.nexops_growth_population;
drop function public.nexops_crm_approval_guard();
drop function public.nexops_crm_content_guard();
drop function public.nexops_crm_audit_immutable();
drop function public.nexops_crm_guard(uuid);
commit;
