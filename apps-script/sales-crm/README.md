# Stockwise Sales CRM (Google Apps Script + Google Sheets + Gmail)

Free, self-contained outbound workflow. **No Vercel, no Gmail OAuth web flow, no paid API, no network calls** (`UrlFetchApp` is not used).
Ships with `LIVE_SENDING=FALSE` and `FOLLOW_UP_ENABLED=FALSE`. Nothing is sent to a prospect until you change settings deliberately.

> Not legal advice. Email rules differ for Japan, Singapore and Australia. The script enforces *your* documented basis and opt-out handling; it cannot decide that outreach is lawful.

## Files
| File | Role |
|---|---|
| `Core.js` | Pure rules: dedupe, eligibility, templates, pre-send gate, reply classification |
| `Engine.js` | Orchestration through injected `store`/`mail` (unit-tested with in-memory fakes) |
| `Main.js` | Sheets/Gmail adapters, menu, triggers, `sendTestToOwner` |
| `appsscript.json` | Manifest and minimal scopes |

## Install (about 10 minutes, no cost)
1. Open the **Stockwise Sales CRM** spreadsheet → *Extensions → Apps Script*.
2. Create files `Core`, `Engine`, `Main` and paste the three `.js` files. In *Project Settings* enable "Show appsscript.json" and paste the manifest.
   (Or use `clasp` if you prefer; the repo copy is the source of truth.)
3. Reload the spreadsheet. Run **Stockwise Sales → 1. Setup sheets** and accept the permissions prompt (Sheets of this file, Gmail, triggers).
   Setup only adds missing headers/settings; it never deletes data or overwrites existing setting values.
4. New/missing `SENDER_NAME` and `SENDER_COMPANY` default to `NexOps`. Existing values are kept; `SENDER_ADDRESS` stays blank until independently confirmed. Fill the address only after confirmation (and optionally `REPLY_TO`).
5. Run **Send test email to myself only** (recipient is hard-wired to your account).
6. Run **Safety report** to confirm LIVE_SENDING is off.

## Apply sender defaults to the existing TEST CRM only

