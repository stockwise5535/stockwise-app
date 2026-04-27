-- StockWise v3 — Supabase SQL
-- SQL Editor に全文貼り付けて Run をクリック

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS skus (
  id           BIGSERIAL PRIMARY KEY,
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name         TEXT NOT NULL,
  superset     TEXT, subset TEXT, category TEXT, supplier TEXT,
  stock_qty    NUMERIC NOT NULL DEFAULT 0,
  daily_usage  NUMERIC NOT NULL DEFAULT 0,
  lead_time    INTEGER NOT NULL DEFAULT 7,
  safety_stock NUMERIC, moq NUMERIC, unit_cost NUMERIC,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, name)
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id                     BIGSERIAL PRIMARY KEY,
  user_id                UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  stripe_subscription_id TEXT, stripe_customer_id TEXT,
  plan                   TEXT NOT NULL DEFAULT 'free',
  status                 TEXT NOT NULL DEFAULT 'inactive',
  current_period_end     TIMESTAMPTZ,
  updated_at             TIMESTAMPTZ DEFAULT NOW(),
  created_at             TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE skus          ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own" ON profiles;
DROP POLICY IF EXISTS "own" ON skus;
DROP POLICY IF EXISTS "own" ON subscriptions;

CREATE POLICY "own" ON profiles      FOR ALL USING (auth.uid() = id);
CREATE POLICY "own" ON skus          FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own" ON subscriptions FOR SELECT USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (id, email) VALUES (NEW.id, NEW.email) ON CONFLICT DO NOTHING;
  INSERT INTO subscriptions (user_id, plan, status) VALUES (NEW.id, 'free', 'active') ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_signup ON auth.users;
CREATE TRIGGER on_signup AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();
