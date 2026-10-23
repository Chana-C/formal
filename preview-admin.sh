#!/usr/bin/env bash
# =========================================================
#  FORMAL · תצוגה מקומית של האתר + ממשק הניהול
#  הרצה (מתוך WSL):   cd ~/formal && bash preview-admin.sh
#  מריץ את האתר ב-http://localhost:8080 ואת שרת הניהול ב-http://localhost:8787,
#  ופותח את ממשק הניהול בדפדפן. השמירות נכתבות לגיטהאב האמיתי (האתר החי מתעדכן).
#  מתאים גם כשרשת מסוננת חוסמת את github.io / workers.dev.  לסגירה: Ctrl+C
# =========================================================
set -u
cd "$(dirname "$0")"
export WRANGLER_SEND_METRICS=false
DEV="admin-api/.dev.vars"

command -v python3 >/dev/null 2>&1 || { echo "חסר python3 (sudo apt install python3)"; exit 1; }
command -v node >/dev/null 2>&1 || { echo "חסר Node.js"; exit 1; }

# הגדרה חד-פעמית: מייל וסיסמה לכניסה המקומית (נשמרים רק במחשב הזה, בקובץ שלא עולה לגיטהאב)
if [ ! -f "$DEV" ]; then
  echo "=== הגדרה חד-פעמית של ממשק הניהול המקומי ==="
  read -r -p "המייל לכניסה [e0583251376@gmail.com]: " OE; OE="${OE:-e0583251376@gmail.com}"
  read -r -s -p "סיסמה לכניסה המקומית (לפחות 8 תווים, אפשר אותה סיסמה כמו באתר): " OP; echo
  [ ${#OP} -ge 8 ] || { echo "סיסמה קצרה מדי"; exit 1; }
  TOK="$(gh auth token 2>/dev/null || true)"
  [ -n "$TOK" ] || { echo "GitHub CLI לא מחובר. הריצי: gh auth login"; exit 1; }
  umask 077
  printf 'GITHUB_TOKEN=%s\nSESSION_SECRET=%s\nOWNER_EMAIL=%s\nOWNER_PASSWORD=%s\n' \
    "$TOK" "$(head -c 32 /dev/urandom | base64 | tr -d '\n')" "$OE" "$OP" > "$DEV"
  echo "נשמר ✓"
fi

# אם הרצה קודמת עדיין פתוחה – סוגרים אותה
pkill -f "wrangler@4 dev --port 8787" 2>/dev/null; pkill -f "workerd" 2>/dev/null
pkill -f "http.server 8080" 2>/dev/null
sleep 1

# שרת האתר
python3 -m http.server 8080 --bind 127.0.0.1 >/dev/null 2>&1 &
SITE_PID=$!
# שרת הניהול (מקומי)
( cd admin-api && npx --yes wrangler@4 dev --port 8787 --ip 127.0.0.1 >/tmp/formal-admin-dev.log 2>&1 ) &
API_PID=$!
cleanup() {
  kill $SITE_PID 2>/dev/null
  pkill -f "wrangler@4 dev --port 8787" 2>/dev/null; pkill -f "workerd" 2>/dev/null
  kill $API_PID 2>/dev/null
  echo; echo "נסגר."; exit 0
}
trap cleanup INT TERM

echo "ממתינה לשרת הניהול (פעם ראשונה עשויה לקחת כדקה)..."
for i in $(seq 1 90); do
  curl -s http://127.0.0.1:8787/api/health 2>/dev/null | grep -q '"ok"' && break
  kill -0 $API_PID 2>/dev/null || { echo "שרת הניהול לא עלה. הלוג: /tmp/formal-admin-dev.log"; tail -20 /tmp/formal-admin-dev.log; cleanup; }
  sleep 1
done

URL="http://localhost:8080/admin.html?api=http://localhost:8787"
echo
echo "========================================="
echo " האתר:   http://localhost:8080/"
echo " ניהול:  $URL"
echo "========================================="
echo " לסגירה: Ctrl+C"
echo
if command -v explorer.exe >/dev/null 2>&1; then explorer.exe "$URL" >/dev/null 2>&1 || true
elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL" >/dev/null 2>&1 || true; fi

wait $API_PID
cleanup
