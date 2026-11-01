# ARCHITECTURE – כושר ותזונה: התאמה פרסונלית

**מקורות:** `PRD.md`, `tech-stack.md` (מאושר), `course-stack.md`, `product-10-definitions.md` (מקור האמת), `MVP.md`
**סטטוס:** טיוטה לאישור
**היקף:** תכנון טכני בלבד, על ה-Technology Stack המאושר. בלי Milestones, משימות או לוחות זמנים.

> **איך לקרוא:** כל מה שמסומן **"הנחה"** הוא החלטה טכנית שלא נקבעה במסמכי המקור. נכתבה כדי שאפשר יהיה לבנות. הרשימה המלאה בסעיף 12.
> **MVP מול Should:** כל רכיב מסומן אם הוא ב-MVP או ב-Should (גרסאות 1.1–1.3), לפי `PRD.md` ו-`MVP.md`.

---

## 1. תמונת מצב והחלטות מרכזיות

### 1.1 במשפט אחד
אתר סטטי ב-GitHub Pages מדבר ישירות עם Supabase (כניסה וקריאה וכתיבה של נתונים, מוגן בהרשאות טבלה), ופונקציה אחת ב-Vercel, `api/ask.js`, מייצרת בעזרת Gemini את התפריט והתכנית. כל החישובים בקוד, והמודל רק בוחר מנות ותרגילים ומנסח טקסט.

### 1.2 החלטות שמעצבות את כל המסמך

| # | החלטה | הסבר במשפט |
|---|-------|-------------|
| 1 | **פונקציה אחת, `api/ask.js`, עם שתי פעולות:** `generate_plan` ו-`close_cycle` | הסטאק מורה להתחיל בפונקציה אחת. שתי הפעולות חולקות אימות, קריאת נתונים וקריאה למודל |
| 2 | **קריאה אחת למודל מחזירה גם תפריט וגם תכנית אימונים** | סוגר את הפתיחה שנשארה ב-`tech-stack.md`. חוסך מכסה (20 קריאות ליום ב-Gemini 3.6 Flash החינמי) ושומר על התאמה בין התפריט לתכנית |
| 3 | **הפונקציה פועלת בשם המשתמש, עם ה-JWT שלו ומפתח `sb_publishable_`** | ההרשאות של Supabase (RLS) ממשיכות להגן, ו**אין צורך במפתח `sb_secret_` ב-MVP**. המפתח הסודי היחיד ב-MVP הוא מפתח Gemini |
| 4 | **הפונקציה קוראת את הנתונים בעצמה מ-Supabase. הדפדפן לא שולח לה פרופיל או נתוני התקדמות** | הדפדפן שולח רק את שם הפעולה. אי אפשר לשלוח לפונקציה נתונים מומצאים, והפרומפט תמיד בנוי מהנתונים השמורים |
| 5 | **כל חישוב בקוד משותף אחד, תיקיית `shared/`** | אותו קוד רץ בדפדפן (תצוגה) ובפונקציה (יעד קלוריות, דוח). אין שלב בנייה: מודולי ES רגילים |
| 6 | **ה-AI מחזיר רק מזהים וכמויות:** `food_id` + גרמים, `exercise_id` + סטים וחזרות | השמות והערכים התזונתיים נלקחים בקוד ממאגרי הקבצים. המודל לא יכול להמציא מזון או תרגיל, כי הקוד דוחה מזהה שלא קיים |
| 7 | **מצב ה-DB קובע מה מותר לבצע** | `generate_plan` רק כשאין למשתמש מחזור. `close_cycle` רק למחזור שהסתיים ושעוד אין לו דוח. הבדיקה לפני הקריאה למודל, ולכן אי אפשר לצרוך מכסה בלי סוף |
| 8 | **תאריכים תמיד לפי שעון ישראל** (`Asia/Jerusalem`) | PRD הנחה 12. התאריך נקבע בקוד משותף, לא לפי שעון המכשיר או השרת |
| 9 | **גרף בסיסי ב-MVP הוא SVG שנוצר בקוד, בלי ספרייה** | `PRD.md` דורש "טבלה וגרף בסיסי" למגמת משקל ב-MVP, ו-Chart.js (`tech-stack.md`) הוא Should בגרסה 1.1. כך אין סתירה וגם אין רכיב חדש |
| 10 | **n8n לא משתתף בשום זרימה ב-MVP** | ההפעלה הידנית היא כפתור באתר. n8n מוקם ב-M0 (לפי `MVP.md`), ותפקידיו מתחילים בגרסה 1.2 (סעיף 7.4) |

### 1.3 מה מחוץ לארכיטקטורה הזו
תשלומים, מפות, אחסון קבצים (Supabase Storage), הרשמה, Push, זמן אמת, שירות דיוור, React וכלי בנייה. אף דרישה ב-PRD לא צריכה אותם.

---

## 2. מבנה המערכת בשלוש שכבות

```
 ┌─────────────────────────────────────────────────────────────┐
 │ שכבה 1: צד לקוח – GitHub Pages (HTML + CSS + JS, בלי build)  │
 └───────┬───────────────────────────────────────┬─────────────┘
         │ supabase-js                           │ fetch POST /api/ask
         │ (JWT של המשתמש)                       │ (Authorization: Bearer JWT)
         │                                       ▼
         │                      ┌──────────────────────────────────┐
         │                      │ שכבה 2: לוגיקה – Vercel          │
         │                      │ api/ask.js + lib/ + shared/      │
         │                      └───┬──────────────────────┬───────┘
         │                          │ supabase-js          │ fetch + x-goog-api-key
         │                          │ (אותו JWT)           ▼
         ▼                          ▼               Gemini API (Interactions)
 ┌─────────────────────────────────────────────────────────────┐
 │ שכבה 3: נתונים – Supabase (Auth + Postgres + RLS)            │
 │ profiles · daily_logs · weekly_cycles                         │
 └─────────────────────────────────────────────────────────────┘
        + קבצי JSON קבועים בריפו: data/foods.json, exercises.json, lists.json
```

### 2.1 שכבה 1: צד לקוח

**מה זה:** אתר סטטי בענף `main`, בשורש הריפו, ב-GitHub Pages. HTML, CSS ו-JavaScript רגילים. מודולי ES בדפדפן (`<script type="module">`), בלי React ובלי שלב בנייה. הדפים בעברית, `<html lang="he" dir="rtl">`.

**מה יש בה:**

| רכיב | תפקיד | מתי |
|------|--------|-----|
| 6 דפי HTML | כניסה, הזנת נתונים, תכנית תזונה, תכנית אימונים, עדכון יומי, התקדמות ודוחות (סעיף 9) | MVP |
| `supabase-js` | כניסה, וקריאה וכתיבה לשלוש הטבלאות. נטען ב-`<script>` מ-jsDelivr, מקובע ל-`@2` | MVP |
| מפתח `sb_publishable_` וכתובת Supabase | ב-`js/config.js`. מותר בדפדפן, והגנתו בהרשאות הטבלה | MVP |
| `js/api.js` | קריאה אחת לפונקציה: `POST /api/ask` עם ה-JWT של המשתמש | MVP |
| קוד משותף `shared/` | BMR, TDEE, יעד קלוריות, ערכי תזונה, מאזן, דוח, תאריכים | MVP |
| קבצי נתונים | `foods.json` (חיפוש והצגת ערכים), `exercises.json`, `lists.json` | MVP |
| גרף SVG בסיסי | מגמת משקל בדוח (נוצר בקוד, עם טבלה לצדו) | MVP |
| Chart.js 4.5.1 דרך CDN | גרפים מלאים | Should, 1.1 |
| דפי דשבורד מנהל | `admin.html` | Should, 1.3 |

**מה הלקוח עושה בעצמו (בלי הפונקציה):**
1. כניסה ויציאה (Supabase Auth).
2. שמירת פרופיל, עדכון יומי ופידבק, ישירות לטבלאות.
3. חיפוש מזון ב-`foods.json` וחישוב ערכים תזונתיים.
4. חישוב מאזן הקלוריות והצגתו מיד אחרי השמירה.
5. הצגת תפריט, תכנית ודוח מהשורות השמורות.

**מה הלקוח לא עושה:** לא קורא ל-Gemini, לא מחזיק מפתח סודי, ולא קובע הרשאות. כל בדיקת "האם מחובר" בדפדפן היא חוויית משתמש בלבד. ההגנה האמיתית בהרשאות הטבלה.

### 2.2 שכבה 2: לוגיקה (פונקציה ב-Vercel)

**מה זה:** קובץ אחד, `api/ask.js`, שמשתמש במודולים מתיקיית `lib/` (לשרת בלבד) ומתיקיית `shared/` (משותפת עם הדפדפן). Node.js 24, מודולי ES (`"type": "module"` ב-`package.json`).

**תפקידים:**
1. טיפול ב-CORS וב-OPTIONS.
2. אימות המשתמש מה-JWT.
3. בדיקת התנאים המוקדמים של הפעולה מול מצב ה-DB.
4. קריאת הנתונים מ-Supabase, תחת ההרשאות של המשתמש.
5. חישוב יעד קלוריות, ודוח המחזור (בקוד).
6. בניית הפרומפט, קריאה ל-Gemini, ובדיקת הפלט.
7. חישוב ערכים תזונתיים של התפריט, וכתיבת התוצאה ל-Supabase.
8. החזרת JSON תמיד.

**תלות חיצונית יחידה בקוד:** `@supabase/supabase-js` (כבר בסטאק). קריאה ל-Gemini דרך `fetch`, בלי ספרייה. בדיקת סכמה בקוד כתוב ביד, בלי ספריית סכמות (`tech-stack.md`, סעיף 5).

