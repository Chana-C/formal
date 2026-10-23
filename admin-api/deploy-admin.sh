#!/usr/bin/env bash
# =========================================================
#  FORMAL · פריסת ה-Admin API ל-Cloudflare Workers (חינם) בפקודה אחת
#  הרצה (מתוך WSL):   cd ~/formal && bash admin-api/deploy-admin.sh
#  דרישות: חשבון Cloudflare (חינמי), Node 18+, GitHub CLI מחובר (gh auth status)
# =========================================================
set -u
cd "$(dirname "$0")"
ROOT="$(cd .. && pwd)"
export WRANGLER_SEND_METRICS=false
W="npx --yes wrangler@4"

command -v node >/dev/null 2>&1 || { echo "חסר Node.js"; exit 1; }

is_logged_in() { $W whoami 2>&1 | grep -q "You are logged in"; }

# 1) התחברות ל-Cloudflare (פעם אחת). נפתח דפדפן; אם לא נפתח – מעתיקים את הקישור שמודפס לדפדפן.
if ! is_logged_in; then
  echo
  echo "=== התחברות ל-Cloudflare ==="
  echo "אם הדפדפן לא נפתח לבד, העתיקי את הקישור שיופיע כאן והדביקי אותו בדפדפן, ואז לחצי Allow."
  echo
  $W login
  is_logged_in || { echo; echo "ההתחברות לא הושלמה. הריצי שוב את הסקריפט."; exit 1; }
fi
echo "מחוברת ל-Cloudflare ✓"

# 2) מאגר KV למנהלים (פעם אחת)
if grep -q 'KV_ID_PLACEHOLDER' wrangler.toml; then
  echo "יוצרת מאגר KV..."
  OUT="$($W kv namespace create ADMIN_KV 2>&1)" || { echo "$OUT"; exit 1; }
  KV_ID="$(printf '%s' "$OUT" | grep -oE 'id = "[0-9a-f]+"' | head -1 | grep -oE '[0-9a-f]{8,}')"
  [ -n "$KV_ID" ] || KV_ID="$(printf '%s' "$OUT" | grep -oE '"id": *"[0-9a-f]+"' | head -1 | grep -oE '[0-9a-f]{8,}')"
  [ -n "$KV_ID" ] || { echo "לא הצלחתי לקרוא את מזהה ה-KV מהפלט:"; echo "$OUT"; exit 1; }
  sed -i "s|KV_ID_PLACEHOLDER|$KV_ID|" wrangler.toml
  echo "KV ✓ ($KV_ID)"
fi

# 3) פריסה ראשונה (הסודות מוגדרים אחר כך ונכנסים לתוקף מיד)
echo "מפרסמת את השרת..."
OUT="$($W deploy 2>&1)"
if printf '%s' "$OUT" | grep -q "workers.dev subdomain"; then
  # לחשבון חדש אין עדיין תת-דומיין. מריצים את הפריסה באופן אינטראקטיבי כדי שתוכלי לאשר ולבחור שם.
  echo
  echo "=== Cloudflare מבקש לבחור שם לתת-הדומיין של החשבון (פעם אחת) ==="
  echo "בשאלה 'register a workers.dev subdomain now?' – לחצי Y ואז Enter."
  echo "בשאלה על השם – אפשר להשאיר את ההצעה או לכתוב למשל: formal"
  echo
  $W deploy || { echo "הפריסה נכשלה"; exit 1; }
  OUT="$($W deploy 2>&1)"
fi
API_URL="$(printf '%s' "$OUT" | grep -oE 'https://[a-z0-9.-]+\.workers\.dev' | head -1)"
[ -n "$API_URL" ] || { echo "$OUT"; echo "לא נמצאה כתובת ה-Worker בפלט"; exit 1; }
echo "שרת ✓ $API_URL"

# 4) סודות
has_secret() { $W secret list 2>/dev/null | grep -q "\"name\": *\"$1\""; }

if ! has_secret GITHUB_TOKEN; then
  echo
  echo "טוקן גיטהאב: אפשר ללחוץ Enter כדי להשתמש בחיבור הקיים של GitHub CLI,"
  echo "או להדביק טוקן Fine-grained לריפו formal (Contents: Read and write, Pages: Read)."
  read -r -s -p "GITHUB_TOKEN [Enter = אוטומטי]: " TOK; echo
  if [ -z "$TOK" ]; then TOK="$(gh auth token 2>/dev/null || true)"; fi
  [ -n "$TOK" ] || { echo "אין טוקן. הריצי: gh auth login"; exit 1; }
  printf '%s' "$TOK" | $W secret put GITHUB_TOKEN >/dev/null || exit 1
  echo "GITHUB_TOKEN ✓"
fi

if ! has_secret SESSION_SECRET; then
  head -c 48 /dev/urandom | base64 | tr -d '\n' | $W secret put SESSION_SECRET >/dev/null || exit 1
  echo "SESSION_SECRET ✓"
fi

if ! has_secret OWNER_EMAIL; then
  echo
  read -r -p "המייל שלך לכניסה לממשק הניהול: " OE
  printf '%s' "$OE" | $W secret put OWNER_EMAIL >/dev/null || exit 1
  echo "OWNER_EMAIL ✓"
fi
if ! has_secret OWNER_PASSWORD; then
  read -r -s -p "סיסמה ראשונית (לפחות 8 תווים, אפשר לשנות אחר כך בממשק): " OP; echo
  [ ${#OP} -ge 8 ] || { echo "סיסמה קצרה מדי"; exit 1; }
  printf '%s' "$OP" | $W secret put OWNER_PASSWORD >/dev/null || exit 1
  echo "OWNER_PASSWORD ✓"
fi

# 5) רישום כתובת ה-API באתר (content/site.json) ודחיפה
cd "$ROOT"
node -e '
const fs=require("fs"); const f="content/site.json"; const s=JSON.parse(fs.readFileSync(f,"utf8"));
if (s.adminApi !== process.argv[1]) { s.adminApi=process.argv[1]; fs.writeFileSync(f, JSON.stringify(s,null,2)+"\n"); console.log("updated"); }
' "$API_URL"
git add content/site.json admin-api/wrangler.toml
git commit -q -m "ממשק ניהול: כתובת ה-API" 2>/dev/null || true
git push -q origin "$(git branch --show-current)" || true

echo
echo "========================================="
echo " Admin API:     $API_URL"
echo " ממשק הניהול:  https://chana-c.github.io/formal/admin.html   (פעיל תוך 1-2 דקות)"
echo " כניסה עם המייל והסיסמה שהגדרת."
echo "========================================="
