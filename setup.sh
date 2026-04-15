#!/bin/bash
# ============================================================
# StockWise v2 — Quick Setup (macOS & Linux)
# Usage:  bash setup.sh
# ============================================================
set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

ok()   { echo -e "${GREEN}✅  $1${NC}"; }
info() { echo -e "${CYAN}ℹ   $1${NC}"; }
warn() { echo -e "${YELLOW}⚠️   $1${NC}"; }
err()  { echo -e "${RED}❌  $1${NC}"; exit 1; }
hr()   { echo -e "${CYAN}────────────────────────────────────────${NC}"; }

clear
echo -e "${BOLD}"
echo "  ╔══════════════════════════════════════╗"
echo "  ║   📦  StockWise v2  Setup Script     ║"
echo "  ║   What should I reorder today?       ║"
echo "  ╚══════════════════════════════════════╝"
echo -e "${NC}"

# ── 0. Prerequisites ─────────────────────────────────────────
hr; echo -e "${BOLD}Step 0 — Checking prerequisites${NC}"; hr
command -v node &>/dev/null || err "Node.js not found. Install from https://nodejs.org (v18+)"
command -v npm  &>/dev/null || err "npm not found."
ok "Node $(node -v) / npm $(npm -v)"

# ── 1. Extract zip if present ─────────────────────────────────
hr; echo -e "${BOLD}Step 1 — Project location${NC}"; hr
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/stockwise-v2.zip" ]; then
  info "Found stockwise-v2.zip — extracting…"
  unzip -q "$SCRIPT_DIR/stockwise-v2.zip" -d "$SCRIPT_DIR/stockwise-v2" 2>/dev/null || true
  cd "$SCRIPT_DIR/stockwise-v2"
  ok "Extracted to ./stockwise-v2/"
else
  [ -f "package.json" ] || err "package.json not found. Run from inside the project folder or next to stockwise-v2.zip"
  info "Already in project directory: $(pwd)"
fi

# ── 2. Install ───────────────────────────────────────────────
hr; echo -e "${BOLD}Step 2 — npm install${NC}"; hr
npm install --silent && ok "Dependencies installed"

# ── 3. Env setup ─────────────────────────────────────────────
hr; echo -e "${BOLD}Step 3 — Environment variables${NC}"; hr
[ -f ".env.local" ] && warn ".env.local already exists — editing in place" || (cp .env.example .env.local && ok "Created .env.local")

echo -e "\n${BOLD}Enter your Supabase credentials${NC}"
echo -e "${CYAN}(https://supabase.com → Project → Settings → API)${NC}\n"

while true; do
  read -p "  Supabase URL (https://xxx.supabase.co): " SUPA_URL
  [[ "$SUPA_URL" == https://*.supabase.co ]] && break
  warn "Must start with https:// and end with .supabase.co"
done

while true; do
  read -p "  Supabase ANON KEY (eyJ...): " SUPA_KEY
  [[ "$SUPA_KEY" == eyJ* ]] && break
  warn "Key should start with eyJ"
done

# Cross-platform sed (macOS vs Linux)
SED_I() { [[ "$OSTYPE" == darwin* ]] && sed -i '' "$1" "$2" || sed -i "$1" "$2"; }

SED_I "s|VITE_SUPABASE_URL=.*|VITE_SUPABASE_URL=$SUPA_URL|"    .env.local
SED_I "s|^SUPABASE_URL=.*|SUPABASE_URL=$SUPA_URL|"             .env.local
SED_I "s|VITE_SUPABASE_ANON_KEY=.*|VITE_SUPABASE_ANON_KEY=$SUPA_KEY|" .env.local
ok ".env.local updated with Supabase credentials"

# ── 4. Supabase DB setup reminder ────────────────────────────
hr; echo -e "${BOLD}Step 4 — Create Supabase tables${NC}"; hr
echo ""
echo "  1. Go to: https://supabase.com/dashboard"
echo "  2. SQL Editor → New Query"
echo "  3. Paste ALL SQL from SETUP.md (Section: Supabase SQL)"
echo "  4. Click Run"
echo ""
echo -e "${CYAN}Tables to create: profiles, skus, asns, movements, subscriptions${NC}"
echo ""
read -p "  Press Enter when tables are ready… "
ok "Supabase tables confirmed"

# ── 5. Verify ────────────────────────────────────────────────
hr; echo -e "${BOLD}Step 5 — Verify config${NC}"; hr
MISSING=0
check_var() {
  local V; V=$(grep "^$1=" .env.local | cut -d= -f2-)
  [[ -z "$V" || "$V" == *"..."* || "$V" == *"xxxx"* ]] && { warn "$1 not set yet"; ((MISSING++)); } || ok "$1 ✓"
}
check_var "VITE_SUPABASE_URL"
check_var "VITE_SUPABASE_ANON_KEY"
echo ""
[[ $MISSING -gt 0 ]] && warn "$MISSING var(s) not set — Stripe needed only for payments" || ok "All required vars set"

# ── 6. Launch ────────────────────────────────────────────────
hr; echo -e "${BOLD}Step 6 — Launch${NC}"; hr
echo ""
echo -e "${GREEN}${BOLD}🚀  Opening http://localhost:5173${NC}"
echo ""
echo -e "${CYAN}Quick start:${NC}"
echo "  1. Sign up with your email"
echo "  2. Inventory → Add SKU (name, stock, daily usage, lead time)"
echo "  3. Dashboard → see Today's Actions"
echo "  4. LT Pipeline → click a SKU → see 12-week forecast"
echo "  5. ASN Tracking → add inbound shipments"
echo ""
echo -e "${YELLOW}Stop: Ctrl+C${NC}"
hr
npm run dev