1. Open the [specified TEST CRM](https://docs.google.com/spreadsheets/d/12uDNmpfEANnzzTRoT6eyjmlNg1wj2B9f6BUPWH9X3pk/edit), then **Extensions → Apps Script**. Do not open the production CRM's editor.
2. Replace only the existing `Core` and `Main` file contents with this branch's
   `Core.js` and `Main.js`, then save. `Engine.js` and `appsscript.json` are unchanged;
   no additional OAuth scope or web-app deployment is required.
3. If script property `STOCKWISE_CRM_ID` is set, confirm it equals the TEST CRM ID
   above. The TEST function rejects any other ID/binding before a Sheets write.
   It uses the bound active spreadsheet, never opens a configured production file.
4. Run **`applyNexOpsSenderDefaultsToTestCrm`** from the editor. Alternatively reload
   the TEST spreadsheet and select **Stockwise Sales → TEST CRM: fill empty sender defaults**.
5. In TEST Settings confirm missing/empty `SENDER_NAME` / `SENDER_COMPANY` now show
   `NexOps`. Existing non-empty values and descriptions, address, `LIVE_SENDING`,
   `FOLLOW_UP_ENABLED` and every other row/tab must retain their prior values.
   Running again makes no further changes. The function returns added/filled key
   names only; no customer or sender values are logged.

Only genuinely empty cells or missing keys are filled. Formulas (even displaying
empty text), whitespace strings, numeric zero and false are retained. Duplicate
sender keys or incompatible Settings headers fail before any sender update. The
TEST-only function does not add missing address/switch rows, reset sheets, touch
queue/leads, install triggers or call Gmail. There is no need to run full setup,
queue processing or an email test for this change. Keep the existing sending flags
as they are; this utility does not toggle them.

Validation: Node VM tests exercise actual `Main.js` entry points with an in-memory
copy of the TEST spreadsheet schema, including wrong-production-ID refusal,
formula/value preservation and repeatability. They are not proof of execution in
the live Google TEST CRM; live confirmation is completed by steps 1–5 above.

## Sheet columns
Headers are created by Setup (see `Core.js` → `TABLES`). To add leads, fill at least: `company`, `contact_email`, `country` (JP/SG/AU), `contact_basis`, and `source_url` when the basis is `PUBLISHED_BUSINESS_CONTACT`. Leave `status` blank (becomes `NEW`).
`contact_basis` must be one of `PUBLISHED_BUSINESS_CONTACT`, `EXPRESS_CONSENT`, `EXISTING_RELATIONSHIP`, `INBOUND_REQUEST`.

## Daily flow
1. **Dedupe** (menu 3) → duplicates by email or company domain are marked `DUPLICATE`; only one contact per company is used. Free-mail addresses are blocked unless `ALLOW_FREEMAIL=TRUE`.
2. **Generate drafts** (menu 4) → one `DRAFT` per eligible lead in `EmailQueue`. Ineligible leads become `REVIEW_NEEDED` with reasons in `eligibility_note`.
3. **You review** each draft. To approve, set `approval_status=APPROVED` **and** type your name in `approved_by`. Editing subject, body or recipient after approval invalidates it (`EDITED_AFTER_APPROVAL`); re-approve.
4. **Process queue** (menu 5 or the hourly trigger). With `LIVE_SENDING=FALSE` passing rows become `DRY_RUN_OK` and nothing is sent.
5. **Check replies** (hourly): any reply stops follow-ups; "unsubscribe / 配信停止 / 不要です …" adds the address to `Suppression` and cancels queued mail; bounces suppress the address. Out-of-office replies are ignored. Quoted text from our own mail is ignored.

## Safety gates (all must pass per email)
approved by a named person and unchanged since · `LEGAL_REVIEW_COMPLETED=TRUE` · sender name+address set · opt-out line present · no banned claims (e.g. 永久無料, free forever, クレジットカード不要, 日本語対応) · valid business email, allowed country, documented contact basis · not suppressed · no duplicate send key · no other mail to the same company domain within `DOMAIN_COOLDOWN_DAYS` · weekday inside the send window · under `DAILY_SEND_LIMIT` and `RUN_SEND_LIMIT`.
A row is marked `SENDING` **before** Gmail is called and is never retried automatically. `FAILED` and stuck `SENDING` rows need a human to inspect Gmail "Sent" and reset or cancel them.

## Product claims
Until `SIGNUP_JOURNEY_VERIFIED=TRUE`, emails contain **no product link and no trial sentence**. Once enabled they say only "30-day free trial", "demo workspace", and that signup screens are currently in English. Post-trial terms are never mentioned.

## Go-live checklist (do not skip)
- [ ] Hosted signup journey verified in a real browser (preview first, then production) and `PRODUCT_URL` set
- [ ] Owner/counsel reviewed JP/SG/AU rules → `LEGAL_REVIEW_COMPLETED=TRUE`
- [ ] Sender identity filled; test email received and read
- [ ] A test reply containing "配信停止" from a second address of yours was detected and suppressed
- [ ] First batch ≤ 5 leads, each manually checked against `source_url`
- [ ] Only then set `LIVE_SENDING=TRUE`; keep `FOLLOW_UP_ENABLED=FALSE` until the first batch's replies are reviewed

## Known limits (be honest with yourself)
- **Never executed in a real Apps Script project yet.** Logic is covered by Node tests; Sheets/Gmail adapters (`Main.js`) and trigger behaviour are unverified until you run the install steps.
- Gmail via Apps Script cannot add a `List-Unsubscribe` header, so opt-out is **reply-based**. Unsubscribe replies from a different address than the one we mailed are not matched automatically; handle by adding a row to `Suppression` (type `email` or `domain`).
- Gmail/Apps Script daily quotas differ by account type and change; verify current limits and keep `DAILY_SEND_LIMIT` well below them. Defaults are 10/day, 5/run.
- Reply detection reads only threads of mails this script sent (last 60 days).
- Do not store passwords or API keys in Settings. The script needs none.
- The Buffer-based social workflow is untouched.

## Existing CRM compatibility
The previously created Stockwise Sales CRM uses human-readable headers (e.g. `Lead ID`) while this implementation requires snake_case (`lead_id`). The Setup command now **fails without modifying existing rows** when it detects populated incompatible tabs. Do not run this on the original CRM until a reviewed migration is available. Use a separate blank test spreadsheet for the first Apps Script smoke test. Do not copy personal contact data into the test sheet.

## GitHubからの安全な更新

[DEPLOYMENT.md](DEPLOYMENT.md) を参照。公式clasp、手修正の事前照合、暗号化バックアップ、初回TESTの手動承認、以後のTEST自動更新、本番の個別承認を用意しています。
初期状態は反映不可。設定・Googleコードの照合と手動承認が終わるまで、既存Apps Scriptを上書きしません。
`setSenderIdentityNexOps` はTEST CRMの空欄補完専用です。`verifyTestCrmDeployment` は読み取り確認専用で、メール送信やトリガー作成をしません。
