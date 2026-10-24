# Current state audit

Base: `165704566b97fcf589dd269e7b86b6e48ef4b843` (Limit free demo to one item).
Initial `git status --short` was empty. Work is isolated on `codex/managed-service-mvp`; no reset, deployment, or production configuration changes.

## Routes and functionality
The Vite React SPA has no router. `/` renders AuthProvider and App. Dashboard and heatmap are state-driven tabs, not URLs. Success/Cancel and PricingModal components exist but are not mounted by main.jsx. The selected revision retains the one-product free-demo CSV restriction.

App.jsx contains inventory, product/supplier aggregation, 13-week forecast and inbound plans, actual consumption and forecast variance, supplier comparison, reorder/order simulation, suggested orders and CSV exports. Existing panels, alerts, bilingual copy, and simulation logic must remain intact. Some dashboard totals use synthetic fallback constants; these must not be treated as verified business metrics by new operations screens.

## Data and CSV
Supabase `skus` has user_id, name, supplier, superset/subset, stock_qty, daily_usage, lead_time, safety_stock, moq and unit_cost. The supplied SQL has profiles and subscriptions, RLS keyed by auth.uid(), and a signup trigger. No customer membership, workspace, exception, action, approval, or audit-event tables exist.

Ignored/local browser storage keys `stockwise_items_<user>`, `stockwise_inbound_<user>`, `stockwise_forecast_<user>`, `stockwise_actual_<user>` augment database rows. Existing fetchSkus can mix sample fallbacks with user data. CSV reading supports Japanese/English headers, alternate encoding, SKU/supplier merge, weekly inbound, forecast and actual uploads, templates and order-plan exports. Preserve these paths and their current unit conventions; do not reinterpret actual consumption in the new demo engine.

## Authentication and services
Supabase email/password authentication and AuthProvider guard the legacy application. src/supabase.js eagerly creates the client, requiring VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. Neither is configured in this machine. Missing values throw before rendering. Vite does not run Vercel api handlers. Server-side Stripe checkout/save handlers require separate credentials; the webhook is a minimal receiver, not a production entitlement system.

## Reuse and limitations
Keep App's heatmap, forecasting, supplier panels, CSV modals, authentication and i18n intact. New operations components will be separate modules with no third-party dependencies. The new explicit `/demo/operations` route will load without importing Supabase or bypassing authentication for any real data. The signed-in app will default to TODAY with clearly separated synthetic operational data and retain both legacy tabs.

There is no configured lint, typecheck, or test runner. Add built-in Node tests for new exception rules. No homepage repository is present under /workspace; homepage changes are deferred, not simulated in an unrelated repository.

NOT PRODUCTION READY — MULTI-TENANT RBAC REQUIRED. Browser filters and local demo history are not access controls or a durable audit log. A later phase must implement server-enforced workspace memberships, authorized transitions and persistent events before real multi-customer use. Do not add a supplier portal, autonomous agents, commercial execution, or production deployment in this phase.