### 2.3 שכבה 3: נתונים

- **Supabase Auth:** משתמשים שנוצרים ידנית בדשבורד (עד 5), כניסה בסיסמה בלבד.
- **Supabase Postgres:** שלוש טבלאות בלבד (סעיף 3), עם RLS.
- **קבצי JSON בריפו:** רשימות קבועות (סעיף 3.8). הם לא טבלאות, לפי הסטאק.

### 2.4 ארבע הזרימות המרכזיות

**א. כניסה (MVP)**
1. `signInWithPassword(email, password)` ב-`index.html`.
2. `supabase-js` שומר את ה-session. אחרי כניסה: אם אין שורה ב-`profiles`, לדף `profile.html`. אם יש, לדף `nutrition.html`.

**ב. הזנת נתונים ויצירת תכנית ראשונה (MVP)**
1. `profile.html` שומר את הפרופיל ב-`profiles` (upsert לפי `id`) ישירות מהדפדפן.
2. הדפדפן קורא `POST /api/ask` עם `{"action":"generate_plan"}` ומציג מצב המתנה.
3. הפונקציה מאמתת, בודקת שאין עדיין מחזור, קוראת את הפרופיל, מחשבת יעד קלוריות, קוראת ל-Gemini, בודקת את הפלט, מחשבת ערכים תזונתיים ומכניסה שורה ראשונה ל-`weekly_cycles`.
4. הדפדפן עובר ל-`nutrition.html`.
5. אם הפעולה נכשלה: הודעת שגיאה, ובדף `nutrition.html` כפתור "צור תכנית" (PRD הנחה 11).

**ג. עדכון יומי (MVP)**
1. `daily.html` טוען את `foods.json`, ואת השורה של היום מ-`daily_logs` אם קיימת.
2. המשתמש מזין משקל, אימון וארוחות. בשמירה, הדפדפן מחשב `calories_in` ו-`tdee` בקוד המשותף, וכותב שורה אחת ל-`daily_logs` (upsert לפי `user_id, log_date`).
3. מיד אחרי השמירה הדפדפן קורא את שורת אתמול ומציג מאזן של היום לצד אתמול. אם אין אתמול, מוצג רק היום.

**ד. סוף מחזור (MVP, הפעלה ידנית בכפתור)**
1. ב-`progress.html`, מהיום שאחרי `cycle_end`, המשתמש רואה את הדוח המחושב של המחזור שהסתיים וטופס פידבק. הפידבק נכתב ישירות לעמודה `feedback` בשורת המחזור.
2. המשתמש לוחץ "סיים מחזור וקבל תכנית חדשה". הדפדפן קורא `POST /api/ask` עם `{"action":"close_cycle","cycle_id":"..."}`.
3. הפונקציה: מאמתת. בודקת שהמחזור שייך למשתמש, שהסתיים, שאין לו דוח ושאין מחזור אחריו. קוראת פרופיל, ימים ופידבק. מחשבת את הדוח בקוד. קוראת ל-Gemini לתפריט ותכנית חדשים וגם לטקסט סיכום. בודקת את הפלט. כותבת בבקשה אחת (upsert): את הדוח לשורה הישנה, ושורה חדשה למחזור הבא.
4. הדפדפן מציג את הדוח ואת התכנית המעודכנת יחד.
5. אין פידבק: ההפעלה נמשכת לפי נתוני ההתקדמות בלבד, והדוח מציין שלא התקבל פידבק (PRD 4.2, פיצר 9).

---

## 3. מבנה הנתונים

שלוש טבלאות, כמו בסטאק. שמות באנגלית, באותיות קטנות עם קו תחתון. התוכן בעברית. בונים את הטבלאות לפני המסכים. ה-DDL המלא נשמר בריפו ב-`supabase/schema.sql`.

### 3.1 קשרים

```
auth.users (Supabase Auth, נוצר ידנית)
   │ 1
   │
   │ 1
profiles (id = auth.users.id)
   │ 1                      │ 1
   │                        │
   │ N                      │ N
daily_logs              weekly_cycles
(שורה ליום)             (שורה למחזור)
```

- `daily_logs` ו-`weekly_cycles` קשורות ל-`profiles` ב-`user_id`.
- אין מפתח זר בין `daily_logs` ל-`weekly_cycles`. שיוך יום למחזור נעשה לפי התאריך: `cycle_start <= log_date <= cycle_end`.
- מחיקת משתמש מוחקת את שורותיו (`on delete cascade`).

### 3.2 `profiles`

שורה אחת למשתמש. נוצרת בהזנת הנתונים הראשונה.

| עמודה | טיפוס | כללים | הערה |
|-------|-------|-------|------|
| `id` | `uuid` PK | FK ל-`auth.users(id)` | שווה למזהה המשתמש ב-Auth |
| `role` | `text` | `'user'` או `'admin'`, ברירת מחדל `'user'` | המשתמש לא יכול לכתוב אותה (סעיף 4.3). נקבעת ידנית ע"י בעל המוצר |
| `name` | `text` | חובה | |
| `height_cm` | `numeric` | `> 0` | |
| `weight_kg` | `numeric` | `> 0` | משקל בעת ההזנה. משקל יומי נשמר ב-`daily_logs` |
| `age` | `int` | בין 18 ל-70 | PRD 4.1. גם הדפדפן חוסם עם הודעה |
| `sex` | `text` | `'male'` או `'female'` | נדרש ל-BMR |
| `body_type` | `text` | `'ectomorph'`, `'mesomorph'`, `'endomorph'` | |
| `waist_cm`, `arm_cm`, `leg_cm` | `numeric` | `> 0` | |
| `diet_preferences` | `jsonb` | מערך קודים מ-`lists.json`, ברירת מחדל `["none"]` | `"none"` לא משולב עם קוד אחר |
| `goal` | `text` | `'lose_weight'`, `'maintain_weight'`, `'strengthen'` | |
| `fitness_level` | `text` | `'sedentary'`, `'low'`, `'medium'`, `'high'` | קובע את גורם הפעילות ב-TDEE |
| `preferred_hours` | `jsonb` | יכול להיות ריק | **Should, 1.2.** העמודה קיימת מ-M0 כדי שלא יהיה שינוי מבנה, אבל המסך לא מציג אותה ב-MVP |
| `created_at` | `timestamptz` | ברירת מחדל `now()` | |

### 3.3 `daily_logs`

שורה אחת ליום לכל משתמש. הכתיבה היא upsert, כך שאפשר לתקן את אותו יום.

| עמודה | טיפוס | כללים | הערה |
|-------|-------|-------|------|
| `id` | `uuid` PK | `gen_random_uuid()` | |
| `user_id` | `uuid` | FK ל-`profiles(id)`, ברירת מחדל `auth.uid()` | |
| `log_date` | `date` | חובה | לפי שעון ישראל |
| `weight_kg` | `numeric` | `> 0` או ריק | |
| `workout` | `jsonb` | ראו 3.6.2 | ריק = לא עודכן. `{"rest":true}` = יום מנוחה |
| `meals` | `jsonb` | ראו 3.6.3 | ריק = לא עודכן |
| `calories_in` | `numeric` | | סך קלוריות מאכילה ומשתייה, מחושב בקוד בשמירה |
| `tdee` | `numeric` | | ה-TDEE של אותו יום (לפי המשקל של אותו יום), מחושב בקוד בשמירה |
| `created_at` | `timestamptz` | `now()` | |
| | | `unique (user_id, log_date)` | |

- **מאזן יומי = `calories_in − tdee`.** הוא לא נשמר. מחשבים אותו בכל תצוגה.
- **למה נשמרים `calories_in` ו-`tdee`:** המאזן של ימים קודמים לא ישתנה כשמשקל הפרופיל או מאגר המזון משתנים, ושאילתות ה-KPI וגרסה 1.3 לא יצטרכו לשכפל את הקוד (הנחה).
- **"יום הושלם"** (KPI 2): `weight_kg` לא ריק, `meals` מכיל לפחות פריט אחד, ו-`workout` לא ריק.

### 3.4 `weekly_cycles`

שורה אחת למחזור של 7 ימים לכל משתמש. **התכנית הפעילה היא השורה האחרונה** לפי `cycle_start`.

| עמודה | טיפוס | כללים | הערה |
|-------|-------|-------|------|
| `id` | `uuid` PK | `gen_random_uuid()` | |
| `user_id` | `uuid` | FK ל-`profiles(id)`, ברירת מחדל `auth.uid()` | |
| `cycle_start` | `date` | חובה | |
| `cycle_end` | `date` | `>= cycle_start` | כולל (היום האחרון של המחזור) |
| `menu` | `jsonb` | חובה, ראו 3.6.4 | התפריט שמלווה את המחזור הזה |
| `training_plan` | `jsonb` | חובה, ראו 3.6.5 | התכנית שמלווה את המחזור הזה |
| `report` | `jsonb` | ריק עד סגירת המחזור, ראו 3.6.6 | דוח על המחזור הזה |
| `feedback` | `jsonb` | ריק עד שהמשתמש מזין, ראו 3.6.7 | פידבק של המשתמש על המחזור הזה |
| `created_at` | `timestamptz` | `now()` | |
| | | `unique (user_id, cycle_start)` | מונע יצירת מחזור כפול |

**כלל הקשר בין מחזורים:** שורה N מחזיקה את התכנית שהמשתמש עבד לפיה ב-N, ואת הדוח והפידבק על N. התכנית המעודכנת שנוצרת בסוף N נשמרת בשורה N+1.

