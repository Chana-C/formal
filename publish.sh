#!/usr/bin/env bash
# =========================================================
#  FORMAL · העלאה לגיטהאב ול-GitHub Pages בפקודה אחת (Linux / WSL)
#  הרצה מתוך תיקיית הפרויקט:   bash publish.sh
#  אפשר להריץ שוב אחרי כל שינוי כדי לעדכן את האתר באוויר.
# =========================================================
set -u
cd "$(dirname "$0")"

REPO="formal"
BRANCH="$(git branch --show-current 2>/dev/null)"; BRANCH="${BRANCH:-main}"

if ! command -v gh >/dev/null 2>&1; then
  echo "חסר GitHub CLI. התקנה:  sudo apt update && sudo apt install -y gh"
  exit 1
fi

# 1) התחברות לגיטהאב (מודפס קוד חד-פעמי, מאשרים אותו בדפדפן בכתובת github.com/login/device)
if ! gh auth status >/dev/null 2>&1; then
  echo "=== התחברות לגיטהאב: העתיקי את הקוד שיופיע ואשרי בדפדפן ==="
  gh auth login --hostname github.com --git-protocol https --web || exit 1
fi
gh auth setup-git >/dev/null 2>&1 || true

# 2) זהות לקומיטים – לפי המשתמש המחובר (השם שלך, לא של כלי)
LOGIN="$(gh api user --jq .login)"
LOGIN_LC="$(printf '%s' "$LOGIN" | tr 'A-Z' 'a-z')"
USER_ID="$(gh api user --jq .id)"
NAME="$(gh api user --jq '.name // .login')"
# כתובת ה-noreply של גיטהאב תמיד משויכת לחשבון, גם בלי הרשאת user:email
EMAIL="${USER_ID}+${LOGIN}@users.noreply.github.com"
git config user.name  "$NAME"
git config user.email "$EMAIL"
echo "קומיטים ייחתמו בשם: $NAME <$EMAIL>"

# 3) קומיט (ואם ההיסטוריה נוצרה לפני ההתחברות ועוד לא נדחפה – חותמים אותה מחדש בשם שלך)
git add -A
if git rev-parse --verify HEAD >/dev/null 2>&1; then
  git commit -q -m "עדכון אתר" 2>/dev/null || true
  if ! git remote get-url origin >/dev/null 2>&1; then
    git rebase -q -r --root --exec 'git commit --amend --no-edit --reset-author -q' 2>/dev/null \
      || { git rebase --abort 2>/dev/null; git commit --amend --no-edit --reset-author -q; }
  fi
else
  git commit -q -m "FORMAL - אתר תדמית - גרסה ראשונה"
fi

# 4) תמונת השיתוף (og:image) חייבת כתובת מלאה
ABS="https://${LOGIN_LC}.github.io/${REPO}/assets/img/og.png"
if grep -q 'property="og:image" content="assets/img/og.png"' index.html; then
  sed -i "s|property=\"og:image\" content=\"assets/img/og.png\"|property=\"og:image\" content=\"${ABS}\"|" index.html
  git add index.html && git commit -q -m "og:image absolute url"
fi

# 5) יצירת הריפו ודחיפה
if gh repo view "${LOGIN}/${REPO}" >/dev/null 2>&1; then
  git remote get-url origin >/dev/null 2>&1 || git remote add origin "https://github.com/${LOGIN}/${REPO}.git"
  git push -u origin "$BRANCH" || exit 1
else
  gh repo create "$REPO" --public --description "FORMAL · אתר תדמית לגרפיקאית ומפיקה" --source . --remote origin --push || exit 1
fi

# 6) הפעלת GitHub Pages מהענף הראשי
gh api -X POST "repos/${LOGIN}/${REPO}/pages" -f "source[branch]=${BRANCH}" -f "source[path]=/" >/dev/null 2>&1 \
  || gh api -X PUT "repos/${LOGIN}/${REPO}/pages" -f "source[branch]=${BRANCH}" -f "source[path]=/" >/dev/null 2>&1 \
  || true

echo
echo "========================================="
echo " הקוד:   https://github.com/${LOGIN}/${REPO}"
echo " האתר:   https://${LOGIN_LC}.github.io/${REPO}/   (עולה לאוויר תוך 1-2 דקות)"
echo " עריכה:  https://github.com/${LOGIN}/${REPO}/edit/${BRANCH}/content/works.js"
echo "========================================="
