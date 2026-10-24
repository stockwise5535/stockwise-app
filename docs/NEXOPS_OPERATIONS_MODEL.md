# Operations interfaces — Phase 2

All records are synthetic. The authoritative UI snapshot is `{version:2, data, rows, reports}` under the existing `nexops_synthetic_operations_v1` browser key. Migration retains valid Phase 1 exception edits/history and seeded action/decision IDs. The existing inventory/forecast browser keys are never read or written by this module.

## Shared entities and links
- `data.customers`: fictional `{id,name}` records. Customer filters are UI scope, never authorization.
- `data.skus`: `{id,customerId,name,supplier,stock,dailyDemand,safetyStock,leadTime,updatedAt}`. Explicit daily demand units.
- `data.pos`: `{id,customerId,skuId,supplier,status,promisedDate,expectedDate,confirmedQty,availableQty,lastUpdate,delayReason,followUpStatus,risk,history[]}`. Monitoring derives nonnegative delay days; current fixture POs are Open. Each supplier card counts open POs within the same customer and supplier.
- `rows`: existing exceptions `{id,customerId,customer,severity,type,skuId,poId,supplier,issue,reason,impact,nextAction,daysToImpact,underlying,dataTimestamp,updatedAt,owner,dueDate,status,source,history[]}`.
- `data.actions`: `{id,customerId,exceptionIds[],type,skuId,poId,supplier,description,owner,createdAt,dueDate,priority,status,approvalRequired,updatedAt,resolution,history[]}`. Exception/action relation is owned by action.exceptionIds only, supporting many-to-many links without storing a second reverse list.
- `data.decisions`: `{id,actionId,customerId,skuId,supplier,recommendation,reason,supportingData,expectedImpact,status,modifiedAction,approver,approvalTimestamp,createdAt,updatedAt,history[]}`. The latest proposal in append order governs the action; older proposals remain visible and read-only. Action.customerDecision is derived, not duplicated.
- `reports`: comparison baselines `{id,customerId,at,endDate,records:{exceptions[],actions[],decisions[],suppliers[]}}`. These are historical field snapshots, not competing live state. A baseline from another customer scope cannot be used in the comparison.

Every child edit calls a pure operation with the current shared snapshot. Form inputs and report selection are local drafts, not operational stores. No source record is updated during report generation.

## Mutation and history rules
Creation, linking and action review append action/exception activity. Decision reviews append `{at,actor,text,from,to,originalRecommendation,reason,changes,finalAction}`. Requesting a revised proposal preserves the old proposal and creates a new Pending record. Approve/Modify authorize only a demo option; they return the action to Open and execute nothing. Reject places it on hold; Defer waits for customer review. Required approval cannot be removed; progress/resolution requires the latest Approved/Modified decision. Resolved actions must reopen before revising the decision. Resolution needs text and is shown alongside decision history.

Supplier updates append before/after facts, update lastUpdate and reconcile only that PO's Late PO / Supplier Delay / Supplier No Response evidence and status. Unrelated exception records and reviews remain intact. No inventory or legacy forecast recalculation is performed. Action/decision changes reconcile their corresponding overdue/decision exceptions without rebuilding inventory exceptions. Manual exception statuses cannot override the action approval checks or TODAY's authoritative pending-decision count.

## Reports and time
Weekly reports show current backlog plus new/resolved activity in the inclusive selected UTC week. They are explicitly not historical inventory reconstructions. Upcoming deadlines cover the seven days after the week end; overdue actions are separately listed. Change comparisons include fields and history counts so same-timestamp edits are still detected. No baseline is fabricated; user-saved snapshots provide actual comparison data. Reports are customer-scoped, printable using browser CSS, and never use AI for operational numbers.

Synthetic fixture `data.asOf` remains its source timestamp. New edits have their own timestamps. Reload does not rerun a live monitoring clock. Automatic snooze expiry, timed scans and inventory reconciliation are not implemented.

## Persistence and safety limits
Browser-local persistence is not durable shared storage, an immutable audit trail or authenticated approval. Typed demo approver names do not verify customer identity. A browser owner can alter every record. Source/shape checks and fallback protect ordinary demo loading; they are not a security boundary. Keep confidential data out. The public demo path lazily avoids importing the legacy Supabase client and makes no external requests in tested flows.

NOT PRODUCTION READY — MULTI-TENANT RBAC REQUIRED. No production tenancy has been implemented. Before real use, separately design workspace memberships/assignments, composite workspace foreign keys, RLS/server authorization, verified approvers, transactional transitions, concurrency and server events. Future roles may include Nexops Admin/Operator, Customer Admin/Viewer/Approver and Supplier User, but they are not granted by this prototype.

## Deferred interfaces and agents
Future import batches should retain customer/source filename/import date/data period/validation status/errors. Data Health should validate required/duplicate SKU, supplier/lead-time gaps, dates, negatives, forecast gaps, freshness and mappings before monitoring real data. Existing legacy CSV behavior remains unchanged.

Future Data Health, Monitoring, Operations, Supplier Follow-Up and Weekly Reporting agents may validate/detect/recommend/draft only. Phase 2 adds deterministic workflows, not autonomous agents. No email, ERP, supplier login, commercial execution, price commitments or deployment is included.