### 3.5 מחזור שבועי: כללי תאריכים

כל החישובים בקוד `shared/dates.js`, לפי `Asia/Jerusalem`. תאריך נשמר כמחרוזת `YYYY-MM-DD`. חשבון על תאריכים נעשה ב-UTC על תאריך בלי שעה, כדי שאזור הזמן של המכשיר לא ישפיע.

| כלל | הגדרה |
|-----|--------|
| **המחזור הראשון** | `cycle_start` = היום. `cycle_end` = יום שבת הקרוב, כלומר היום שלפני יום ראשון הקרוב. אם היום יום ראשון, המחזור הוא 7 ימים. אם היום שבת, המחזור הוא יום אחד (הנחה) |
| **מחזור רגיל** | `cycle_start` = `cycle_end` של הקודם + 1 (תמיד יום ראשון). `cycle_end` = `cycle_start` + 6 |
| **מתי אפשר לסגור** | מהיום שאחרי `cycle_end`. אין הגבלה מלמעלה ב-MVP. סגירה באיחור לא משנה את התאריכים של המחזור הבא, והוא יכול להיות כבר בעיצומו (הנחה) |
| **יום ב-`daily_logs`** | `log_date` = התאריך הנוכחי בישראל. אפשר לעדכן גם ימים קודמים, כדי להשלים יום שפוספס (הנחה) |

### 3.6 מבני ה-JSON

#### 3.6.1 `lists.json` (קבוע בריפו)

קודים באנגלית ותוויות בעברית, כדי שאותה רשימה תשמש טפסים, בדיקות והפרומפט.

```json
{
  "goals": [{"code":"lose_weight","label":"ירידה במשקל"},{"code":"maintain_weight","label":"שמירת משקל"},{"code":"strengthen","label":"חיזוק הגוף"}],
  "fitness_levels": [{"code":"sedentary","label":"ישיבתי","factor":1.2},{"code":"low","label":"נמוכה","factor":1.375},{"code":"medium","label":"בינונית","factor":1.55},{"code":"high","label":"גבוהה","factor":1.725}],
  "body_types": [{"code":"ectomorph","label":"רזה (אקטומורף)"},{"code":"mesomorph","label":"בינוני (מזומורף)"},{"code":"endomorph","label":"רחב (אנדומורף)"}],
  "sexes": [{"code":"male","label":"זכר"},{"code":"female","label":"נקבה"}],
  "diet_preferences": [{"code":"vegetarian","label":"צמחוני"},{"code":"vegan","label":"טבעוני"},{"code":"gluten_free","label":"ללא גלוטן"},{"code":"lactose_free","label":"ללא לקטוז"},{"code":"kosher","label":"כשר"},{"code":"none","label":"ללא העדפות"}],
  "meal_slots": [{"code":"breakfast","label":"ארוחת בוקר"},{"code":"morning_snack","label":"ביניים בוקר"},{"code":"lunch","label":"ארוחת צהריים"},{"code":"afternoon_snack","label":"ביניים אחר הצהריים"},{"code":"dinner","label":"ארוחת ערב"}],
  "log_meal_slots": ["breakfast","morning_snack","lunch","afternoon_snack","dinner","drinks"],
  "muscle_groups": [{"code":"arms","label":"ידיים"},{"code":"legs","label":"רגליים"},{"code":"shoulders","label":"כתפיים"},{"code":"back","label":"גב"},{"code":"abs","label":"בטן"}]
}
```

גורמי הפעילות הם הערכים שאושרו ב-`PRD.md` סעיף 4.3. רשימת העדפות התזונה היא ההנחה שב-PRD (לא אושרה סופית).

#### 3.6.2 `daily_logs.workout`

```json
{
  "rest": false,
  "aerobic": [{"exercise_id": "run", "minutes": 30}],
  "strength": [
    {"exercise_id": "squat", "sets": [{"reps": 12, "weight_kg": 40}, {"reps": 10, "weight_kg": 45}]}
  ]
}
```

- `rest: true` בלי `aerobic` ו-`strength` = יום מנוחה.
- ערך שלילי או חסר נחסם בדפדפן עם הודעה (PRD, פיצר 16). `weight_kg` יכול להיות 0 (תרגיל במשקל גוף).
- `exercise_id` חייב להיות ב-`exercises.json`.

#### 3.6.3 `daily_logs.meals`

```json
[
  {"slot": "breakfast", "items": [{"food_id": "11825010", "grams": 200}]},
  {"slot": "drinks", "items": [{"food_id": "14000010", "grams": 250}]}
]
```

- `slot` מתוך `log_meal_slots`. `food_id` הוא `smlmitzrach` ממאגר משרד הבריאות. `grams` מספר חיובי (PRD הנחה 2).
- אין הוספה ידנית של מזון שלא קיים במאגר (PRD הנחה 10).

#### 3.6.4 `weekly_cycles.menu`

```json
{
  "calorie_target": 2100,
  "meals": [
    {
      "slot": "breakfast",
      "items": [{"food_id": "11825010", "grams": 200}],
      "totals": {"kcal": 480, "protein": 28, "fat": 14, "carbs": 62}
    }
  ],
  "totals": {"kcal": 2085, "protein": 140, "fat": 70, "carbs": 230}
}
```

- המודל מחזיר רק `slot` ו-`items`. `totals` ו-`calorie_target` מחושבים בקוד ונוספים לפני השמירה.
- התפריט הוא **תפריט יומי אחד** שחוזר בכל ימי המחזור (PRD: "תפריט יומי מחולק לארוחות"). בין 3 ל-5 ארוחות מתוך `meal_slots` (הנחה). אפשר להרחיב בעתיד לתפריט שונה לכל יום, בלי לשנות את הטבלה.
- `totals` נשמר כתמונת מצב. הצגת הפריטים (שמות) נעשית לפי `food_id` מ-`foods.json`.

#### 3.6.5 `weekly_cycles.training_plan`

```json
{
  "days": [
    {
      "date": "2026-10-18",
      "rest": false,
      "aerobic": {"exercise_id": "walk_fast", "minutes": 30},
      "strength": [
        {"exercise_id": "squat", "sets": 3, "reps": 12},
        {"exercise_id": "plank", "sets": 3, "reps": 1}
      ]
    },
    {"date": "2026-10-19", "rest": true, "aerobic": null, "strength": []}
  ]
}
```

- `days` מכיל **בדיוק את תאריכי המחזור**: 7 ימים, או פחות במחזור הראשון.
- מתיחות הן Should (1.1). השדה `stretching` לא קיים ב-MVP, ויתווסף כמערך באותה צורה.
- חיבור תכנית ליום מתבצע לפי `date`.

#### 3.6.6 `weekly_cycles.report` (מחושב בקוד)

```json
{
  "days_total": 7,
  "days_logged": 5,
  "days_complete": 4,
  "weight": {"first_kg": 80.5, "last_kg": 79.8, "change_kg": -0.7,
             "series": [{"date": "2026-10-18", "kg": 80.5}]},
  "calories": {"avg_in": 2050, "avg_tdee": 2400, "avg_balance": -350,
               "series": [{"date": "2026-10-18", "in": 2100, "tdee": 2400, "balance": -300}]},
  "workout_days": 3,
  "exercises": [{"exercise_id": "squat", "times": 2}],
  "feedback_received": true,
  "summary_text": "נוסח קצר בעברית שהמודל כתב על בסיס המספרים"
}
```

- כל המספרים מחושבים ב-`shared/report.js`. המודל כותב רק את `summary_text`. הוא לא מחשב ולא משנה מספרים.
- ימים חסרים: הדוח מחושב מהימים שהוזנו (PRD 4.2, פיצר 24).
- שדות Should (BMI, זמני אירובי, משקלים וחזרות, שריפת קלוריות) יתווספו כמפתחות נוספים באותו אובייקט בגרסה 1.1.
- `summary_text` יכול להיות ריק אם נוצר דוח בלי קריאה למודל. הדוח עדיין תקין.

#### 3.6.7 `weekly_cycles.feedback`

```json
{"training": "האימונים היו קשים מדי ביום שלישי", "menu": "הארוחות הגדולות מדי בערב", "submitted_at": "2026-10-25T09:12:00+03:00"}
```

טקסט חופשי, עד 500 תווים לכל שדה (הנחה). הפונקציה חותכת בכל מקרה לפני השליחה למודל.

### 3.7 נתוני דמה (חובה לפי הסטאק)

- 5 משתמשי דמה ב-Auth (נוצרים ידנית) עם 5 שורות ב-`profiles`.
- לפחות 14 שורות ב-`daily_logs` (שני משתמשים עם ימים רצופים, כדי לראות דוח אמיתי).
- לפחות 5 שורות ב-`weekly_cycles`, אחת מהן סגורה עם `report` ו-`feedback`.
- הקובץ `supabase/seed.sql` מכיל את הנתונים עם מזהי המשתמשים כפרמטרים להחלפה. סיסמאות לא נשמרות בריפו.

### 3.8 קבצי JSON קבועים בריפו

| קובץ | תוכן | גודל משוער | מי משתמש |
|------|------|------------|-----------|
| `data/foods.json` | מאגר המזון, ערכים ל-100 גרם | כ-640KB (4,620 פריטים) | דפדפן (חיפוש וערכים), פונקציה (בחירת מזונות לתפריט, ערכים) |
| `data/exercises.json` | רשימת תרגילים | קטן | דפדפן ופונקציה |
| `data/lists.json` | רשימות קבועות (3.6.1) | קטן | דפדפן ופונקציה |
| `data/met.json` | ערכי MET | | **Should, 1.1.** מקור הנתונים טרם נבחר |

