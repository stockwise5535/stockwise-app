# Manual reviewed research to TEST CRM

This change connects the existing `runDailyCandidateResearch` and
`SalesEngine.importResearchCompanies` through a TEST-only adapter. It does not
change the production source configuration, scheduled workflow, enablement
variable, Apps Script deployment, mail queue or Mac worker.

Current acceptance target is the isolated spreadsheet
`1frj0e0YmGqOlGkEip6QNoTTI3oFHw3Tc_diCdT2j8TY`.
The shared original TEST ID is now rejected by the adapter and regression test.
Isolated live acceptance below supersedes the historical shared-sheet blocker.

## Reviewed source

The separate `research-sources.test.json` contains one Wikidata entity: Nintendo
(Q8093), a real Japanese consumer electronics company. This is a one-company
transport/deduplication acceptance sample, not a claim of SME fit or lead quality.
Its manufacturing segment is an explicitly reviewed sample classification.

Wikidata structured data are CC0:
https://www.wikidata.org/wiki/Wikidata:Licensing

API etiquette: https://www.mediawiki.org/wiki/API:Etiquette

The reader supplies a descriptive contact User-Agent, fetches sequentially,
never follows redirects or authenticates to sources, and reads one bounded
JSON entity. The existing generic JSON limit remains 32 KB; only the exact
Wikidata entity endpoint permits 512 KB. Entity ID, country and HTTPS website
are checked; missing/ambiguous country or unsupported formats fail closed.
Labels, country and official website are projected through existing APAC
candidate validation. Contact/person/email claims are discarded. No email is
guessed. Evidence remains unverified and never becomes permission to contact.

## TEST-only import

The adapter pins the known TEST spreadsheet ID and requires the actual 19
headers. It reads all Leads within A1:S2001 and the three exact Settings gates,
which must be explicitly false and unique. Missing/on/duplicate gates block.
It reuses the existing engine to stage a plan, rechecks sheet data and gates
before one append attempt, then verifies the real readback and unique keys.
No mail, queue or trigger API is exposed. Existing rows are never overwritten.
An unknown append result is not retried; inspect the sheet before any later run.
Use one manual operator; this is not a distributed lock against other editors.

Public source test:

```sh
node scripts/sales-test-research-import.mjs --research /private/tmp/research-result.json
```

The output file must be new and is written privately. A Google Sheets token
with permission to the TEST sheet can be supplied in an existing 0600 private
file through TEST_SHEETS_TOKEN_FILE (never put the token itself in argv/logs):

```sh
TEST_SHEETS_TOKEN_FILE=/private/tmp/private-sheets-token node scripts/sales-test-research-import.mjs --import /private/tmp/research-result.json
```

The CLI always targets TEST; it has no production-ID argument. `--plan` and
`--verify` accept private JSON snapshots from an authenticated connector as an
alternative operator-mediated transport. The plan contains only new rows, and
the same existing engine skips a repeated company/country key.

## Historical shared-TEST evidence: 2026-11-17

Source retrieval by the existing research function succeeded with one candidate.
Existing local Google CLI authentication returned 403 for Sheets, so the live
write used the already connected native Sheets transport, not the CLI HTTP
adapter. Actual TEST snapshots were processed by `--plan`, and its one new row
was applied through Sheets batchUpdate, followed by fresh native reads and
`--verify`. Rerunning the same data against the readback through `--plan` produced
zero new rows, so no second write was issued. Do not claim an unattended CLI
end-to-end run or Apps Script function execution from this evidence.

- Before: 165 lead IDs. After: 166 lead IDs.
- Added: Leads!A167:S167, Nintendo, JP, `R-b9e676a9c8766626`.
- Repeated data: inserted=0, skipped=1; one matching company/country key.
- New row: status=RESEARCH; contact name/email/basis and last_contacted_at blank;
  notes explicitly say outreach is not approved.
- Settings initially had LIVE_SENDING and LEGAL_REVIEW_COMPLETED=true. Under the
  requested TEST safety scope, only those two TEST values were set false.
  FOLLOW_UP_ENABLED was already false. All three were reread as false afterward.
- Existing rows, formulas, header layout and other tabs were preserved. Native
  CellData readback checked the added row and neighboring blank row; no styling
  or sheet-wide changes were applied. Browser rendering was unavailable.
- No production CRM access/write, emails/SNS, main merge or new schedule.

