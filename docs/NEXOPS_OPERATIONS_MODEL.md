# Operations interfaces and next-phase boundaries

This is the first review checkpoint: audit, TODAY and Exception Inbox. The operational store is **synthetic only**. It never adapts legacy `items` because those may contain real user records mixed with historical demo fallbacks. Wiring live inventory requires explicit provenance and authenticated, authorized workspace queries.

## Current records
- Workspace/customer: `{id, name}`. IDs are attached to each demo SKU, PO, action, decision and exception. Filtering is display functionality, not authorization.
- SKU: `{id, customerId, name, supplier, stock, dailyDemand, safetyStock, leadTime, updatedAt}`. Units in this demo engine are explicitly daily consumption.
- PO/supplier update: `{id, customerId, skuId, supplier, promisedDate, expectedDate, confirmedQty, availableQty, lastUpdate, delayReason, followUpStatus, risk}`.
- Exception: stable `{id, customerId, customer, severity, type, skuId, poId, supplier, issue, reason, impact, nextAction, daysToImpact, underlying, dataTimestamp, updatedAt, owner, dueDate, status, source, history[]}`.
- Activity event: `{at, actor, text}`. Browser-only demo annotations; mutable by the browser owner, not an authoritative audit trail. The original evidence and data timestamp remain unchanged on review edits.
- Seeded action: `{id, customerId, skuId, supplier, description, owner, dueDate, status, approvalRequired}`. Used only for demo counts and overdue detection; no Action Tracker UI or write service yet.
- Seeded decision: `{id, customerId, skuId, supplier, actionId, status, recommendation, reason, supportingData, expectedImpact, approver}`. Pending-decision example only; no customer approval is collected or executed.

## Rules and status semantics
Rules derive stock coverage from stock / dailyDemand, compare coverage to lead time, flag stock below safety threshold and above 56 days, compare promised/expected PO dates, flag supplier silence beyond seven days, overdue actions and pending decisions. Stable exception IDs include customer, record and type. A resolved inbound example is explicitly seeded; it is excluded from open counts. All 13 requested exception categories and eight statuses are available to filters/interfaces. Late Inbound detection, Lead-Time Deviation, Demand Spike and Forecast Deviation require source data and are not implemented as live monitoring rules.

Cards reflect selected customer; remaining filters apply to queue. At-risk PO count deduplicates PO IDs; supplier updates counts PO update records within 24 hours of the dataset reference timestamp. TODAY excludes resolved/snoozed; inbox includes them. Due-date filtering includes the full UTC date. Negative days to impact indicates the threshold is already past. Resolved/snoozed are manual demo annotations; automatic reopening/snooze expiry is not implemented. Dataset reference time is retained on reload, deliberately not a live service clock.

## Persistence
Only `nexops_synthetic_operations_v1` is written. No legacy key is modified. Snapshot version/source and basic IDs/status/history shape are checked; malformed storage falls back to a fresh fixture. Storage denial yields a visible warning. The demo can be reset by deleting that single key in browser tools. This does not log a user into Supabase and must never be used for confidential information.

## Mandatory production foundation — not implemented
NOT PRODUCTION READY — MULTI-TENANT RBAC REQUIRED.

Before real use, add workspaces, workspace_memberships, operator_assignments, suppliers, purchase_orders, import_batches, exceptions, actions, customer_decisions and immutable decision/activity events. Every business record must have a non-null workspace_id with composite foreign keys preventing cross-workspace relationships. Enforce memberships on every server query and write via RLS and server-side authorization. Roles planned: Nexops Admin, assigned Nexops Operator, Customer Admin, Customer Viewer, Customer Approver, future Supplier User. Suppliers must only see explicitly authorized records. Frontend customer selection must never grant access.

Future import_batches should retain workspace, source filename, import timestamp, data period, validation status and validation errors. A Data Health service should report missing/duplicate SKU, supplier/lead-time gaps, invalid dates, negatives, forecast gaps, stale data and unmapped suppliers before any operational risk calculation. Existing legacy CSV handling is unchanged in this checkpoint.

## Agent boundary
Planned interfaces are pure proposals: Data Health validates; Monitoring detects; Operations recommends actions; Supplier Follow-Up drafts; Weekly Reporting summarizes structured facts. The deterministic `detectExceptions(data)` function is the initial monitoring boundary, not an autonomous agent. Outputs require human review. No component sends supplier instructions, changes POs/suppliers, commits spending or grants customer approval. Future action transitions and customer decisions need server-recorded actor, original recommendation, changes, final action, timestamp, resolution and outcome. AI must never supply operational counts.
