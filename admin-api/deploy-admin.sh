#!/usr/bin/env bash
# =========================================================
#  FORMAL · פריסת ה-Admin API ל-Cloudflare Workers (חינם) בפקודה אחת
#  הרצה (מתוך WSL):   bash admin-api/deploy-admin.sh
#  דרישות: חשבון Cloudflare (חינמי), Node 18+, GitHub CLI מחובר (gh auth status)
# =========================================================
set -u
cd "$(dirname "$0")"
ROOT="$(cd .. && pwd)"
W="npx --yes wrangler@4"

command -v node >/dev/null 2>&1 || { echo "חסר Node.js"; exit 1; }

# 1) התחברות ל-Cloudflare (נפתח דפדפן לאישור, פעם אחת)
if ! $W whoami >/dev/null 2>&1; then
  echo "=== התחברות ל-Cloudflare: אשרי בדפדפן ==="
  $W login || exit 1
fi

# 2) מאגר KV למנהלים (פעם אחת)
if grep -q 'KV_ID_PLACEHOLDER' wrangler.toml; then
  echo "יוצרת מאגר KV..."
  OUT="$($W kv namespace create ADMIN_KV 2>&1)" || { echo "$OUT"; exit 1; }
  KV_ID="$(printf '%s' "$OUT" | grep -oE 'id = "[0-9a-f]+"' | head -1 | grep -oE '[0-9a-f]{8,}')"
  [ -n "$KV_ID" ] || { echo "לא הצלחתי לקרוא את מזהה ה-KV:"; echo "$OUT"; exit 1; }
  sed -i "s|KV_ID_PLACEHOLDER|$KV_ID|" wrangler.toml
  echo "KV: $KV_ID"
fi

# 3) סודות
has_secret() { $W secret list 2>/dev/null | grep -q "\"name\": *\"$1\""; }

if ! has_secret GITHUB_TOKEN; then
  echo
  echo "טוקן גיטהאב: הדביקי טוקן (fine-grained, לריפו formal בלבד, הרשאות Contents: Read and write, Pages: Read)."
  echo "יצירה: https://github.com/settings/personal-access-tokens/new"
  echo "אפשר גם להשאיר ריק וללחוץ Enter – ואז ישמש הטוקן של GitHub CLI המחובר (gh auth token)."
  read -r -s -p "GITHUB_TOKEN: " TOK; echo
  if [ -z "$TOK" ]; then TOK="$(gh auth token 2>/dev/null || true)"; fi
  [ -n "$TOK" ] || { echo "אין טוקן"; exit 1; }
  printf '%s' "$TOK" | $W secret put GITHUB_TOKEN >/dev/null || exit 1
fi

if ! has_secret SESSION_SECRET; then
  head -c 48 /dev/urandom | base64 | tr -d '\n' | $W secret put SESSION_SECRET >/dev/null || exit 1
fi

if ! has_secret OWNER_EMAIL; then
  read -r -p "המייל שלך לכניסה לממשק הניהול: " OE
  printf '%s' "$OE" | $W secret put OWNER_EMAIL >/dev/null || exit 1
fi
if ! has_secret OWNER_PASSWORD; then
  read -r -s -p "סיסמה ראשונית (לפחות 8 תווים, אפשר לשנות אחר כך בממשק): " OP; echo
  [ ${#OP} -ge 8 ] || { echo "סיסמה קצרה מדי"; exit 1; }
  printf '%s' "$OP" | $W secret put OWNER_PASSWORD >/dev/null || exit 1
fi

# 4) פריסה
OUT="$($W deploy 2>&1)" || { echo "$OUT"; exit 1; }
echo "$OUT" | tail -5
API_URL="$(printf '%s' "$OUT" | grep -oE 'https://[a-z0-9.-]+\.workers\.dev' | head -1)"
[ -n "$API_URL" ] || { echo "לא נמצאה כתובת ה-Worker בפלט"; exit 1; }

# 5) רישום כתובת ה-API באתר (content/site.json) ודחיפה
cd "$ROOT"
node -e '
const fs=require("fs"); const f="content/site.json"; const s=JSON.parse(fs.readFileSync(f,"utf8"));
s.adminApi=process.argv[1]; fs.writeFileSync(f, JSON.stringify(s,null,2)+"\n");
' "$API_URL"
git add content/site.json
git commit -q -m "ממשק ניהול: כתובת ה-API" 2>/dev/null || true
git push -q origin "$(git branch --show-current)" || true

echo
echo "========================================="
echo " Admin API:     $API_URL"
echo " ממשק הניהול:  https://chana-c.github.io/formal/admin.html   (פעיל תוך 1-2 דקות)"
echo " כניסה עם המייל והסיסמה שהגדרת."
echo "========================================="