**מבנה `foods.json`** (מערך):

```json
{"id":"11825010","name":"מי גבינה, חומצי, נוזלי","kcal":24,"protein":0.8,"fat":0.1,"carbs":5.1,"menu":true,"tags":["vegetarian","kosher"]}
```

- נגזר מ-`moh_mitzrachim.csv`: `id` = `smlmitzrach` (ייחודי בכל 4,624 הפריטים), `name` = `shmmitzrach`, `kcal` = `food_energy`, `protein`, `fat` = `total_fat`, `carbs` = `carbohydrates`. כל הערכים ל-100 גרם. מסתפקים בשדות האלה כדי לשמור על גודל הקובץ.
- **פריטים שחסר בהם ערך חלבון, שומן, פחמימה או קלוריות (4 פריטים) לא נכנסים לקובץ.** כך "פריט חסר ערך" לא יכול להופיע בתפריט (PRD 4.2, פיצר 12). פריטים עם 0 קלוריות נשארים, כי מים הם שתייה תקינה.
- **`menu: true`** מסמן את תת-הקבוצה של 300–600 מזונות שהמודל רשאי לבחור מהם (`tech-stack.md`, מחקר קודם). שאר המאגר משמש לחיפוש בעדכון היומי בלבד.
- **`tags`** הם סימוני העדפות תזונה (`vegetarian`, `vegan`, `gluten_free`, `lactose_free`, `kosher`) **רק לפריטים עם `menu: true`**. המאגר המקורי לא כולל אותם. הסימון הוא עבודת הכנה ב-M0 (PRD הנחה 5), ועדיין לא הוחלט אם ידנית. הפונקציה מסננת לפיהם בקוד לפני שהיא שולחת רשימה למודל (סעיף 5.4).
- הקובץ נוצר ע"י סקריפט חד-פעמי `scripts/build-foods.mjs` שרץ על המחשב של בעל המוצר, ולא חלק מהאתר. אין שלב בנייה לאתר.

**מבנה `exercises.json`** (מערך):

```json
{"id":"squat","name":"סקוואט","group":"legs"}
```

`group` הוא אחד מ-`arms`, `legs`, `shoulders`, `back`, `abs` (אימוני כוח), או `aerobic`. `stretching` יתווסף ב-1.1. תוכן הרשימה (אילו תרגילים) טרם נכתב. זה נושא פתוח (סעיף 12).

---

## 4. התחברות והרשאות

רמת הרשאות 2 לפי `course-stack.md`: עד 5 משתמשים שנוצרים ידנית, טופס כניסה בלבד.

### 4.1 תפקידים (לפי PRD סעיף 2)

| תפקיד | מה מותר | איפה נקבע |
|-------|---------|-----------|
| **משתמש אישי** (`role = 'user'`) | קורא וכותב **רק** שורות שה-`user_id` שלהן הוא שלו | הרשאות טבלה (RLS) |
| **מנהל מערכת** (`role = 'admin'`) | קורא את הנתונים של כלל המשתמשים | **Should, 1.3.** הרשאות הטבלה (סעיף 4.4). ב-MVP אין מסכי מנהל, וה-`role` נשמר בלבד |

### 4.2 זרימת הכניסה

1. בעל המוצר יוצר משתמש בדשבורד של Supabase (אימייל וסיסמה), ומסמן אותו כמאומת כדי שיוכל להיכנס (בדיקה ב-M0, ראו סעיף 12).
2. `index.html` הוא טופס כניסה בלבד: אימייל, סיסמה, `signInWithPassword`. בלי הרשמה, שחזור סיסמה, הזמנות או Google.
3. כניסה שגויה: הודעת שגיאה בדף, בלי פירוט מה שגוי.
4. `js/auth.js` מייצא `requireSession()`. כל דף חוץ מ-`index.html` קורא לה בטעינה. אם אין session, מפנה ל-`index.html`.
5. יציאה: `signOut()` והפניה ל-`index.html`.
6. ה-session נשמר ע"י `supabase-js` ב-`localStorage`. זה מנגנון הספרייה, ולא "זיכרון המערכת" שהסטאק אוסר. הנתונים עצמם תמיד ב-Supabase. הדפדפן עצמו רשאי להשתמש ב-`localStorage` רק לטיוטה של טופס העדכון היומי (הנחה).

### 4.3 מדיניות הרשאות (RLS) ב-MVP

ב-`supabase/schema.sql`. RLS מופעל בכל שלוש הטבלאות. משתמש לא מחובר (`anon`) לא מקבל גישה לשום טבלה.

```sql
alter table public.profiles      enable row level security;
alter table public.daily_logs    enable row level security;
alter table public.weekly_cycles enable row level security;

revoke all on public.profiles, public.daily_logs, public.weekly_cycles from anon;

-- profiles: שורה אחת למשתמש, שמזהה שלה הוא המזהה שלו
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- daily_logs ו-weekly_cycles: אותו כלל לפי user_id
create policy daily_logs_own on public.daily_logs
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy weekly_cycles_own on public.weekly_cycles
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
```

- **אין מדיניות מחיקה** ל-`profiles`. מחיקה נעשית ידנית ע"י בעל המוצר.
- **המשתמש לא יכול להפוך את עצמו למנהל.** ההרשאה על העמודה `role` מוסרת מכתיבה:

```sql
revoke insert, update on public.profiles from authenticated;
grant insert (id, name, height_cm, weight_kg, age, sex, body_type, waist_cm, arm_cm, leg_cm,
              diet_preferences, goal, fitness_level, preferred_hours)
  on public.profiles to authenticated;
grant update (id, name, height_cm, weight_kg, age, sex, body_type, waist_cm, arm_cm, leg_cm,
              diet_preferences, goal, fitness_level, preferred_hours)
  on public.profiles to authenticated;
```

  העמודה `id` נכללת גם בהרשאת העדכון, כי upsert של `supabase-js` כותב אותה בחלק ה-`DO UPDATE`. המדיניות (`id = auth.uid()`) מונעת שינוי מזהה בפועל.

  בעל המוצר משנה `role` ידנית ב-Table Editor של Supabase, שעוקף את ההרשאות האלה.
- `(select auth.uid())` ולא `auth.uid()` ישיר, כדי שהערך יחושב פעם אחת בשאילתה.

### 4.4 הרשאות מנהל (Should, גרסה 1.3)

הדשבורד לא נבנה ב-MVP. כשייבנה, מוסיפים פונקציית עזר ב-Postgres (לא Edge Function, ולא רכיב חדש בסטאק) ומדיניות קריאה לכל טבלה:

```sql
create function public.is_admin() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles
                 where id = (select auth.uid()) and role = 'admin')
$$;

create policy profiles_admin_read on public.profiles
  for select to authenticated using (public.is_admin());
-- וכך גם daily_logs ו-weekly_cycles
```

הפונקציה חייבת להיות `security definer`. בלי זה, בדיקת התפקיד בתוך מדיניות על `profiles` עצמה גורמת ללולאה אינסופית. מנהל רק **קורא** (צפייה בלבד), ולכן אין לו מדיניות כתיבה.

### 4.5 אימות בתוך הפונקציה

CORS לא מגן מפני בקשות ישירות (`tech-stack.md`, סעיף 4.4), ולכן הפונקציה מאמתת כל בקשה:

1. קוראת את הכותרת `Authorization: Bearer <JWT>`. אם חסרה: 401 `unauthorized`.
2. יוצרת לקוח `supabase-js` עם כתובת Supabase ומפתח `sb_publishable_` מהגדרות הפונקציה, ועם הכותרת של המשתמש:
   `createClient(URL, PUBLISHABLE_KEY, { global: { headers: { Authorization: 'Bearer ' + jwt } }, auth: { persistSession: false } })`.
3. מאמתת את ה-JWT עם `supabase.auth.getClaims(jwt)`. אם נכשל: 401. המזהה של המשתמש הוא `claims.sub`. אם `getClaims` לא עובד בצד שרת (לא מתועד היטב), עוברים ל-`supabase.auth.getUser(jwt)` (בדיקה ב-M0).
4. כל קריאה וכתיבה אחר כך עוברות דרך הלקוח הזה, ולכן ההרשאות של Supabase חלות. הפונקציה לא יכולה לקרוא או לכתוב נתונים של משתמש אחר, גם אם יש בה באג.
5. הפונקציה לא רושמת ולא מחזירה את ה-JWT.

---

## 5. שכבת ה-AI

### 5.1 דרך הקריאה

```
דפדפן ──POST /api/ask + JWT──▶ api/ask.js ──fetch + x-goog-api-key──▶ Gemini Interactions API
```

- **ספק ודגם:** Gemini דרך Interactions API, `POST https://generativelanguage.googleapis.com/v1beta/interactions`, כותרות `x-goog-api-key` ו-`Content-Type: application/json` (`tech-stack.md`).
- **הדגם נקבע במשתנה סביבה `GEMINI_MODEL`:** `gemini-3.5-flash-lite` לפיתוח ולבדיקות ראשוניות, ו-`gemini-3.6-flash` לבדיקה הסופית ולשימוש בפועל. החלפה = שינוי המשתנה ופריסה מחדש (Redeploy).
- **כל הקריאה לספק מרוכזת בקובץ אחד, `lib/gemini.js`.** כך שינוי בממשק הספק (למשל מעבר ל-`generateContent`) נוגע בקובץ אחד.
- **אף פעם לא מהדפדפן.** n8n לא קורא למודל ב-MVP.

