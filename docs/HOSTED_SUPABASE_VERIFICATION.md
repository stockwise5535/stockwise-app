# Hosted development verification — prerequisites and procedure

Current attempt (2026-10-24): **blocked, not verified**. Runtime and local env files contain neither VITE_SUPABASE_URL nor VITE_SUPABASE_ANON_KEY. The environment draft lists them as pending, not active. No Supabase CLI/link, account token, database URL/password, service-role key or confirmed test-user bindings were found. The read-only preflight exited 2 with zero network requests. Do not infer remote migration status from local test success.

## Exact setup needed
1. In Cloud Environment settings, supply **VITE_SUPABASE_URL** and **VITE_SUPABASE_ANON_KEY** using the existing requirements. Use the selected development project's HTTPS origin and public anon/publishable key from Supabase Project Settings / API. Never use a service-role key as a VITE_ value. Save/apply the settings to the running environment (pending draft entries alone are insufficient); restart Vite after variables arrive. Do not paste credential values into chat.
2. Set non-secret **NEXOPS_DEV_PROJECT_REF** to the intended development project reference. Independently confirm in the dashboard that it is a development project, not production. Add its exact `<project-ref>.supabase.co` hostname to existing cloud egress rules without replacing other entries. No hostname has been guessed or added.
3. Run `node scripts/check-hosted-supabase.mjs`. It makes GET requests only: Auth settings and anonymous SELECT-denial probes. It will never sign up, send mail, call application RPCs, or change schema. It validates the normal hosted Supabase origin and rejects admin keys/mismatched project references. Custom domains need a separately reviewed identity check. An anonymous denial is **not** proof that all authenticated RLS policies are correct.
4. For migration/catalog access, choose one supported route:
   - Owner-controlled Supabase **development SQL Editor**: run `supabase/hosted_catalog_inventory.sql`, then inspect CLI history only if the inventory says it exists. No CLI credential is required for this route.
   - Cloud CLI: securely provide SUPABASE_ACCESS_TOKEN and SUPABASE_DB_PASSWORD, plus the non-secret development reference; install/activate the official CLI, then link to that exact project. The public browser key does not authorize DDL.
   - An owner-provided development database connection, stored securely as SUPABASE_DB_URL, can be used by a trusted PostgreSQL client. No such connection/client is available now.

CLI sequence once credentials are present (never enable shell tracing):
```bash
npx --yes supabase --version
# Initialize only if supabase/config.toml is still absent; preserve existing files.
npx --yes supabase init
npx --yes supabase link --project-ref "$NEXOPS_DEV_PROJECT_REF"
npx --yes supabase migration list --linked
npx --yes supabase db push --linked --dry-run
```
Stop if the remote history/schema and local files disagree, or the dry run includes unrelated migrations. Do not use reset, include-all, blind migration repair, DROP or replacement of existing policies. After comparing history and catalog definitions and confirming the dry run contains **only the missing reviewed additive migrations**, `npx --yes supabase db push --linked` can apply those changes to the authorized development project. Never rerun CREATE TABLE migrations merely because history is missing; SQL Editor installations may not be recorded in CLI history. The legacy SUPABASE_SQL.sql must not be reapplied.

## Candidate migrations and current status
Local files are candidates, **not confirmed missing hosted migrations**:
- 202610240001_growth_foundation.sql — workspace/activation/lead/RLS foundation.
- 202610240002_growth_lifecycle.sql — customer-data boundary and lifecycle draft preparation.
- Any subsequently added outbound-safety migration is likewise subject to hosted history/catalog review before application.

Both original files use explicit transactions and additive objects; no DROP/TRUNCATE/DELETE or modification of the legacy tables/policies was found. Foundation backfills only account profiles from Auth users and adds a separate signup trigger. It does not copy operational demo contents. Remote application history, existing trigger compatibility and exact function/grant definitions remain **unknown** until catalog access is available. The inventory intentionally omits trigger arguments/function bodies and arbitrary settings that could contain credentials.

## Authenticated tests once connected
Provide **two distinct confirmed development test accounts**, with credentials supplied securely as NEXOPS_TEST_USER_A_EMAIL / NEXOPS_TEST_USER_A_PASSWORD and the corresponding USER_B variables, or authenticated test sessions through an approved test harness. Keep verification and RLS enabled. No test account credentials are present now.

- Authenticate A and B independently; bootstrap each and verify distinct organizations/starter demo metadata, owner memberships, retry idempotency, logout and refresh behavior.
- Persist A's TODAY/exception/recommendation events and reload activation from Supabase; verify one server activation event.
- Create conspicuously labeled development-only consultation fixtures. Confirm retry idempotency, qualification association and persistence after reload. Do not export these fixtures to CRM or run lifecycle send jobs.
- Generate a viewer invitation with the existing RPC (not Auth inviteUserByEmail); redeem in B, confirm the intended membership only, reject owner escalation/expired/reused tokens and deny viewer access to lead PII.
- Use B's ordinary JWT to query A's **unshared** organization/workspace/activation/leads and attempt linked RPC writes. Expect empty authorized reads/permission errors as appropriate, no cross-organization data. Never test with a service-role bypass token as the user.
- Check policies/grants/functions from the read-only catalog against the local migration definitions; all 20 foundation tables must retain RLS. New outbound tables, if applied later, need the same review.
- Verify no synthetic DEMO-SKU/action/exception/browser snapshot was persisted, and that operational data paths reject demo workspaces. Inspect counts/type/provenance without dumping customer records. Do not delete existing records for test cleanup; retain labeled fixtures for review unless cleanup is separately authorized.

### Signup without external email
Public signUp can send confirmation mail and existing Auth hooks can have side effects. Do **not** invoke signup, resend, recovery or Auth invite-email endpoints until the development project's delivery/hooks are inspected and a verified no-external-delivery test setup is available. Do not turn off email confirmation or weaken RLS to make this pass. Existing confirmed accounts allow the other tests to proceed independently. Admin-created confirmed fixtures are not a substitute for passing the public signup test. The later Gmail authorization is conditional on its own tested OAuth/safety gates; it does not silently authorize an uninspected Supabase mail flow.

## Observed outcomes
Hosted connectivity, migration history/application, hosted policy verification, signup/login/logout, organization/demo bootstrap, membership, activation, consultation, invitation, refresh, cross-workspace denial and persisted demo/customer separation: **all unrun/blocked by missing hosted configuration/access**. No hosted request, schema change, deletion, billing connection or message delivery occurred.

Independent work: validated the new catalog inventory on empty and migrated local PostgreSQL fixtures, including all 20 expected tables/RLS flags; checked the preflight syntax and fail-closed missing-variable result. Existing application/SQL suites were not rebuilt or rerun for this inspection. These checks do not establish hosted readiness.
