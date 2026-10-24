# APAC growth and backend foundation

Start from completed Phase 2 (`f3fc26a`) on the same branch. No Phase 2 screen or local operational store will be replaced. No deployment or hosted migration is performed in this task.

## Scope and order
1. Add an additive Supabase migration: account profiles, customer workspaces, memberships, activation state, private leads and audit metadata.
2. Enforce membership/role checks in PostgreSQL, with atomic authenticated RPCs, server timestamps and idempotent workspace/lead creation.
3. Reuse Supabase Auth and LoginPage for signup/sign-in, including graceful missing-configuration behavior.
4. Add a small backend-backed `/growth` workspace/activation/lead interface, with `/signup` using the existing signup component.
5. Validate migration behavior, cross-workspace access, role restrictions and transactions on a local PostgreSQL engine, then test browser behavior and regressions.

APAC markets and language preferences are stored as customer-entered metadata. Until the acquisition audience/channel is confirmed, this phase implements manual private lead capture and activation only, not campaigns, outreach, tracking pixels, scraped contacts or automatic enrollment. Anonymous/public lead intake requires a later server endpoint with abuse controls and a defined consent policy.

## Data boundary
The new `nexops_*` tables are customer/account data only. Demo code never imports the growth repository; the new repository never imports operations, demo snapshots or localStorage. No SQL seeds insert operational demo data. Existing legacy `skus`, subscription tables, RLS and signup trigger remain untouched. New signup provisioning uses a separate trigger. Historical users receive only an account profile through an additive backfill; no workspace is inferred and no inventory is automatically moved.

Future operational persistence must use separate workspace-scoped tables, explicit customer-data provenance, composite `(workspace_id,id)` relationships, server-authorized approval transitions and an explicit import workflow. Neither the legacy local CSV cache nor synthetic Phase 2 records may be bulk-uploaded as customer data.

## Permissions
Authenticated, email-confirmed users can create a workspace atomically with their owner membership and activation record. Owner controls membership through an RPC; admin/operator can manage private leads and activation; viewer reads only. Memberships and audit records are never writable through ordinary table grants. All workspace-scoped tables enforce RLS; helper functions resolve the caller's role without recursive policies. Authenticated requests never require a service-role key. Audit metadata records IDs/events/changed field names, not lead contact values.

These controls establish a tested foundation, not a certification of production readiness. A hosted project, real JWT/Auth/PostgREST verification, migration review, rate limits, retention, consent/legal policy, backup/recovery and operational authorization remain deployment prerequisites.
