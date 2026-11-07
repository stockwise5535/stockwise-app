# Stockwise Gmail OAuth — operator setup (default OFF)

Google OAuth Web client ID (public):
`562356358390-quot4mgcatkble05itb85vruhm42fseu.apps.googleusercontent.com`

Sender: `nexops2026test@gmail.com`
Production redirect URI (registered in Google Cloud):
`https://stockwise-app-1qz9.vercel.app/api/auth/google/callback`

## Important
The callback route on this branch is **a disabled 503 placeholder**. It is not deployed or connected to Google, and **must not be used for authorization yet**. Never paste client secrets, authorization codes, access tokens, or refresh tokens in chat, issues, or GitHub.

## Vercel environment configuration (future, after implementation)
- `STOCKWISE_SALES_GMAIL_CLIENT_ID`: the public Web OAuth client ID above.
- `STOCKWISE_SALES_GMAIL_CLIENT_SECRET`: Google Cloud Web client secret, entered directly in Vercel encrypted environment settings.
- `STOCKWISE_SALES_GMAIL_FROM`: `nexops2026test@gmail.com`
- `STOCKWISE_SALES_GMAIL_REDIRECT_URI`: the exact registered callback URI above.
- `STOCKWISE_SALES_GMAIL_VERIFIED`: `false` until the actual Gmail account is verified by OAuth.
- `STOCKWISE_SALES_SEND_ENABLED`: `false` until all send, opt-out, source, and quota gates pass.

## Must be implemented before authorization
1. Operator-only initiation route with unpredictable short-lived state bound to a session, and PKCE where applicable.
2. Callback validates state, operator authorization, Google token exchange, granted scope, and account identity; rejects any mismatch.
3. Encrypt refresh tokens at rest, restrict access, support rotation/revocation and prevent secret logging.
4. Durable suppression and idempotent send ledger; working unsubscribe endpoint before outbound mail.
5. Google OAuth consent app publication/verification plan: External Testing with Gmail scopes may issue refresh tokens expiring in seven days. Production unattended operation cannot rely on a temporary test grant.
6. Test only with the owner's mailbox and explicitly approved recipients before any outreach.

**No live sending or external lead contact is authorized by this document.**
