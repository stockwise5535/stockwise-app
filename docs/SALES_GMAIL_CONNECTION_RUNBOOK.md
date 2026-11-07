# Gmail OAuth + Supabase connection runbook (draft branch only)

**Implemented in PR #5, not deployed or verified against Google/Supabase. Sending remains OFF.**

## Required manual secrets (never share in chat or GitHub)
Set on Vercel **server-side** only:
- `SUPABASE_URL` — the existing project URL
- `SUPABASE_SERVICE_ROLE_KEY` — service role key (never browser/anon)
- `STOCKWISE_SALES_ENCRYPTION_KEY` — random 32-byte key, base64 encoded, retained safely for decrypting existing credentials
- `STOCKWISE_SALES_OAUTH_ADMIN_KEY` — independently random secret at least 32 characters
- `STOCKWISE_SALES_GMAIL_CLIENT_SECRET` — Google Web OAuth client secret
- `STOCKWISE_SALES_UNSUBSCRIBE_SECRET` — independent random HMAC key at least 32 characters
- `STOCKWISE_SALES_OAUTH_SETUP_ENABLED` — keep `false` until authorized operator has reviewed the code and deployed it in a controlled environment
- `STOCKWISE_SALES_SEND_ENABLED` — **false**, never turn on during OAuth setup

Registered client ID: `562356358390-quot4mgcatkble05itb85vruhm42fseu.apps.googleusercontent.com`.
Registered redirect URI: `https://stockwise-app-1qz9.vercel.app/api/auth/google/callback`.
Only authorized mailbox: `nexops2026test@gmail.com`.

## Database
Review and apply migrations `202611060001_sales_autopilot_foundation.sql` and `202611060002_sales_atomic_rpcs.sql` **in order**. Neither has been applied by the assistant. The two RPCs are service-role-only and use atomic updates.

## Operator authorization
`POST /api/auth/google/start` requires `Authorization: Bearer <STOCKWISE_SALES_OAUTH_ADMIN_KEY>` and returns an authorization URL. **The same browser session must retain the Secure HttpOnly cookie set by this response**; calling the start endpoint from curl and opening the URL in an unrelated browser will fail. Never put the admin key in a URL, query string, or browser script. Use a trusted operator-only workflow or secured browser client; the current start API is a low-level integration endpoint, not a complete operator UI.

`GET /api/auth/google/callback` requires that cookie, atomically consumes state in Supabase, exchanges the code, verifies the email claim using OpenID userinfo, and stores the refresh token encrypted. A successful callback reports `sendingEnabled:false`.

`GET /api/sales/unsubscribe?token=<signed token>` or POST with `{token}` performs an atomic, persistent opt-out; returns 503 if storage is unavailable. Never place a token in public logs.

## Release gates still blocking autonomous outreach
- Run tests locally or in CI and review all failures.
- Verify Google consent app publishing and refresh-token expiry rules. External Testing may expire refresh tokens after 7 days.
- Implement authenticated operator UI/session, token refresh and revocation, and atomic quota-aware Gmail send reservation.
- Verify unsubscribe endpoint on a controlled deployment; confirm correct physical sender address and compliance disclosures.
- Confirm actual lead source permissions, legal basis, jurisdiction and mailbox provider anti-abuse limits.
- Run self-addressed Gmail tests and inspect durable send ledger and suppression before any external outreach.

No code in this branch is permission to send real email.