**גוף הבקשה לפי התיעוד הנוכחי:**

```json
{
  "model": "gemini-3.6-flash",
  "system_instruction": "<שלוש המגבלות והוראות הפלט>",
  "input": "<JSON של הקלט, כמחרוזת>",
  "response_format": {
    "type": "text",
    "mime_type": "application/json",
    "schema": { "...": "סכמת הפלט, סעיף 5.3" }
  },
  "generation_config": { "temperature": 0.4 }
}
```

שלושה פרטים שהתיעוד לא מכסה, ויש לאמת בקריאה אמיתית ב-M0 לפני שבונים על זה:
- צורת `system_instruction` (מחרוזת או אובייקט). אם נדחה, ההוראות נכתבות בתחילת `input`.
- הנתיב המדויק של טקסט ה-JSON בתשובת ה-REST. התיעוד מציג רק את `output_text` בספריות. החילוץ נעשה בפונקציה אחת ב-`lib/gemini.js`.
- השם של שדה מקסימום טוקנים (לא מופיע). עד אז הפלט מוגבל ע"י הסכמה (`maxItems`, `maxLength`).

**תקרת זמן:** 120 שניות לכל ניסיון (`AbortController`), ולכן שני ניסיונות נכנסים במקסימום של 300 שניות ב-Vercel Hobby (הנחה).

### 5.2 מה נשלח למודל

הקלט הוא אובייקט JSON אחד שנבנה ב-`lib/prompts.js` מהנתונים השמורים. אין בו שם, אימייל או מזהה משתמש (הנחה, כדי לשלוח רק מה שנדרש).

```json
{
  "task": "generate_plan",
  "profile": {"age": 34, "sex": "female", "height_cm": 165, "weight_kg": 71.2,
              "body_type": "mesomorph", "goal": "lose_weight", "fitness_level": "low",
              "diet_preferences": ["vegetarian"], "waist_cm": 80, "arm_cm": 28, "leg_cm": 54},
  "targets": {"calorie_target": 1850, "tolerance_pct": 10, "meal_slots": ["breakfast","morning_snack","lunch","afternoon_snack","dinner"]},
  "cycle_days": ["2026-10-14","2026-10-15","2026-10-16","2026-10-17"],
  "foods": [{"id":"11825010","name":"...","kcal":24,"protein":0.8,"fat":0.1,"carbs":5.1}],
  "exercises": [{"id":"squat","name":"סקוואט","group":"legs"}],
  "progress": null,
  "feedback": null,
  "previous_plan": null
}
```

| שדה | ב-`generate_plan` | ב-`close_cycle` |
|-----|--------------------|------------------|
| `profile` | מהטבלה. משקל = המשקל האחרון ב-`daily_logs`, ואם אין, המשקל בפרופיל | כנ"ל |
| `targets.calorie_target` | מחושב בקוד (סעיף 6) | כנ"ל, על המשקל העדכני |
| `cycle_days` | ימי המחזור הראשון | 7 ימי המחזור הבא |
| `foods` | רק פריטים עם `menu: true` שעוברים את סינון ההעדפות (5.4) | כנ"ל |
| `exercises` | כל `exercises.json` | כנ"ל |
| `progress` | ריק | ה-`report` המחושב (בלי `summary_text`) |
| `feedback` | ריק | הפידבק, חתוך ל-500 תווים בכל שדה. ריק אם לא הוזן |
| `previous_plan` | ריק | `menu` ו-`training_plan` של המחזור שהסתיים |

**הוראות מערכת (`system_instruction`)** כוללות שלוש מגבלות:
1. לא לתת המלצות רפואיות.
2. לא להמציא נתונים שלא הוזנו.
3. להשתמש רק בנתונים שבקלט.

ובנוסף: להחזיר רק מזהים מתוך `foods` ו-`exercises`, לפעול לפי `calorie_target` ו-`meal_slots`, לכסות את כל ימי `cycle_days`, ולכתוב `summary_text` בעברית פשוטה וקצרה (עד 600 תווים) ללא מספרים שלא מופיעים ב-`progress`.

הפידבק נשלח כשדה נתונים, ולא כהוראה. הוא טקסט של משתמש מורשה, אבל גם אם יכיל הוראות, הפלט נבדק בקוד ואינו יכול לעשות דבר מלבד למלא את הסכמה. הטקסט של הפרומפט נמצא בריפו הציבורי, ולכן אינו סודי.

### 5.3 מה חוזר

JSON בלבד, לפי הסכמה. הסכמה נבנית ב-`lib/schemas.js`.

```json
{
  "type": "object",
  "properties": {
    "menu": {
      "type": "object",
      "properties": {
        "meals": {
          "type": "array", "minItems": 3, "maxItems": 5,
          "items": {
            "type": "object",
            "properties": {
              "slot": {"type": "string", "enum": ["breakfast","morning_snack","lunch","afternoon_snack","dinner"]},
              "items": {
                "type": "array", "minItems": 1, "maxItems": 8,
                "items": {
                  "type": "object",
                  "properties": {
                    "food_id": {"type": "string"},
                    "grams": {"type": "integer", "minimum": 5, "maximum": 800}
                  },
                  "required": ["food_id", "grams"]
                }
              }
            },
            "required": ["slot", "items"]
          }
        }
      },
      "required": ["meals"]
    },
    "training_plan": {
      "type": "object",
      "properties": {
        "days": {
          "type": "array", "minItems": 1, "maxItems": 7,
          "items": {
            "type": "object",
            "properties": {
              "date": {"type": "string", "format": "date"},
              "rest": {"type": "boolean"},
              "aerobic": {
                "type": ["object", "null"],
                "properties": {
                  "exercise_id": {"type": "string"},
                  "minutes": {"type": "integer", "minimum": 5, "maximum": 180}
                },
                "required": ["exercise_id", "minutes"]
              },
              "strength": {
                "type": "array", "maxItems": 10,
                "items": {
                  "type": "object",
                  "properties": {
                    "exercise_id": {"type": "string"},
                    "sets": {"type": "integer", "minimum": 1, "maximum": 10},
                    "reps": {"type": "integer", "minimum": 1, "maximum": 60}
                  },
                  "required": ["exercise_id", "sets", "reps"]
                }
              }
            },
            "required": ["date", "rest", "aerobic", "strength"]
          }
        }
      },
      "required": ["days"]
    },
    "summary_text": {"type": "string", "maxLength": 600}
  },
  "required": ["menu", "training_plan"]
}
```

- `summary_text` נדרש רק ב-`close_cycle` (הקוד מוסיף אותו ל-`required` בפעולה הזו).
- רשימות המזהים התקפים (`food_id`, `exercise_id`) **לא** מופיעות בסכמה כ-`enum`, כי הן ארוכות והתיעוד מזהיר שסכמה גדולה עלולה להידחות. הבדיקה בקוד (5.5).

### 5.4 סינון המזונות לפני השליחה

ב-`lib/plan.js`, בקוד בלבד (המודל לא מסנן):
1. לוקחים פריטים עם `menu: true`.
2. אם בפרופיל יש העדפה שאינה `none`, משאירים רק פריטים שה-`tags` שלהם מכילים **את כל** ההעדפות שנבחרו.
3. אם נשארו פחות מ-100 פריטים (הנחה), הפעולה נכשלת עם `not_enough_foods` ולא נקראת למודל. זה מונע תפריט שגוי למי שבחר העדפות קשות.

### 5.5 בדיקת הפלט (בקוד, `lib/validate.js`)

בדיקה בכתב-יד אחרי כל קריאה למודל. ההשוואה של הסכמה לבדה לא מספיקה.

| בדיקה | כשל |
|-------|------|
| הפלט הוא JSON תקין ועומד במבנה הסכמה | פלט לא תקין |
| כל `food_id` קיים ב-`foods.json` **וגם** ב-`foods` שנשלחו למודל | פלט לא תקין |
| כל `exercise_id` קיים ב-`exercises.json`, `aerobic` משתמש ב-`group: "aerobic"` ו-`strength` בקבוצות כוח | פלט לא תקין |
| `slot` לא חוזר פעמיים בתפריט | פלט לא תקין |
| תאריכי `training_plan.days` זהים בדיוק ל-`cycle_days`, בלי כפילות | פלט לא תקין |
| יום עם `rest: true` ללא `aerobic` וללא `strength` | פלט לא תקין |
| יש לפחות יום אימון אחד | פלט לא תקין |
| במחזור של 7 ימים, חמש קבוצות השרירים (ידיים, רגליים, כתפיים, גב, בטן) מופיעות לפחות פעם אחת | פלט לא תקין |
| סך הקלוריות של התפריט (מחושב בקוד) בטווח `calorie_target ± tolerance_pct` (ברירת מחדל 10%, M2 יאשר, הנחה) | פלט לא תקין |
| `summary_text` קיים ובאורך עד 600 תווים (ב-`close_cycle`) | פלט לא תקין |

אחרי שהבדיקה עברה, הקוד מחשב `totals` לכל ארוחה וליום (`shared/nutrition.js`), מוסיף `calorie_target`, ושומר.

### 5.6 כשל

לפי PRD (הנחה 8):
1. פלט לא תקין: **ניסיון נוסף אחד** (עם אותה קריאה). שני הניסיונות נספרים במכסת הקריאות.
2. נכשל שוב: מחזירים 502 `ai_failed`. **לא נכתב כלום ל-DB**, והתכנית הקודמת נשארת בתוקף.
3. תשובת 429 מהספק (מכסה): לא מנסים שוב. מחזירים 429 `ai_quota`. הדפדפן מציג "המכסה היומית הסתיימה, נסי שוב מחר".
4. שגיאת רשת או 5xx מהספק: ניסיון נוסף אחד, ואז 502.
5. הודעת שגיאה גולמית של הספק לא מוחזרת לדפדפן ולא נרשמת עם נתוני משתמש.

