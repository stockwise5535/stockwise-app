# StockWise v3 — デプロイチェックリスト
## GitHub → Vercel → Supabase → Stripe 全手順

---

## ✅ STEP 1 — GitHub にpush

```bash
# プロジェクトフォルダで実行
cd stockwise-v3

# Gitが未初期化の場合
git init
git add .
git commit -m "StockWise v3 — Arial redesign"
git branch -M main

# リモートを設定（既存リポジトリ）
git remote set-url origin https://github.com/あなたのユーザー名/stockwise-app.git
# または新規追加
git remote add origin https://github.com/あなたのユーザー名/stockwise-app.git

git push -u origin main
```

**確認:** GitHubのリポジトリページに以下が表示されればOK
```
✅ package.json
✅ vercel.json
✅ src/
✅ api/
✅ index.html
```

---

## ✅ STEP 2 — Supabase セットアップ

### 2-1. プロジェクト作成
1. https://supabase.com → **New project**
2. Name: `stockwise`
3. Region: **Northeast Asia (Tokyo)**
4. パスワードを設定（メモしておく）

### 2-2. SQL実行（テーブル作成）
1. Supabase → **SQL Editor** → **New Query**
2. `SUPABASE_SQL.sql` の内容を全文コピーして貼り付け
3. **Run** をクリック
4. 「Success」が表示されることを確認

**作成されるテーブル:**
- `profiles` — ユーザープロファイル
- `skus` — 在庫SKU（superset/subset含む）
- `ssns` — SSN（Stockwise Serial Number）
- `movements` — 入出庫履歴（Pro限定）
- `subscriptions` — サブスクリプション管理

### 2-3. Auth設定
1. Supabase → **Authentication** → **Settings**
2. **Site URL** → `https://あなたのアプリ.vercel.app`
3. **Redirect URLs** に追加 → `https://あなたのアプリ.vercel.app`

### 2-4. APIキーをコピー
場所: Supabase → **Settings** → **API**

| 環境変数名 | Supabaseでの場所 |
|-----------|----------------|
| `VITE_SUPABASE_URL` | Project URL |
| `SUPABASE_URL` | Project URL（同じ値） |
| `VITE_SUPABASE_ANON_KEY` | anon public |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role（⚠️ 公開禁止） |

---

## ✅ STEP 3 — Stripe セットアップ

### 3-1. 2つのプランを作成
https://dashboard.stripe.com → **Products** → **Add product**

| プラン | 金額 | 請求 | 環境変数 |
|--------|------|------|---------|
| StockWise | $49/月 | Monthly | `VITE_STRIPE_PRICE_BASIC` |
| StockWise Pro | $149/月 | Monthly | `VITE_STRIPE_PRICE_PRO` |

各商品の **Price ID** (`price_xxx`) をコピーしておく

### 3-2. APIキーをコピー
場所: Stripe → **Developers** → **API Keys**

| 環境変数名 | Stripeでの場所 |
|-----------|--------------|
| `VITE_STRIPE_PUBLISHABLE_KEY` | Publishable key (pk_live_...) |
| `STRIPE_SECRET_KEY` | Secret key (sk_live_...) |

### 3-3. Webhook設定（本番用）
1. Stripe → **Developers** → **Webhooks** → **Add endpoint**
2. URL: `https://あなたのアプリ.vercel.app/api/stripe-webhook`
3. Events to listen:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
4. **Signing secret** をコピー → `STRIPE_WEBHOOK_SECRET`

### 3-4. テスト用カード番号
```
成功:   4242 4242 4242 4242  (任意の将来日付, 任意のCVC)
失敗:   4000 0000 0000 0002
```

---

## ✅ STEP 4 — Vercel デプロイ

### 4-1. Vercel でプロジェクトインポート
1. https://vercel.com → **Add New → Project**
2. GitHubリポジトリを選択
3. 以下を設定:

| 設定項目 | 値 |
|---------|-----|
| **Framework** | Vite |
| **Root Directory** | **空欄のまま** |
| **Build Command** | `npm run build` |
| **Install Command** | `npm install` |
| **Output Directory** | `dist` |

### 4-2. 環境変数を追加
**Settings → Environment Variables** に以下を全部入力:

```
# Supabase（必須）
VITE_SUPABASE_URL          = https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY     = eyJ...
SUPABASE_URL               = https://xxxx.supabase.co   ← 同じ値
SUPABASE_SERVICE_ROLE_KEY  = eyJ...（service_roleキー）

# アプリURL（必須）
VITE_APP_URL               = https://あなたのアプリ.vercel.app

# Stripe（決済機能が必要な場合）
VITE_STRIPE_PUBLISHABLE_KEY = pk_live_...
STRIPE_SECRET_KEY           = sk_live_...
STRIPE_WEBHOOK_SECRET       = whsec_...
VITE_STRIPE_PRICE_BASIC     = price_...
VITE_STRIPE_PRICE_PRO       = price_...
STRIPE_PRICE_BASIC          = price_...   ← VITE_と同じ値
STRIPE_PRICE_PRO            = price_...   ← VITE_と同じ値
```

### 4-3. Deploy
**Deploy** をクリック → 約2分で完了

---

## ✅ STEP 5 — デプロイ後の確認

```
□ https://あなたのアプリ.vercel.app が開く
□ メールアドレスでサインアップできる
□ ログイン後にダッシュボードが表示される
□ SKU追加 → ダッシュボードに反映される
□ ヒートマップで色分けが表示される
□ LT Pipeline → SKUを選択 → 12週グラフが出る
□ 料金プランを選択 → Stripe Checkoutに遷移する（Stripe設定済みの場合）
□ SSN追跡・入出庫履歴でPROバナーが表示される（Basicプランの場合）
```

---

## ✅ STEP 6 — デプロイ後にSupabase Auth URLを更新

VercelのURLが確定したら:
1. Supabase → Authentication → Settings
2. **Site URL** を実際のVercel URLに更新
3. **Redirect URLs** にも同じURLを追加

---

## データ入力ガイド

### SKU CSVフォーマット
```csv
name,superset,subset,stock_qty,daily_usage,lead_time,safety_stock,moq,unit_cost,supplier
A社 イヤホンA,イヤホン,A社 イヤホンA,420,62,18,186,200,28.50,Supplier-A
B社 イヤホンB,イヤホン,B社 イヤホンB,310,45,21,135,200,24.00,Supplier-B
USB-C Hub,,，1840,45,21,135,300,19.20,Supplier-C
```

### SSN CSVフォーマット（サプライヤー更新用）
```csv
ssn_id,superset,subset,supplier,ship_qty,arrival_qty,ship_date,eta_date,status,confidence,vessel,bl_number,origin_port,dest_port
SSN-2026-001,イヤホン,A社 イヤホンA,Supplier-A,500,500,2026-05-01,2026-05-15,booked,0.85,EVER GRACE,BL240501,Shenzhen,Los Angeles
```

**重要:** `subset` 列がSKUの `subset` または `name` と一致している必要があります

---

## トラブルシューティング

| エラー | 原因 | 対処 |
|--------|------|------|
| `npm install exited 254` | Root Directoryが間違い | Vercel設定でRoot Directoryを空欄に |
| `vite build exited 127` | viteが見つからない | Build Commandを `npm run build` に |
| 白い画面 | 環境変数が未設定 | Vercel → Settings → Env Varsを確認 |
| ログインできない | Supabase Auth URLが違う | Site URLをVercel URLに更新 |
| テーブルが見つからない | SQLが未実行 | SUPABASE_SQL.sqlを再実行 |

---

## ファイル一覧

```
stockwise-v3/
├── src/
│   ├── App.jsx                  ← メインアプリ（Arial統一デザイン）
│   ├── AuthContext.jsx          ← 認証状態管理
│   ├── supabase.js              ← Supabaseクライアント
│   ├── main.jsx                 ← エントリーポイント
│   └── components/
│       ├── LoginPage.jsx        ← ログイン・サインアップ
│       └── PricingModal.jsx     ← Basic vs Pro 料金選択
├── api/
│   ├── create-checkout-session.js  ← Stripe Checkout API
│   └── stripe-webhook.js           ← Stripe Webhook処理
├── index.html                   ← HTML（Arial指定）
├── package.json
├── vite.config.js
├── vercel.json                  ← Vercel設定（シンプル版）
├── .env.example                 ← 環境変数テンプレート
├── .gitignore
├── SUPABASE_SQL.sql             ← テーブル作成SQL
├── SSN_TEMPLATE.csv             ← SSN CSVテンプレート
└── DEPLOY_CHECKLIST.md          ← このファイル
```