Relevant local tests: existing source checks, engine import tests and new bridge
tests (14 total) passed. OAuth/CLI transport remains a separate access limitation:
to use the standalone CLI later, authorize Google Sheets access for that account.
No credential is committed, and no production token is required.

### Later concurrent change: acceptance is blocked, do not restore automatically

A later final read on the same day found 215 lead IDs instead of 166 and no
matching Nintendo company/country key. The verifier failed, and replanning would
insert one row again. No such write was issued. The initial successful readbacks
above are historical evidence, not a claim that the row is still present.
Other updates are occurring in the shared TEST sheet; their author and purpose
were not established. Do not overwrite or restore rows automatically. The next
live acceptance needs an exclusive TEST write window (pause other import/edit
processes) before one controlled import/readback/replay. Unknown/concurrent
results must not be treated as success or retried blindly.

## Completed isolated acceptance: 2026-11-17

Created a new native spreadsheet from scratch:
https://docs.google.com/spreadsheets/d/1frj0e0YmGqOlGkEip6QNoTTI3oFHw3Tc_diCdT2j8TY/edit

Only the 19 Leads header strings were read from the shared TEST. Its data,
EmailQueue, backups, Apps Script and triggers were not copied. The new file has
exactly two tabs: Leads (537996327) and Settings (19032026). Settings contains
only LIVE_SENDING, FOLLOW_UP_ENABLED and LEGAL_REVIEW_COMPLETED, all boolean
false. No script, trigger or scheduled job was created or enabled.

The adapter's destination constant is pinned to the new ID. A fresh public
Wikidata fetch through `runDailyCandidateResearch` returned one unverified
Nintendo candidate with approvedToEmail=false. A temporary local RPC transport
passed each live read and the single append from the actual async
`importTestResearch` function to the connected native Sheets API. It did not
simulate reads or use the old sheet snapshots. The same function ran twice
against the same research data:

| Check | First call | Second call |
| --- | --- | --- |
| requested | 1 | 1 |
| inserted | 1 | 0 |
| skipped | 0 | 1 |
| readback matchedAfter | 1 | 1 |
| readback totalRows | 1 | 1 |
| approvedToEmail | false | false |

There was exactly one native write to Leads!A2:S2. The second call performed
fresh reads but no write. Serialized Leads header+row were identical before
and after replay, including IDs and timestamps. SHA-256:
`02be3d40fa6d96d2c5f8624557e029e313c69a4cc1ea9d99dd99798fad744fc1`.
The final independent CellData readback showed one row, status RESEARCH, blank
contact name/email/basis/last-contacted fields and explicit unapproved-outreach
notes. Settings remained false and the next Leads row was empty. No prior rows
or headers were overwritten. Native cell values and formatting were inspected;
browser rendering was unavailable.

Relevant 14 local tests passed, now including rejection of the original shared
TEST ID. The standalone HTTP CLI's OAuth scope limitation is unchanged; this
acceptance verifies the real async importer over connected Sheets transport,
not that separate HTTP authentication path. No human action is needed for this
completed isolated test. Shared TEST and production were not written during it.

## Canonical CRM correction and production hold (2026-11-21)

The old production designation was based on the spreadsheet title, not proven
sales ownership. The former 1kFsOx… destination is retired from this route.
The operational candidate 12uDN… (named TEST) has 77 SENT queue rows; three recent
message IDs match actual outgoing Gmail messages. This establishes real use.
The owner has now explicitly confirmed 12uDNmpfEANnzzTRoT6eyjmlNg1wj2B9f6BUPWH9X3pk
as the canonical CRM in this conversation. That exact ID is pinned in code and
crm-binding.json; every other ID, including the retired ID, is rejected.
productionWritesAuthorized remains FALSE independently of credential/review
readiness. No canonical spreadsheet write is authorized. Production transport
still stops for missing independent review/credential confirmation. PR #32
had no independent reviews at HEAD 284185900cf8b083ab3d10612981dc42ddc36092.

The isolated spreadsheet remains the sole authorized live-write target. On
2026-11-21 the updated registration function appended Onfleet (US), read back
three total rows, then replayed with zero additional rows. Both prior rows and
all replayed values were unchanged. Snapshot SHA-256:
`2a4a692df8cef1fb67ab0966a52d757464610f509756e50d7a299d5cc42300a5`.
LIVE_SENDING, FOLLOW_UP_ENABLED and LEGAL_REVIEW_COMPLETED remained FALSE.
No shared TEST/operational/old production sheet was written in this pass.

