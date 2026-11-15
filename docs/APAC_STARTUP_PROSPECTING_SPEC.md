# APAC Startup Prospecting Spec

Purpose: Shared prospecting definition for Stockwise / NexOps. Codex, Claude Code, and scheduled sales research must use this file as the source of truth for APAC startup lead discovery.

## Target companies

Prioritize APAC startups and growth companies that:
- operate in APAC or sell primarily into APAC;
- handle physical products, inventory, procurement, purchase orders, suppliers, inbound lead times, or replenishment;
- are likely to benefit from Stockwise inventory / PO / supplier operations workflows.

Priority geographies:
1. Japan
2. Singapore
3. Australia
4. South Korea
5. Taiwan
6. Hong Kong
7. Other Southeast Asia

Priority business types:
- D2C brands
- e-commerce brands
- consumer goods
- hardware
- manufacturing
- wholesale
- import / distribution
- retail
- logistics-adjacent businesses

Prefer Seed through Series B/C, or small-to-mid-sized growth companies where operations are becoming more complex. If stage, funding, or headcount is not verified, record `unverified`; never infer.

Exclude initially:
- large listed enterprises;
- very large incumbent companies;
- pure SaaS businesses with no meaningful inventory/procurement workflow;
- companies with no clear APAC operating relevance.

## Required fields

Every prospect record should include:
- company_name
- country
- official_url
- root_domain
- business_model
- startup_evidence_url
- startup_stage_or_size
- stockwise_fit_reason
- inventory_or_procurement_signal
- public_business_email_or_contact_form
- contact_basis
- contact_source_url
- source_type
- verification_level
- researched_at

Optional useful fields when verified:
- city
- year_founded
- funding_round
- employee_range
- product_category
- ecommerce_platform
- supplier_or_import_signal
- notes

## Verification

Use public sources only.

Verification levels:
- A: company-owned or first-party source confirms the company and relevant business facts.
- B: government, trade association, accelerator, investor portfolio, or similarly authoritative third-party source.
- C: general directory, media list, aggregator, or other third-party source.

Do not upgrade B/C to A without a first-party source.

For startup status, acceptable evidence includes:
- company about/team/careers pages;
- accelerator/incubator portfolio;
- investor portfolio;
- reputable funding announcement;
- official registry/industry source where appropriate.

If a fact cannot be verified, record `unverified` rather than guessing.

## Contact rules

Allowed:
- public business email published by the company;
- official contact form;
- role-based sales/general/business contact where the source and purpose are clear.

Do not use:
- guessed email patterns;
- personal emails unless explicitly published for business contact and appropriate for outreach;
- no-reply addresses;
- billing-only addresses;
- scraped email databases as the sole source;
- example/template addresses.

Always save the contact evidence URL and `contact_basis`.

## Deduplication

Before adding a new prospect, compare against the existing CRM/ledger using:
1. normalized company name;
2. root domain;
3. verified business email when present.

Do not delete existing prospects just because they fall outside the current priority segment. Segment them instead.

## Accumulation policy

The list is cumulative.

The safety cap is a maximum of 20 newly added prospects per research run, not 20 total prospects.

Targets:
- first milestone: 100 qualified APAC startup prospects;
- second milestone: 300 qualified prospects;
- continue accumulating after that while maintaining dedupe and verification quality.

## Stockwise fit

A good prospect should show one or more signals such as:
- many SKUs;
- imported products;
- multiple suppliers;
- long or variable lead times;
- wholesale + D2C channels;
- replenishment complexity;
- purchase-order workflows;
- stockout / overstock exposure;
- supplier coordination;
- inbound shipment tracking.

The `stockwise_fit_reason` must be evidence-based and specific to the company. Do not fabricate internal pain points.

## Outreach readiness

Research and outreach are separate states.

A prospect may be marked send-ready only when:
- the business contact is verified from a public source;
- contact_basis is recorded;
- the prospect is not suppressed / opted out;
- duplicate / 24-hour send rules pass;
- the approved template_id and content_hash match;
- sender identity and existing Gmail safety checks pass.

New AI-generated outreach copy is not auto-approved.

## Shared-agent instruction

When Codex or Claude Code is asked to "find more Stockwise target companies", "research APAC startups", or similar:
1. read this file first;
2. use these fields and verification levels;
3. do not redefine the ICP unless explicitly instructed;
4. preserve the 20-new-prospects-per-run cap;
5. return a machine-readable list plus a short summary;
6. distinguish verified facts from unverified fields;
7. never send outreach merely because research succeeded.

Recommended machine-readable shape:

```json
{
  "companies": [
    {
      "company_name": "",
      "country": "",
      "official_url": "",
      "root_domain": "",
      "business_model": "",
      "startup_evidence_url": "",
      "startup_stage_or_size": "unverified",
      "stockwise_fit_reason": "",
      "inventory_or_procurement_signal": "",
      "public_business_email_or_contact_form": "",
      "contact_basis": "",
      "contact_source_url": "",
      "source_type": "",
      "verification_level": "A|B|C",
      "researched_at": ""
    }
  ]
}
```
