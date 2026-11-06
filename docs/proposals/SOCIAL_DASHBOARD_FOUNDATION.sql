-- OPTIONAL, UNAPPLIED bootstrap for a project with NONE of the five NexOps tables.
-- If any exist, stop and inspect their existing definitions/RLS; do NOT overwrite.
-- No legacy profiles/skus/subscriptions, Auth triggers, Stripe or CRM rows change.
begin;
do $$ begin
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relname in ('nexops_organizations','nexops_organization_memberships','nexops_workspaces','nexops_workspace_memberships','nexops_growth_admins'))
 then raise exception 'Existing NexOps foundation detected: inspect and reuse; do not bootstrap blindly';end if;
 if to_regprocedure('public.nexops_is_growth_admin()') is not null then raise exception 'Existing administrator function: review first';end if;
end $$;
create table public.nexops_organizations (
 id uuid primary key default gen_random_uuid(),name text not null check(length(trim(name)) between 1 and 160),
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now()
);
create table public.nexops_organization_memberships (
 organization_id uuid not null references public.nexops_organizations(id),user_id uuid not null references auth.users(id),
 role text not null check(role in ('owner','admin','member')),primary key(organization_id,user_id)
);
create table public.nexops_workspaces (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.nexops_organizations(id),
 name text not null check(length(trim(name)) between 1 and 160),created_at timestamptz not null default now()
);
create table public.nexops_workspace_memberships (
 workspace_id uuid not null references public.nexops_workspaces(id),user_id uuid not null references auth.users(id),
 role text not null check(role in ('owner','admin','operator','viewer')),primary key(workspace_id,user_id)
);
create table public.nexops_growth_admins(user_id uuid primary key references auth.users(id));
do $$ declare t text;begin
 foreach t in array array['nexops_organizations','nexops_organization_memberships','nexops_workspaces','nexops_workspace_memberships','nexops_growth_admins'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
create policy own_org_membership on public.nexops_organization_memberships for select to authenticated using(user_id=auth.uid());
create policy own_workspace_membership on public.nexops_workspace_memberships for select to authenticated using(user_id=auth.uid());
create policy own_admin_record on public.nexops_growth_admins for select to authenticated using(user_id=auth.uid());
create policy member_organization on public.nexops_organizations for select to authenticated using(exists(select 1 from public.nexops_organization_memberships m where m.organization_id=id and m.user_id=auth.uid()));
create policy member_workspace on public.nexops_workspaces for select to authenticated using(exists(select 1 from public.nexops_workspace_memberships m where m.workspace_id=id and m.user_id=auth.uid()));
create function public.nexops_is_growth_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.nexops_growth_admins where user_id=auth.uid())
$$;
revoke all on function public.nexops_is_growth_admin() from public,anon;
grant execute on function public.nexops_is_growth_admin() to authenticated;
commit;
-- No organization, workspace, admin or membership is seeded. Provisioning them
-- requires separately approved, exact existing-user and organization UUIDs.