### 5.7 מכסות (לפי `tech-stack.md`)

- Gemini 3.6 Flash חינמי: 5 קריאות לדקה, 20 ליום. Gemini 3.5 Flash-Lite: 15 לדקה, 500 ליום.
- הקריאה האחת לכל פעולה (החלטה 2) מקטינה את הצריכה: משתמש צורך 1 קריאה ליצירת תכנית ו-1 בסוף כל מחזור.
- הדפדפן חוסם לחיצה כפולה בזמן המתנה. הפונקציה לא מבצעת ניסיון אוטומטי נוסף חוץ מ-5.6.
- נתוני דמה בלבד בשכבה החינמית (כלל הסטאק).

### 5.8 קובץ הבדיקות `ai-tests.md`

דרישת הסטאק: לפחות 10 קלטים, תוצאה צפויה לכל אחד ואחוז הצלחה (יעד: 8 מתוך 10, PRD מדד 3). הרצה: סקריפט `scripts/run-ai-tests.mjs` שרץ מקומית ב-Node, קורא את `scripts/ai-tests-inputs.json` (קלטים של דמה, באותה צורה כמו 5.2), מפעיל את אותן `lib/plan.js` ו-`lib/validate.js` שהפונקציה משתמשת בהן, וכותב את התוצאות. מפתח Gemini ניתן כמשתנה סביבה מקומי ולא נשמר בקובץ. הסקריפט הזה הוא הדרך הפשוטה להריץ 10 קלטים בלי ליצור 10 משתמשים (המותר הוא 5) ובלי למחוק מחזורים בין הרצות (הנחה).

---

## 6. חישובים (בקוד, לא במודל)

כל הפונקציות טהורות, ב-`shared/`, ללא תלות בדפדפן או בשרת.

| קובץ | פונקציות | הערה |
|------|-----------|------|
| `shared/calc.js` | `bmr(sex, weight_kg, height_cm, age)` | Mifflin-St Jeor: גבר `10w + 6.25h − 5a + 5`, אישה `10w + 6.25h − 5a − 161` |
| | `tdee(profile, weight_kg)` | `bmr × factor`, כשה-factor מ-`lists.json` לפי `fitness_level` |
| | `calorieTarget(goal, tdee)` | ראו להלן |
| | `balance(calories_in, tdee)` | `calories_in − tdee` |
| | `bmi(weight_kg, height_cm)` | **Should, 1.1** |
| `shared/nutrition.js` | `itemNutrition(food, grams)`, `sumNutrition(items)` | ערך ל-100 גרם כפול `grams/100`. חישוב ארוחה, יום ותפריט |
| `shared/dates.js` | `todayIL()`, `addDays(date, n)`, `weekday(date)`, `firstCycle(today)`, `nextCycle(prevEnd)`, `datesBetween(a, b)` | הכול על מחרוזות `YYYY-MM-DD` ב-UTC. `todayIL()` משתמש ב-`Intl.DateTimeFormat` עם `timeZone: 'Asia/Jerusalem'` |
| `shared/report.js` | `buildReport(logs, cycle, exercisesById)` | הדוח (3.6.6) בלי `summary_text` |

**יעד קלוריות.** PRD (הנחה 9) קובע שגודל ההתאמה לפי מטרה ורצפת קלוריות יוגדרו ב-M2. ההגדרה הממשית נשארת פתוחה (סעיף 12). הממשק `calorieTarget(goal, tdee)` מוגדר עכשיו, וכל המערכת קוראת רק אליו. **עד ההגדרה ב-M2 הוא מחזיר את ה-TDEE ללא התאמה** (הנחה זמנית, כדי שאפשר יהיה לפתח).

**משקל לחישוב TDEE:** משקל היום ב-`daily_logs`. אם לא הוזן, המשקל האחרון שהוזן. אם אין אף אחד, `profiles.weight_kg`.

---

## 7. אינטגרציות, APIs ואוטומציות

### 7.1 סיכום האינטגרציות

| אינטגרציה | מי קורא | דרך | מתי |
|-----------|---------|-----|-----|
| Supabase Auth | דפדפן | `supabase-js` | MVP |
| Supabase DB (PostgREST) | דפדפן, פונקציה | `supabase-js`, תחת RLS | MVP |
| פונקציה `/api/ask` | דפדפן | `fetch` POST | MVP |
| Gemini Interactions API | פונקציה בלבד | `fetch` | MVP |
| Google Fonts (Heebo) | דפדפן | CSS | MVP (הבחירה הסופית ב-`DESIGN.md`) |
| n8n | n8n | Supabase REST, `/api/ask`, Gmail | Should, 1.2 |
| Chart.js | דפדפן | CDN | Should, 1.1 |

### 7.2 החוזה של `POST /api/ask`

**בקשה:**
- כותרות: `Authorization: Bearer <JWT של המשתמש>`, `Content-Type: application/json`.
- גוף:
  - `{"action":"generate_plan"}`
  - `{"action":"close_cycle","cycle_id":"<uuid>"}`
- גודל הגוף קטן מאוד. אין קבצים. הפונקציה דוחה גוף מעל 10KB (הנחה).

**תשובה:** תמיד JSON.

```json
{ "ok": true, "data": { "cycle": { "...": "השורה החדשה מ-weekly_cycles" }, "closed_cycle": { "...": "רק ב-close_cycle: השורה הישנה עם הדוח" } } }
{ "ok": false, "error": { "code": "ai_quota" } }
```

**קודי שגיאה:** הדפדפן ממפה כל קוד להודעה בעברית ב-`js/messages.js`. הפונקציה לא שולחת טקסט חופשי.

| HTTP | `code` | מתי |
|------|--------|-----|
| 400 | `bad_request` | פעולה לא מוכרת או שדה חסר |
| 401 | `unauthorized` | JWT חסר או לא תקין |
| 404 | `not_found` | `cycle_id` לא קיים או לא של המשתמש |
| 405 | `method_not_allowed` | שיטה שאינה POST או OPTIONS |
| 409 | `plan_exists` | `generate_plan` כשיש כבר מחזור |
| 409 | `cycle_not_finished` | `close_cycle` לפני היום שאחרי `cycle_end` |
| 409 | `cycle_closed` | למחזור כבר יש דוח, או שיש מחזור אחריו |
| 413 | `too_large` | גוף גדול מדי |
| 422 | `profile_missing` | אין שורת פרופיל |
| 422 | `not_enough_foods` | הסינון (5.4) השאיר מעט מדי מזונות |
| 429 | `ai_quota` | מכסת Gemini |
| 502 | `ai_failed` | פלט לא תקין פעמיים, או כשל בספק |
| 500 | `server_error` | כל כשל אחר, כולל כשל כתיבה ל-DB |

**CORS (לפי הסטאק):** `Access-Control-Allow-Origin` שווה לערך `ALLOWED_ORIGIN` (המקור של האתר ב-Pages, למשל `https://<user>.github.io`, בלי נתיב). `Allow-Methods: POST, OPTIONS`. `Allow-Headers: Authorization, Content-Type`. `Vary: Origin`. בקשת `OPTIONS` מקבלת 204 עם הכותרות.

### 7.3 סדר פעולות מפורט בפונקציה

**`generate_plan`:**
1. CORS ואימות (4.5).
2. קריאת `profiles` של המשתמש. חסר: `profile_missing`.
3. בדיקה שאין שורות ב-`weekly_cycles`. יש: `plan_exists`.
4. חישוב המחזור הראשון (`firstCycle(todayIL())`), משקל עדכני, TDEE ויעד קלוריות.
5. סינון מזונות (5.4), בניית הקלט, קריאה למודל, בדיקה (5.5), עם ניסיון נוסף אחד.
6. חישוב `totals` והוספת `calorie_target`.
7. הכנסת שורה ל-`weekly_cycles` עם `report` ו-`feedback` ריקים.
8. החזרת השורה.

**`close_cycle`:**
1. CORS ואימות.
2. קריאת שורת המחזור לפי `cycle_id` (RLS). בדיקות: קיימת, `todayIL() > cycle_end`, `report` ריק, ואין שורה עם `cycle_start = cycle_end + 1`.
3. קריאת הפרופיל, ושורות `daily_logs` בטווח המחזור.
4. חישוב הדוח (`buildReport`), המשקל העדכני, TDEE ויעד קלוריות, ו-`nextCycle`.
5. סינון מזונות, בניית הקלט (כולל `progress`, `feedback`, `previous_plan`), קריאה למודל, בדיקה, ניסיון נוסף אחד.
6. הוספת `summary_text` ל-`report`, וחישוב `totals` לתפריט החדש.
7. **כתיבה בבקשה אחת (upsert של מערך שתי שורות):** שורת המחזור הישן, עם `report`, ושורה חדשה למחזור הבא. בקשה אחת = פעולה אחת בבסיס הנתונים, הכול או כלום. אם אחת נכשלת, אף אחת לא נשמרת, והתכנית הקודמת נשארת בתוקף (תיאום עם PRD הנחה 8). **לאמת ב-M0** שהתנהגות ה-upsert כזו. אם לא, נכתבת קודם השורה החדשה (ה-`unique` על `user_id, cycle_start` מונע כפילות), ואחריה העדכון של הישנה.
8. החזרת שתי השורות.

