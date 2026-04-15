# StockWise v2 — Setup & Deploy Guide

## Quick Start (local)
```bash
bash setup.sh
```

---

## Supabase SQL

Open **SQL Editor → New Query**, paste everything below, click **Run**.

```sql
-- ① profiles (auto-created on signup)
CREATE TABLE IF NOT EXISTS profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ② skus
CREATE TABLE IF NOT EXISTS skus (
  id           BIGSERIAL PRIMARY KEY,
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name         TEXT NOT NULL,
  category     TEXT,
  supplier     TEXT,
  stock_qty    NUMERIC NOT NULL DEFAULT 0,
  daily_usage  NUMERIC NOT NULL DEFAULT 0,
  lead_time    INTEGER NOT NULL DEFAULT 7,
  safety_stock NUMERIC,
  moq          NUMERIC,
  unit_cost    NUMERIC,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, name)
);

-- ③ asns (Advance Shipping Notices)
CREATE TABLE IF NOT EXISTS asns (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  sku_id        BIGINT REFERENCES skus(id) ON DELETE CASCADE NOT NULL,
  qty           NUMERIC NOT NULL,
  eta           DATE NOT NULL,
  status        TEXT NOT NULL DEFAULT 'booked',
  supplier      TEXT,
  vessel        TEXT,
  bl_number     TEXT,
  origin_port   TEXT,
  dest_port     TEXT,
  confidence    NUMERIC DEFAULT 0.7,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ④ movements
CREATE TABLE IF NOT EXISTS movements (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  sku_id     BIGINT REFERENCES skus(id) ON DELETE CASCADE NOT NULL,
  qty        NUMERIC NOT NULL,
  date       DATE NOT NULL DEFAULT CURRENT_DATE,
  type       TEXT DEFAULT 'sale',
  ref        TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ⑤ subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
  id                     BIGSERIAL PRIMARY KEY,
  user_id                UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  stripe_subscription_id TEXT,
  stripe_customer_id     TEXT,
  plan                   TEXT NOT NULL DEFAULT 'free',
  status                 TEXT NOT NULL DEFAULT 'inactive',
  trial_end              TIMESTAMPTZ,
  current_period_end     TIMESTAMPTZ,
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);

-- ⑥ Row Level Security
ALTER TABLE profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE skus          ENABLE ROW LEVEL SECURITY;
ALTER TABLE asns          ENABLE ROW LEVEL SECURITY;
ALTER TABLE movements     ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own" ON profiles      FOR ALL USING (auth.uid() = id);
CREATE POLICY "own" ON skus          FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own" ON asns          FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own" ON movements     FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own" ON subscriptions FOR SELECT USING (auth.uid() = user_id);

-- ⑦ Auto-create profile + free subscription on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (id, email) VALUES (NEW.id, NEW.email) ON CONFLICT DO NOTHING;
  INSERT INTO subscriptions (user_id, plan, status) VALUES (NEW.id, 'free', 'active') ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_signup ON auth.users;
CREATE TRIGGER on_signup
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

---

## Supabase Auth Settings

1. Authentication → Settings
2. **Site URL** → `https://your-app.vercel.app`
3. **Redirect URLs** → add `https://your-app.vercel.app`

---

## Stripe Setup

### Create products
Dashboard → Products → Add product

| Product         | Price    | Billing |
|----------------|----------|---------|
| StockWise       | $49/mo   | Monthly |
| StockWise Pro   | $149/mo  | Monthly |
| Enterprise      | $499/mo  | Monthly |

Copy each **Price ID** (starts with `price_`) to your env vars.

### Webhook (production)
1. Stripe → Developers → Webhooks → Add endpoint
2. URL: `https://your-app.vercel.app/api/stripe-webhook`
3. Events: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
4. Copy **Signing secret** → `STRIPE_WEBHOOK_SECRET`

### Local webhook test
```bash
brew install stripe/stripe-cli/stripe
stripe login
stripe listen --forward-to localhost:5173/api/stripe-webhook
# copy whsec_... to STRIPE_WEBHOOK_SECRET in .env.local
```

### Test cards
```
Success:  4242 4242 4242 4242
Decline:  4000 0000 0000 0002
```

---

## Deploy to Vercel

### Option A — Web UI (recommended)
1. Push to GitHub (private repo OK)
2. https://vercel.com → **Add New Project** → import repo
3. Framework: **Vite** (auto-detected)
4. Add all env vars from `.env.example`
5. Click **Deploy**

### Option B — CLI
```bash
npm i -g vercel
vercel login
vercel --prod
```

### Environment variables to add in Vercel

| Variable | Source |
|----------|--------|
| `VITE_SUPABASE_URL` | Supabase → Settings → API |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Settings → API |
| `SUPABASE_URL` | Same as above |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API (service_role) |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe → Developers → API Keys |
| `STRIPE_SECRET_KEY` | Stripe → Developers → API Keys |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Webhooks → endpoint |
| `VITE_STRIPE_PRICE_BASIC` | Stripe → Products → StockWise price_id |
| `VITE_STRIPE_PRICE_PRO` | Stripe → Products → Pro price_id |
| `VITE_STRIPE_PRICE_ENTERPRISE` | Stripe → Products → Enterprise price_id |
| `STRIPE_PRICE_BASIC` | Same as VITE_ version |
| `STRIPE_PRICE_PRO` | Same as VITE_ version |
| `STRIPE_PRICE_ENTERPRISE` | Same as VITE_ version |
| `VITE_APP_URL` | Your Vercel URL (no trailing slash) |

---

## CSV Import format

```csv
name,stock_qty,daily_usage,lead_time,safety_stock,moq,unit_cost,supplier
Wireless Earbuds Pro,420,62,18,186,200,28.50,FoxconnSZ
Gaming Mouse RGB,85,98,14,294,500,12.80,PegatronTP
USB-C Hub 12-Port,1840,45,21,135,300,19.20,WiscomHK
```

---

## Plan comparison

| Feature | StockWise ($49) | StockWise Pro ($149) | Enterprise ($499) |
|---------|:-:|:-:|:-:|
| SKUs | 50 | Unlimited | Unlimited |
| Users | 1 | 10 | Unlimited |
| Dashboard | ✓ | ✓ | ✓ |
| LT Pipeline (12w) | ✓ | ✓ | ✓ |
| ASN Tracking (manual) | ✓ | ✓ | ✓ |
| 3PL / Warehouse integration | ✗ | ✓ | ✓ |
| Own logistics integration | ✗ | ✓ | ✓ |
| API / EDI ASN auto-import | ✗ | ✓ | ✓ |
| Slack alerts | ✗ | ✓ | ✓ |
| Vessel tracking API | ✗ | ✗ | ✓ |
| SLA 99.9% + CSM | ✗ | ✗ | ✓ |

---

## Business logic

| Metric | Formula |
|--------|---------|
| Days of Stock | `stock_qty ÷ daily_usage` |
| Reorder Point | `lead_time × daily_usage` |
| Safety Stock | `safety_stock` field or `daily_usage × 3` |
| Status: Critical | days < 7 |
| Status: Warning | 7 ≤ days < 14 |
| Status: Healthy | 14 ≤ days ≤ 45 |
| Status: Overstock | days > 45 |
| LT Pipeline | Week N stock = Week N-1 stock − (daily_usage × 7) + ASN inbound |
| WOS | `projected_stock ÷ (daily_usage × 7)` |