Production uses its own `stockwiseResearchRoute` developer-metadata gate:
`spreadsheetId=<owner-confirmed ID>, enabled=true, emailSending=false,
snsSending=false, followUp=false`. No gate has been installed. Setting enabled
false stops this route only. The route does not require switching off or changing
an existing sender's Settings. Writes remain restricted to Leads append and
research claims/day slots. Existing rows, EmailQueue, ActivityLog, Suppression,
settings and triggers are never updated. Domain deduplication supplements the
existing company/country deduplication. One registration/UTC day remains the
initial cap. Durable claims and no write retries remain unchanged. External
editors can still change rows; missing claimed rows stop rather than restore.

Dedicated service-account authentication is supported, Sheets scope only, no
user/domain delegation and no fallback to the existing clasp OAuth credential.
No service account/project/secret has been created or installed. gcloud and
Google Cloud administration integration are unavailable in this session; the
existing OAuth client has no confirmed Cloud administration authorization.
Its known Sheets SERVICE_DISABLED error does not prove the new dedicated
project is configured. An owner must provide access to a separate Cloud project
with Sheets API enabled and a dedicated principal. Initially share only the
isolated spreadsheet; validate access there before requesting canonical CRM
sharing. Keep JSON keys in a private local file/GitHub secret, never in chat,
source control or logs. Do not change existing OAuth clients or sender identity.

## Continuous discovery and sales handoff

Registration no longer uses the two fixed entity samples. The dedicated profile
queries the official free CC0 Wikidata query service, with sequential bounded
requests, current source-permission reviews and CRM-domain/entity exclusion.
Regional scope is SG/NZ/KR/TH/VN/MY; existing JP/AU validation remains supported.
Worldwide inventory consultants, supply-chain services and AI partner research
are admitted to the research policy; sender eligibility settings are unchanged.
Keyset paging continues past known domains. Up to 50 new research candidates can
be staged per run, not 50 verified/consented sales leads. Source errors fail the
registration run; no partial or stale result is registered.

Actual discovery initially returned 17 supply-chain companies. Disabling the
Wikidata v1 query optimizer as documented returned 17 supply-chain and 17 AI
candidates, with a regional timeout. The final six-country query completed: 50 distinct research candidates
(17 regional, 17 supply-chain, 16 AI). None is sales-approved; no 50/day
qualified lead capacity or production operation is claimed. A second actual
query excluded all first-batch entities/domains and returned another 50, with
zero overlapping domains. This is a next-run simulation, not consecutive-day
production evidence. Wikidata structured facts
are CC0; the v1 endpoint is still officially offered alongside v2. The new v2
endpoint rejected this User-Agent, so the documented current v1 endpoint is
configured explicitly, without a hidden endpoint fallback.

Official company verification is separate: recent matching homepage/business
and contact-page evidence is required before production registration. Onfleet's
homepage, contact page and partnership program were read; commercial fit is a
hypothesis, not a claim that it wants to buy/resell Stockwise. Published enquiry
pages do not create email consent or legal approval. Reviewed facts are carried
in owner_notes; contact_email/contact_name/contact_basis remain empty and status
remains RESEARCH. The existing Engine generates drafts only for NEW or
REVIEW_NEEDED, so these entries do not enter its sending queue. Sales must review
fit, jurisdiction, contact permission, suppression/reply history and campaign
approval separately through its existing process. No automatic promotion exists.

Production pilot, durable daily operation, actual 50 qualified leads/day,
independent review and delivery to the sales team are NOT complete. No main
merge, deployment, scheduler activation, production CRM change or send occurred.

## Dedicated authentication preparation follow-up

The new scripts/sales-sheets-auth-check.mjs accepts one private, owner-only
service-account JSON file (0600), requests spreadsheets.readonly, and uses a
read-only transport pinned to the isolated spreadsheet. It never reads/writes
the canonical CRM or stores tokens. It checks existing isolated schema and OFF
gates using GETs only, then prints aggregate booleans. A write attempt on this
client is rejected before HTTP. No real credential has yet been supplied or
tested. Existing clasp/user OAuth is not loaded or modified.