**הגנה מפני לחיצה כפולה או הפעלה כפולה:** `unique (user_id, cycle_start)` גורם לכתיבה השנייה להיכשל. הפונקציה מחזירה `cycle_closed`. מצב ה-DB (סעיף 1.2, החלטה 7) הוא ה"מנעול".

### 7.4 אוטומציות (n8n)

| אוטומציה | סוג | מתי | איך |
|----------|-----|-----|-----|
| הצגת מאזן קלוריות אחרי הזנת היום | אירועית | **MVP** | קוד בדפדפן אחרי השמירה (זרימה ג'). לא n8n |
| עדכון תכנית ותפריט אחרי פידבק | אירועית | **MVP** | `close_cycle` שהמשתמש מפעיל בכפתור (זרימה ד') |
| בקשת פידבק ויצירת דוח שבועי | מתוזמנת | MVP ידני, **Should 1.2** מתוזמן | MVP: כפתור. 1.2: n8n (למטה) |
| תזכורת ב-08:00 אם אין נתוני אתמול | מתוזמנת | **Should, 1.2** | n8n, מייל |
| תזכורת אימון לפי `preferred_hours` | מתוזמנת | **Should, 1.2** | n8n, מייל |
| עדכון דשבורד מנהל | לא הוגדר מנגנון | Should, 1.3 | הדשבורד קורא את הטבלאות בעת טעינת הדף. אין זמן אמת (PRD) |

**ב-MVP n8n לא מפעיל שום זרימה.** מקימים אותו ב-M0 כנדרש ב-PRD (פיצר 37). איפה הוא ירוץ (Cloud בתשלום או אירוח עצמי) הוא החלטה של גרסה 1.2 (`tech-stack.md`, סעיף 4.3).

**תכנון ראשוני לגרסה 1.2 (לא נבנה ב-MVP):**
- **מייל:** צומת Gmail בחשבון Gmail אחד של בעל המוצר, לכתובות בדיקה בלבד. כתובות המשתמשים נקראות מ-Auth דרך ה-Admin API, בלי עמודה נוספת.
- **תזכורות:** Schedule Trigger (אזור זמן ישראל) → קריאת REST ל-Supabase עם `sb_secret_` מה-Credentials של n8n → סינון משתמשים → Gmail.
- **תהליך שבועי:** Schedule Trigger ביום ראשון → לכל משתמש עם מחזור שהסתיים, קריאה ל-`/api/ask` עם `close_cycle`, עם השהיה של 15 שניות בין משתמשים (מגבלת 5 קריאות לדקה).
- **נדרש שינוי בפונקציה, ולכן זו החלטה לגרסה 1.2:** פונקציה שמופעלת ע"י n8n אין לה JWT של משתמש. אפשרות מינימלית: כותרת `x-automation-secret` שמושווה ל-`AUTOMATION_SECRET`, ופונקציה שפועלת עם `sb_secret_`, ומסננת **תמיד** לפי `user_id` בקוד (כי RLS לא חל עליה). מוסיף שני משתני סביבה בפונקציה (סעיף 8). זה בהתאם לחוק המפתחות: מפתח סודי חי רק בפונקציה וב-n8n.
- n8n לא קורא ל-Gemini ישירות, כדי לא לשכפל את הפרומפט והבדיקות.

---

## 8. מפתחות ומה שאסור שיגיע לדפדפן

הריפו ציבורי. כל מה שבקוד גלוי לכולם.

### 8.1 איפה יושב כל מפתח

| סוד / ערך | איפה נשמר | בדפדפן? | מתי |
|-----------|-----------|----------|-----|
| `GEMINI_API_KEY` | משתנה סביבה סודי ב-Vercel | **לעולם לא** | MVP |
| `GEMINI_MODEL` | משתנה סביבה ב-Vercel | לא | MVP |
| `SUPABASE_URL` | `js/config.js` (ציבורי) ומשתנה סביבה ב-Vercel | כן | MVP |
| `SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_...`) | `js/config.js` (ציבורי) ומשתנה סביבה ב-Vercel | **כן, זה היוצא מן הכלל המותר.** מוגן ע"י RLS | MVP |
| `ALLOWED_ORIGIN` | משתנה סביבה ב-Vercel | לא | MVP |
| JWT של המשתמש | `localStorage` (בניהול `supabase-js`), נשלח בכותרת `Authorization` | כן, שלו בלבד | MVP |
| סיסמאות משתמשים | Supabase Auth בלבד | רק בטופס הכניסה | MVP |
| `SUPABASE_SECRET_KEY` (`sb_secret_...`) | משתנה סביבה ב-Vercel, ו-Credentials של n8n | **אסור** | **לא בשימוש ב-MVP.** Should, 1.2 |
| `AUTOMATION_SECRET` | משתנה סביבה ב-Vercel, ו-Credentials של n8n | **אסור** | Should, 1.2 |
| חיבור Gmail (OAuth) | Credentials של n8n | **אסור** | Should, 1.2 |

מפתח סודי חי בשני מקומות בלבד: משתני הסביבה של הפונקציה, ו-n8n.

### 8.2 מה אסור שיגיע לדפדפן או לריפו

- מפתח Gemini, `sb_secret_`, `AUTOMATION_SECRET`, ופרטי החיבור של Gmail: לא בקוד, לא ב-`config.js`, לא ב-HTML, לא בקובץ הגדרות בריפו, ולא בהיסטוריית Git.
- קבצי `.env*`: ב-`.gitignore`. אם צריך קובץ מקומי להרצת `scripts/run-ai-tests.mjs`, הוא ב-`.env.local` ולא נשמר ב-Git.
- מפתחות Supabase הישנים `anon` ו-`service_role`: לא בשימוש (יוצאים משימוש עד סוף 2026).
- הודעת שגיאה גולמית של Gemini או של Supabase: לא מוחזרת לדפדפן.
- תוכן הפרומפט המלא והתשובה הגולמית של המודל: לא נרשמים בלוגים של הפונקציה, כי מכילים נתוני משתמש.
- סיסמאות של משתמשי הדמה: לא ב-`seed.sql` ולא ב-`ai-tests.md`.

### 8.3 הגדרות Vercel

אחרי שינוי במשתנה סביבה צריך פריסה מחדש, ורק אז הפונקציה משתמשת בערך החדש (כלל הסטאק).

---

## 9. מבנה התיקיות של הקוד

ריפו ציבורי אחד, ענף `main` בלבד. אתר ה-Pages מוגש משורש הריפו, ולכן הנתיבים בדפים **יחסיים** (האתר יושב תחת `/<repo>/`).

```
/
├── index.html                  # כניסה (טופס כניסה בלבד)
├── profile.html                # מסך 1: הזנת נתונים
├── nutrition.html              # מסך 2: תכנית תזונה
├── training.html               # מסך 3: תכנית אימונים
├── daily.html                  # מסך 4: עדכון יומי
├── progress.html               # מסך 5: התקדמות ודוחות (+ פידבק + כפתור סיום מחזור)
├── admin.html                  # Should 1.3: דשבורד מנהל
│
├── css/
│   └── style.css               # עיצוב. הפירוט ב-DESIGN.md
│
├── js/                         # קוד הדפדפן
│   ├── config.js               # SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, API_URL (ציבוריים)
│   ├── supabase.js             # יצירת לקוח supabase-js
│   ├── auth.js                 # signIn, signOut, requireSession
│   ├── api.js                  # callAsk(action, params) → POST /api/ask
│   ├── data.js                 # טעינת foods/exercises/lists, שאילתות לטבלאות
│   ├── messages.js             # קודי שגיאה → הודעות בעברית
│   ├── nav.js                  # תפריט ניווט משותף
│   ├── chart-basic.js          # גרף SVG בסיסי (1.1: מוחלף ב-Chart.js)
│   └── pages/                  # קובץ לכל דף
│       ├── login.js  profile.js  nutrition.js  training.js  daily.js  progress.js
│
├── shared/                     # קוד טהור, רץ בדפדפן ובפונקציה
│   ├── calc.js                 # BMR, TDEE, יעד קלוריות, מאזן
│   ├── nutrition.js            # ערכים תזונתיים
│   ├── dates.js                # תאריכים לפי שעון ישראל, מחזורים
│   └── report.js               # בניית הדוח
│
├── api/
│   └── ask.js                  # הפונקציה היחידה ב-Vercel: /api/ask
│
├── lib/                        # קוד שרת בלבד (מיובא ע"י api/ask.js)
│   ├── http.js                 # CORS, תשובות JSON, קודי שגיאה
│   ├── auth.js                 # אימות JWT ויצירת לקוח Supabase
│   ├── gemini.js               # הקריאה ל-Gemini וחילוץ הטקסט
│   ├── prompts.js              # בניית הוראות המערכת והקלט
│   ├── schemas.js              # סכמת הפלט
│   ├── validate.js             # בדיקת הפלט (5.5)
│   ├── plan.js                 # סינון מזונות, הרצת קריאה+בדיקה+ניסיון נוסף
│   └── cycle.js                # generate_plan ו-close_cycle
│
├── data/                       # קבצים קבועים (סעיף 3.8)
│   ├── foods.json
│   ├── exercises.json
│   ├── lists.json
│   └── met.json                # Should 1.1
│
├── supabase/                   # SQL להרצה ידנית ב-SQL Editor
│   ├── schema.sql              # טבלאות
│   ├── policies.sql            # RLS והרשאות עמודה
│   └── seed.sql                # נתוני דמה
│
├── scripts/                    # כלי עזר שרצים על המחשב, לא חלק מהאתר
│   ├── build-foods.mjs         # CSV → data/foods.json
│   ├── moh_mitzrachim.csv      # המקור (משרד הבריאות)
│   ├── run-ai-tests.mjs        # הרצת ai-tests
│   └── ai-tests-inputs.json    # קלטי הדמה
│
├── ai-tests.md                 # דרישת הסטאק: 10 קלטים, תוצאה צפויה, אחוז הצלחה
├── package.json                # "type": "module"; תלות: @supabase/supabase-js
├── .gitignore                  # .env*, node_modules
└── .nojekyll                   # ש-GitHub Pages יגיש את הקבצים כמו שהם, בלי עיבוד
```

הערות:
- **`lib/` ו-`shared/` מחוץ ל-`api/`,** כי כל קובץ בתוך `api/` ב-Vercel הופך לפונקציה נפרדת, והסטאק מורה על פונקציה אחת.
- הפונקציה מייבאת את `data/foods.json` ישירות (`import foods from '../data/foods.json' with { type: 'json' }`), כך שיש מקור אחד לנתונים והוא מגיע עם הפריסה. הדפדפן טוען את אותו קובץ ב-`fetch` מ-Pages.
- הקבצים `api/`, `lib/`, `supabase/` ו-`scripts/` מוגשים גם ע"י Pages כקבצים סטטיים. זה לא מסוכן, כי אין בהם סודות, אבל זו עוד סיבה לשמור שאין מפתח בשום קובץ.
- מסמכי המוצר (`PRD.md` ועוד) אינם חלק מהריפו, אלא אם בעל המוצר יחליט אחרת.

---

## 10. כיסוי דרישות ה-Must

כל דרישת Must מ-`PRD.md` סעיף 4.2 משויכת לרכיב. אין רכיב בלי דרישה.

| # | דרישה | רכיב |
|---|-------|------|
| 1 | כניסה והרשאות | Supabase Auth, `auth.js`, מדיניות RLS (4.2–4.3) |
| 3, 4, 5 | נתונים אישיים, העדפות, מטרה | `profile.html`, `profiles`, `lists.json` |
| 7, 8 | תפריט ותכנית ע"י AI | `generate_plan`, `lib/plan.js`, `lib/gemini.js` |
| 9 | עדכון שבועי | `close_cycle` |
| 10 | מגבלות פרומפט ובדיקת פלט | `lib/prompts.js`, `lib/validate.js` |
| 11 | תפריט יומי | `nutrition.html`, `weekly_cycles.menu` |
| 12 | ערכים תזונתיים | `shared/nutrition.js`, `foods.json` |
| 13, 14 | אירובי וכוח | `training.html`, `weekly_cycles.training_plan`, `exercises.json` |
| 16, 17, 18 | הזנת אימון, ארוחות ומשקל | `daily.html`, `daily_logs` |
| 19 | בסיס נתונים | `supabase/schema.sql` (3 טבלאות) |
| 21, 23 | BMR, TDEE, מאזן | `shared/calc.js`, `daily.html` |
| 24 | דוח שבועי | `shared/report.js`, `weekly_cycles.report`, `progress.html` |
| 26, 27 | פידבק והצגת תכנית מעודכנת | `weekly_cycles.feedback`, `progress.html`, `close_cycle` |
| 35 | Responsive, RTL, נגישות | כל הדפים, `css/style.css`. הפירוט ב-`DESIGN.md` |
| 36 | נתוני דמה ו-`ai-tests.md` | `seed.sql`, `scripts/run-ai-tests.mjs`, `ai-tests.md` |
| 37 | הקמת תשתית | ריפו, Pages, Vercel, Supabase, n8n (הוקם, ללא זרימות ב-MVP) |

---

## 11. אילוצים שהמסמך מכבד

| אילוץ | איך |
|-------|-----|
| עד 3 טבלאות | `profiles`, `daily_logs`, `weekly_cycles`. כל רשימה אחרת בעמודת JSON או בקובץ בריפו |
| רשימה קבועה = קובץ, לא טבלה | `foods`, `exercises`, `lists` ב-`data/` |
| פונקציה אחת, תמיד JSON | `api/ask.js` |
| CORS רק לכתובת האתר ו-OPTIONS | 7.2 |
| קלט מוגבל באורך | גוף עד 10KB, פידבק עד 500 תווים, מזונות מסוננים, `maxItems` בסכמה |
| פלט AI במבנה קבוע שהקוד בודק | 5.3 ו-5.5 |
| חישוב, סינון ותאריכים בקוד | סעיף 6 ו-5.4 |
| אין מפתח בקוד | סעיף 8 |
| בונים טבלה לפני מסך | `schema.sql` קודם לדפים |
| נתוני דמה בלבד בשכבה החינמית | סעיף 5.7 |
| שמות טבלאות ושדות באנגלית, קו תחתון | סעיף 3 |
| עד 5 משתמשים שנוצרים ידנית, בלי הרשמה | סעיף 4.2 |
| ענף `main` בלבד | |
| עברית, RTL, 375px, נגישות | `dir="rtl"` בכל דף. הפירוט ב-`DESIGN.md` |

---

## 12. הנחות ונושאים פתוחים

### 12.1 הנחות שנקבעו במסמך

1. **תפריט יומי אחד** שחוזר בכל ימי המחזור, בין 3 ל-5 ארוחות מתוך חמישה סוגי ארוחה.
2. **קריאה אחת למודל** לתפריט ולתכנית (ולטקסט הדוח ב-`close_cycle`).
3. **המחזור הראשון** מסתיים בשבת הקרובה. נרשמת בשבת, המחזור יהיה יום אחד.
4. **סגירה באיחור** לא משנה את תאריכי המחזור הבא.
5. **אפשר לעדכן ימים קודמים** ב-`daily_logs`.
6. **`calories_in` ו-`tdee` נשמרים** בשורת היום, והמאזן מחושב בכל תצוגה.
7. **גבולות:** פידבק עד 500 תווים לשדה, גוף בקשה עד 10KB, `summary_text` עד 600 תווים, תקרת זמן 120 שניות לניסיון.
8. **סטייה מותרת מיעד הקלוריות:** ±10% עד שיוגדר ב-M2.
9. **מינימום 100 מזונות** אחרי סינון העדפות. פחות מזה, לא קוראים למודל.
10. **לא נשלחים למודל** שם, אימייל או מזהה משתמש.
11. **יעד הקלוריות שווה ל-TDEE** עד שיוגדרו ההתאמות ב-M2.
12. **`scripts/run-ai-tests.mjs`** מריץ את בדיקות ה-AI מקומית ב-Node (הנחה שיש Node במחשב).
13. **טיוטת הטופס היומי** יכולה להישמר ב-`localStorage` (מותר בסטאק לטיוטה).
14. **`.nojekyll`** נוסף כדי ש-Pages לא יעבד את הקבצים.
15. **גרף בסיסי ב-MVP ב-SVG** שנוצר בקוד.

### 12.2 לבדוק ב-M0, לפני שבונים על זה

| # | נושא | מה לבדוק |
|---|------|-----------|
| 1 | Interactions API | צורת `system_instruction`, נתיב הטקסט בתשובת REST, שדה מקסימום טוקנים. אם נכשל, מעבר ל-`generateContent` ב-`lib/gemini.js` בלבד |
| 2 | `getClaims` בצד שרת | עובד עם JWT של משתמש. אחרת `getUser` |
| 3 | יצירת משתמש ידנית | משתמש שנוצר בדשבורד יכול להיכנס בלי אימות אימייל |
| 4 | upsert של שתי שורות | בקשה אחת, הכול או כלום (7.3) |
| 5 | ייבוא JSON בפונקציה | `import ... with { type: 'json' }` נארז בפריסה של Vercel |
| 6 | Supabase | הפרויקט פעיל (מושהה אחרי שבוע בלי פעילות) |

### 12.3 נושאים פתוחים שלא חוסמים

| # | נושא | מתי |
|---|------|-----|
| 1 | יעד הקלוריות לפי מטרה, רצפת קלוריות וסטייה מותרת | M2 |
| 2 | סימון העדפות תזונה (`tags`) בתת-הקבוצה של המזונות. לא נקבע אם ידנית | M0–M1 |
| 3 | תוכן `exercises.json` (אילו תרגילים, ושם כל אחד) | M1 |
| 4 | רשימת העדפות התזונה המדויקת (לא אושרה סופית) | M1 |
| 5 | מקור ערכי MET (פיצר 22) | 1.1 |
| 6 | איפה n8n רץ | 1.2 |
| 7 | הפעלת התהליך השבועי ע"י n8n: `AUTOMATION_SECRET`, `sb_secret_` בפונקציה (7.4) | 1.2 |
| 8 | איכות הפלט בעברית | נבדק ב-`ai-tests.md` |
| 9 | מדדים מצטברים בדשבורד המנהל | לא הוגדרו (Could) |

### 12.4 סתירות

לא נמצאה סתירה בין `PRD.md`, עשרת ההיבטים ו-`tech-stack.md` שמונעת את הכתיבה. שתי נקודות שנסגרו בהחלטה במסמך ולא סותרות את המקורות:
1. **n8n.** `PRD.md` ו-`MVP.md` כוללים הקמת n8n ב-M0, ו-`tech-stack.md` קובע שהוא לא נדרש ב-MVP. ההחלטה: מוקם, ולא משתתף בשום זרימה (החלטה 10).
2. **גרף ב-MVP.** `PRD.md` כולל "גרף בסיסי" ב-MVP, ו-Chart.js ב-`tech-stack.md` הוא Should. ההחלטה: SVG בקוד (החלטה 9).
