/* =========================================================
   FORMAL · העבודות שלי (וידאו + תמונות)
   ---------------------------------------------------------
   כל פריט הוא בלוק בין { } ומופרד בפסיק. שדות:

   id          – מזהה קצר באנגלית, ייחודי (משמש לקישור ישיר, למשל #work=noir)
   title       – שם העבודה
   client      – שם הלקוח (אופציונלי)
   year        – שנה (אופציונלי)
   category    – אחד מהמפתחות שב-site.js: video / branding / print / digital / event
   type        – "youtube" | "drive" | "vimeo" | "file" | "image"   (אפשר גם "auto" והאתר יזהה לבד)
   src         – הקישור. אפשר להדביק קישור מלא כמו שהוא:
                   YouTube:  https://www.youtube.com/watch?v=XXXXXXXX  או  https://youtu.be/XXXXXXXX
                   Drive:    https://drive.google.com/file/d/XXXXXXXX/view?usp=sharing
                   Vimeo:    https://vimeo.com/123456789
                   קובץ:     assets/media/my-video.mp4   (קובץ שהעלית לתיקייה assets/media)
                   תמונה:    assets/media/my-image.jpg   או קישור לתמונה ב-Drive
   poster      – תמונת תצוגה מקדימה (אופציונלי). ל-YouTube נלקחת אוטומטית אם לא כתבת.
   featured    – true כדי שהעבודה תופיע בדף הבית (עד 4 עבודות)
   description – תיאור קצר שמוצג בנגן (אופציונלי)

   חשוב לגבי Google Drive: בהגדרות השיתוף של הקובץ בחרי "כל מי שיש לו את הקישור" → "צופה",
   ולחצי על גלגל השיניים ⚙ ובטלי את "צופים יכולים להוריד". כך לא תהיה אפשרות הורדה.
   ========================================================= */
window.FORMAL_WORKS = [
  {
    id: "noir-launch",
    title: "קמפיין השקה · Noir",
    client: "סטודיו נואר",
    year: 2025,
    category: "video",
    type: "youtube",
    src: "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
    poster: "assets/img/posters/p01.svg",
    featured: true,
    description: "סרטון השקה למותג אופנה. קונספט, ביום, הפקה בשטח ועריכה. (סרטון דמה – יוחלף בעבודה אמיתית)"
  },
  {
    id: "kaveret-rebrand",
    title: "מיתוג מחדש · Kaveret Coffee",
    client: "Kaveret Coffee",
    year: 2025,
    category: "branding",
    type: "image",
    src: "assets/img/posters/p02.svg",
    featured: true,
    description: "שפה חזותית מלאה לרשת בתי קפה: לוגו, אריזות, שילוט ותפריטים."
  },
  {
    id: "red-hour",
    title: "קליפ · Red Hour",
    client: "Red Hour Records",
    year: 2024,
    category: "video",
    type: "youtube",
    src: "https://youtu.be/eRsGyueVLvQ",
    poster: "assets/img/posters/p03.svg",
    featured: true,
    description: "הפקת קליפ מוזיקלי בלילה אחד: תאורה קולנועית, עשן, שלוש לוקיישנים."
  },
  {
    id: "festival-poster",
    title: "פוסטר · פסטיבל הקולנוע",
    client: "פסטיבל הקולנוע הים-תיכוני",
    year: 2024,
    category: "print",
    type: "image",
    src: "assets/img/posters/p04.svg",
    featured: true,
    description: "סדרת פוסטרים לפסטיבל, הדפסה בפורמט רחב ושילוט חוצות."
  },
  {
    id: "formal-reel",
    title: "סרט תדמית · Formal Studio",
    client: "Formal Studio",
    year: 2025,
    category: "video",
    type: "youtube",
    src: "https://www.youtube.com/watch?v=R6MlUcmOul8",
    poster: "assets/img/posters/p05.svg",
    description: "ריל שנתי – אוסף העבודות הנבחרות של הסטודיו."
  },
  {
    id: "mono-packaging",
    title: "עיצוב אריזה · Mono",
    client: "Mono Skincare",
    year: 2024,
    category: "branding",
    type: "image",
    src: "assets/img/posters/p06.svg",
    description: "אריזות מינימליסטיות לסדרת טיפוח. שחור, לבן ונגיעת אדום."
  },
  {
    id: "pulse-digital",
    title: "קמפיין דיגיטל · Pulse",
    client: "Pulse Fitness",
    year: 2025,
    category: "digital",
    type: "image",
    src: "assets/img/posters/p07.svg",
    description: "סט באנרים, סטוריז וריל לרשתות החברתיות."
  },
  {
    id: "gala-2025",
    title: "הפקת אירוע · Gala 2025",
    client: "Luma Events",
    year: 2025,
    category: "event",
    type: "youtube",
    src: "https://www.youtube.com/watch?v=TLkA0RELQ1g",
    poster: "assets/img/posters/p08.svg",
    description: "הפקה מלאה של ערב גאלה: עיצוב במה, תאורה, מיתוג האירוע וסרטון סיכום."
  },
  {
    id: "atelier-book",
    title: "ספר מותג · Atelier",
    client: "Atelier Shem",
    year: 2023,
    category: "print",
    type: "image",
    src: "assets/img/posters/p09.svg",
    description: "ספר מותג 120 עמודים, עיצוב וטיפוגרפיה."
  }

  /* ---- דוגמה להוספת וידאו מ-Google Drive (הסירי את הסימנים בהתחלה ובסוף): ----
  ,{
    id: "my-drive-video",
    title: "השם של העבודה",
    client: "שם הלקוח",
    year: 2026,
    category: "video",
    type: "drive",
    src: "https://drive.google.com/file/d/XXXXXXXXXXXXXXXXXXXX/view?usp=sharing",
    poster: "assets/media/my-poster.jpg",
    featured: false,
    description: "תיאור קצר"
  }
  */
];
