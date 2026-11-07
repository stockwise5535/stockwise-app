-- AI-suggested APAC companies are research leads, never email contacts.
-- Apply separately after review. No trigger or automatic sending.
create table if not exists public.sales_research_candidates (
 id uuid primary key default gen_random_uuid(),
 country_code text not null check(country_code in ('JP','SG','AU')),
 company_name text not null check(length(trim(company_name)) between 2 and 200),
 segment text not null check(segment in ('manufacturing','import_wholesale','ecommerce','sme','startup')),
 official_website text not null,
 official_domain text not null,
 evidence_urls jsonb not null check(jsonb_typeof(evidence_urls)='array'),
 ai_provider text not null check(ai_provider in ('openai','anthropic')),
 research_status text not null default 'unverified' check(research_status in ('unverified','verified','rejected')),
 approved_to_email boolean not null default false check(approved_to_email=false),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(country_code,official_domain)
);
alter table public.sales_research_candidates enable row level security;
revoke all on public.sales_research_candidates from anon,authenticated;
create index if not exists sales_research_candidates_status_idx
 on public.sales_research_candidates(research_status,created_at desc);
