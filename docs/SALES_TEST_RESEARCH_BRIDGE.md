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
