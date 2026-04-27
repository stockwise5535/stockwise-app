# StockWise v3

## 変更点サマリー (v2 → v3)

| 変更 | 内容 |
|------|------|
| ASN → SSN | Advance Shipping Notice を Stockwise Serial Number に改名 |
| WOS表示 | 小数点なし（整数）に変更 |
| ダッシュボード | 「危機的」→「アラート」に変更 |
| 在庫管理 | Superset / Subset 階層構造を追加 |
| LTパイプライン | 「ASN入荷」→「入荷」に変更 |
| Pro限定機能 | SSN追跡・入出庫履歴をPro限定に変更 |
| SSN CSV | サプライヤー更新用CSV登録に対応 |

---

## ローカル起動

```bash
npm install
cp .env.example .env.local
# .env.local にSupabaseキーを入力
npm run dev
```

---

## Supabase セットアップ

1. https://supabase.com → New project（Tokyo）
2. SQL Editor → `SUPABASE_SQL.sql` を全文貼り付けて Run
3. Authentication → Settings → Site URL を Vercel URL に設定

---

## Vercel デプロイ

```bash
git init
git add .
git commit -m "StockWise v3"
git branch -M main
git remote add origin https://github.com/ユーザー名/リポジトリ名.git
git push -u origin main
```

Vercel 設定:
- Framework: **Vite**
- Root Directory: **空欄**
- Build Command: `npm run build`
- Install Command: `npm install`

---

## 環境変数（Vercelに設定）

```
VITE_SUPABASE_URL          = https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY     = eyJ...
SUPABASE_URL               = https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY  = eyJ...
VITE_APP_URL               = https://あなたのアプリ.vercel.app
VITE_STRIPE_PUBLISHABLE_KEY = pk_live_...
STRIPE_SECRET_KEY           = sk_live_...
STRIPE_WEBHOOK_SECRET       = whsec_...
VITE_STRIPE_PRICE_BASIC     = price_...
VITE_STRIPE_PRICE_PRO       = price_...
STRIPE_PRICE_BASIC          = price_...
STRIPE_PRICE_PRO            = price_...
```

---

## SKU CSV インポート形式

```csv
name,superset,subset,stock_qty,daily_usage,lead_time,safety_stock,moq,unit_cost,supplier
A社 イヤホンA,イヤホン,A社 イヤホンA,420,62,18,186,200,28.50,Supplier-A
B社 イヤホンB,イヤホン,B社 イヤホンB,310,45,21,135,200,24.00,Supplier-B
```

## SSN CSV インポート形式（サプライヤー更新用）

```csv
ssn_id,superset,subset,supplier,ship_qty,arrival_qty,ship_date,eta_date,status,confidence,vessel,bl_number,origin_port,dest_port
SSN-2026-001,イヤホン,A社 イヤホンA,Supplier-A,500,500,2026-05-01,2026-05-15,booked,0.85,EVER GRACE,BL240501,Shenzhen,Los Angeles
```

**重要:** `subset` 列がSKUの `subset` または `name` と一致している必要があります。

---

## プラン比較

| 機能 | Basic $49 | Pro $149 |
|------|:---------:|:--------:|
| SKU管理 (Superset/Subset) | ✓ 50品目 | ✓ 無制限 |
| ダッシュボード・ヒートマップ | ✓ | ✓ |
| LTパイプライン (12週) | ✓ | ✓ |
| **SSN追跡** | ✗ | ✓ |
| **入出庫履歴** | ✗ | ✓ |
| 3PL・自社輸送連携 | ✗ | ✓ |

---

## ビジネスロジック

| 指標 | 計算式 |
|------|--------|
| 残日数 | 在庫数 ÷ 日使用量 |
| 発注点 | LT × 日使用量 |
| 安全在庫 | 設定値 or 日使用量 × 3 |
| アラート | 残日数 < 7日 |
| 要注意 | 残日数 < 14日 |
| 過剰在庫 | 残日数 > 45日 |
| WOS (週) | 予測在庫 ÷ (日使用量 × 7) → 整数表示 |