GitHub currently lists only the PR author as a collaborator; PR #32 has no
independent reviews or outstanding review requests. No self-review is counted
as independent approval. A separate reviewer must review the final HEAD and
production binding, write prohibition, dedicated credential identity, append
transactions/no retries, and separation from the active sender before any
production start. Existing passing live registration/discovery probes were not
repeated for this configuration/authentication-only change.

The owner supplied dedicated project ID stockwise-lead-intake and reported that
Sheets API is enabled there. Record that report separately from live API
verification (still false). No service-account identity/credential has been
confirmed. The isolated dedicated-auth probe now also rejects credentials from
other projects before requesting a token. Production writes and new-route
sending remain false; no existing OAuth/CRM data/history/settings are changed.

Next Google-side owner action only: create service account ID
stockwise-lead-intake in that dedicated project, with no project IAM roles or
domain-wide delegation, and return its email address. Do not create/share a key
or grant CRM access in this step. Live API/authentication verification and
independent review remain pending.

## Priority change: approved sales email pilot (2026-11-22)

The owner made actual sales email the priority. The existing Gmail connection
and actual English sent copy were read and retained, not replaced. Actual From
is Ryan S <nexops2026test@gmail.com>. The bound Apps Script belongs to that
account and canonical spreadsheet; remote Main/Engine match the previous
checkout, while Core differs only in research-import country permissions.
No remote code, property, spreadsheet, trigger or send was changed.

The current unsent queue has five APPROVED/READY Canadian rows with older copy.
Canada is outside current allowed SG/NZ/UK. Current legal gate is FALSE and
daily50/run10 conflict with code hard limits10/5. Do not rename READY to QUEUED
or turn switches on to force them through. These five are not the pilot.

The structured pilot-proposal.json contains three new Singapore business
contacts and fully resolved bodies for owner review, still DRAFT/unauthorized.
Official contact/business pages and current Gmail/CRM/Suppression were checked.
One initially considered recipient already had a Gmail sent receipt absent
from the CRM snapshot and was excluded. The English copy comes from actual
sent message 1a203fe94895ec57; only company names and one existing contact-email
footer line differ. Public B2B contact is not treated as express consent.

Independent technical review found missing durable SENDING persistence, stale
approval snapshots and unpinned From. Development Main/Engine now persist
ScriptProperties intent, flush/read back SENDING before Gmail, re-read each
queue/lead/settings/suppression, bind expected From email/display name, verify
actual sent identity/body plus receipts, and halt uncertain results without
retry. READY is supported without modifying old queue rows. Actual Gmail
prior-contact/daily counts supplement stale CRM counts. Queue/Lead IDs are
re-resolved after Gmail before recording receipts, but external structural
edits still require coordination; ScriptLock cannot stop other APIs/editors.
Hourly processing stays OFF until separate post-pilot recurring approval.

The actual Gmail query returned at least100 sent messages for the current local
day, and another ChatGPT sender remains unidentified. A pre-send count is not
a shared atomic quota: a global ten-per-day guarantee requires that sender's
task/instructions to be identified and coordinated. No task was stopped.
Pilot must use an available permitted day/window after that condition is met;
do not treat owner content approval as permission to exceed the daily cap.

After explicit owner approval, the application scope is selective Main/Engine
replacement in the existing bound Apps Script, preserving Core, manifest, all
custom files and existing properties. sending-patch.review.json records the
current/prepared hashes and OFF authorizations. Fresh source drift requires
reconciliation; an unknown write result is never retried. Before arming, read
existing launch review, expected sender, unresolved deliveries and trigger
state. Only missing, specifically reviewed settings may be changed: proposed
daily10/run3, scoped three-message approval and country launch review. The
master LIVE flag is already TRUE; follow-ups stay FALSE; no bulk TRUE operation.
No new Gmail connection, Vercel deployment or paid API is part of this proposal.

CRM-specific review also fixed stale-review/source binding and pre-write row
capacity handling. Daily CRM registration is not claimed ready: official-review
supply still has only Onfleet, so subsequent registration awaits fresh reviews.
Production writes remain FALSE and review status is pending/conditional.

The Desktop duplicate key is outside Git (git reports not a repository) but
is the same inode as its iCloud Desktop path, and Desktop/Documents iCloud
sync settings are enabled. Actual upload/deletion history is unverified. The
duplicate is mode644; the configured local key is inside a700 directory and
is600. No key contents were displayed, files deleted, or keys revoked. Replace
the synchronized credential before any expansion to production Sheets access;
this does not require rebuilding the existing Gmail connection.
