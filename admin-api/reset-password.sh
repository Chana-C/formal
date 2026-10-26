#!/usr/bin/env bash
# =========================================================
#  FORMAL · איפוס סיסמה לממשק הניהול מהטרמינל (בלי מייל)
#  לאתר החי:          bash admin-api/reset-password.sh
#  לתצוגה המקומית:    bash admin-api/reset-password.sh --local
# =========================================================
set -u
cd "$(dirname "$0")"
export WRANGLER_SEND_METRICS=false
W="npx --yes wrangler@4"
MODE="${1:-}"
DEFAULT_EMAIL="e0583251376@gmail.com"

echo "שלב 1 – המייל. לחצי Enter כדי להשאיר את המייל שלך ($DEFAULT_EMAIL)."
read -r -p "מייל: " EM; EM="${EM:-$DEFAULT_EMAIL}"
EM="$(printf '%s' "$EM" | tr 'A-Z' 'a-z')"
case "$EM" in
  *@*.*) ;;
  *) echo "זה לא נראה כמו כתובת מייל ($EM). הסיסמה מוקלדת רק בשלב הבא. נסי שוב."; exit 1 ;;
esac

echo "שלב 2 – הסיסמה החדשה (ההקלדה מוסתרת, זה תקין)."
read -r -s -p "סיסמה חדשה (לפחות 8 תווים): " PW; echo
[ ${#PW} -ge 8 ] || { echo "הסיסמה קצרה מדי"; exit 1; }
read -r -s -p "שוב, לאימות: " PW2; echo
[ "$PW" = "$PW2" ] || { echo "הסיסמאות לא זהות"; exit 1; }

if [ "$MODE" = "--local" ]; then
  pkill -f "preview-admin.sh" 2>/dev/null; pkill -f "wrangler@4 dev --port 8787" 2>/dev/null; pkill -f "entry=127.0.0.1:8787" 2>/dev/null; pkill -f "http.server 8080" 2>/dev/null
  [ -f .dev.vars ] || { echo "אין קובץ .dev.vars – הריצי קודם: bash preview-admin.sh"; exit 1; }
  node -e '
const fs=require("fs"); let s=fs.readFileSync(".dev.vars","utf8");
s=s.replace(/^OWNER_EMAIL=.*$/m, "OWNER_EMAIL="+process.argv[1]).replace(/^OWNER_PASSWORD=.*$/m, "OWNER_PASSWORD="+process.argv[2]);
fs.writeFileSync(".dev.vars", s);' "$EM" "$PW"
  rm -rf .wrangler/state
  echo "הסיסמה המקומית עודכנה ✓  עכשיו הריצי:  cd ~/formal && bash preview-admin.sh"
  exit 0
fi

echo "קוראת את רשימת המנהלים מהשרת..."
CUR="$($W kv key get --binding ADMIN_KV --remote admins 2>/dev/null || true)"
REC="$(node -e '
const c=require("crypto"); const [em,pw,cur]=process.argv.slice(1);
let admins={}; try { const j=JSON.parse(cur); if (j && typeof j==="object" && !Array.isArray(j)) admins=j; } catch {}
// ניקוי רשומות שנוצרו בטעות (מפתח שאינו כתובת מייל)
for (const k of Object.keys(admins)) if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(k)) delete admins[k];
const salt=c.randomBytes(16); const hash=c.pbkdf2Sync(pw,salt,120000,32,"sha256");
const hasOwner=Object.values(admins).some(a=>a.role==="owner");
const prev=admins[em]||{ name: hasOwner ? em : "בעלת האתר", role: hasOwner ? "admin" : "owner", created: new Date().toISOString() };
admins[em]={...prev, salt:salt.toString("base64"), hash:hash.toString("base64")};
process.stdout.write(JSON.stringify(admins));' "$EM" "$PW" "$CUR")"
$W kv key put --binding ADMIN_KV --remote admins "$REC" >/dev/null || { echo "השמירה נכשלה"; exit 1; }
echo "הסיסמה של $EM עודכנה ✓  כניסה: https://chana-c.github.io/formal/admin.html"
