# ARCHITECTURE – כושר ותזונה: התאמה פרסונלית

**מקורות:** `PRD.md`, `course-stack.md` (גרסה מ-24.10.2026), `tech-stack.md`, `product-10-definitions.md`, `MVP.md`
**סטטוס:** טיוטה מעודכנת לאישור
**היקף:** תכנון טכני בלבד. בלי Milestones, משימות או לוחות זמנים.

> **איך לקרוא:** כל מה שמסומן **"הנחה"** הוא החלטה טכנית שלא נקבעה במסמכי המקור. הרשימה המלאה בסעיף 12.
> **MVP מול Should:** כל רכיב מסומן אם הוא ב-MVP או ב-Should (גרסאות 1.1–1.3), לפי `PRD.md`.
> `tech-stack.md` נכתב לפני עדכון הסטאק. במקום שהוא מדבר על GitHub Pages, CORS או גישה ישירה לטבלאות, המסמך הזה גובר. המחקר על דגמי Gemini והמכסות שבו נשאר בתוקף.

---

## 1. תמונת מצב והחלטות מרכזיות

### 1.1 במשפט אחד
פרויקט Vercel אחד מגיש גם את האתר הסטטי וגם פונקציה אחת, `api/ask.js`. הדף פונה לפונקציה בכתובת יחסית, ורק הפונקציה ניגשת לטבלאות ב-Supabase ול-Gemini. הדפדפן פונה ל-Supabase ישירות רק לצורך הכניסה. כל החישובים בקוד, והמודל רק בוחר מנות ותרגילים ומנסח טקסט.

### 1.2 החלטות שמעצבות את כל המסמך

| # | החלטה | הסבר במשפט |
|---|-------|-------------|
| 1 | **פרויקט Vercel אחד לאתר ולפונקציה** | לפי הסטאק המעודכן. אין GitHub Pages, אין CORS ואין טיפול ב-OPTIONS |
| 2 | **פונקציה אחת, `api/ask.js`, עם שדה `action`** | הסטאק מורה להתחיל בפונקציה אחת. הפעולות מפורטות בסעיף 7.2 |
| 3 | **הטבלאות נעולות. רק הפונקציה ניגשת אליהן, עם `SUPABASE_SECRET_KEY`** | RLS דולק בלי policy. לקוח אחד ב-`lib/supabase.js`. הסינון לפי המשתמש נעשה בקוד |
| 4 | **זהות המשתמש נקבעת רק מהאימות** | `supabase.auth.getUser(token)`. הפונקציה לא סומכת על מזהה משתמש שהדף שולח |
| 5 | **כל חישוב בקוד משותף אחד, תיקיית `shared/`** | אותו קוד רץ בדפדפן (תצוגה מקדימה) ובפונקציה (הערך שנשמר). אין שלב בנייה |
| 6 | **קריאה אחת למודל מחזירה גם תפריט וגם תכנית שבועית** | חוסך מכסה ושומר על התאמה ביניהם |
| 7 | **ה-AI מחזיר רק מזהים וכמויות:** `food_id` + גרמים, `exercise_id` + נפח | השמות והערכים נלקחים בקוד מהקבצים. הקוד דוחה מזהה שלא קיים |
| 8 | **הקוד מתאים את הגרמים ליעד הקלוריות** | המודל בוחר מזונות ויחסים, והקוד מכפיל את הכמויות כדי להגיע ליעד. כך יעד הקלוריות לא תלוי בחשבון של המודל |
| 9 | **התכנית שבועית, לפי קטגוריות ובלי תאריכים** | המשתמש בוחר מתי לבצע. מספר האימונים המתוכנן נשמר בפרופיל |
| 10 | **מצב ה-DB קובע מה מותר לבצע** | `generate_plan` רק כשאין מחזור. `close_cycle` רק למחזור שהסתיים ושעוד אין לו דוח |
| 11 | **סגירת מחזור נשמרת בפונקציית בסיס נתונים אחת** | עדכון מותנה והוספת שורה באותה טרנזקציה, דרך `rpc`, כפי שהסטאק מורה לפעולה שעלולה לרוץ פעמיים במקביל |
| 12 | **תאריכים תמיד לפי שעון ישראל** (`Asia/Jerusalem`) | התאריך נקבע בקוד משותף, לא לפי שעון המכשיר או השרת |
| 13 | **גרף בסיסי ב-MVP הוא SVG שנוצר בקוד** | בלי ספרייה. Chart.js הוא Should בגרסה 1.1 |
| 14 | **n8n לא מוקם ב-MVP** | ההפעלה היא כפתור באתר. לפי הסטאק הוא נכנס במודול האוטומציות, ותפקידיו מתחילים בגרסה 1.2 (סעיף 7.5) |

### 1.3 מה מחוץ לארכיטקטורה הזו
תשלומים, מפות, אחסון קבצים (Supabase Storage), הרשמה, Push, זמן אמת, שירות דיוור, React וכלי בנייה. אף דרישה ב-PRD לא צריכה אותם.

---

## 2. מבנה המערכת בשלוש שכבות

```
 ┌───────────────────────────── Vercel, כתובת אחת ─────────────────────────┐
 │ שכבה 1: דפים סטטיים (HTML + CSS + JS, בלי build)                         │
 │        │ fetch POST /api/ask + Authorization: Bearer <token>             │
 │        ▼                                                                 │
 │ שכבה 2: api/ask.js + lib/ + shared/                                      │
 └───┬──────────────────────────────────┬────────────────────────┬──────────┘
     │ כניסה בלבד                       │ supabase-js + מפתח סודי │ fetch + x-goog-api-key
     │ (מהדף, מפתח publishable)         │                        ▼
     ▼                                  ▼                 Gemini API (Interactions)
 ┌─────────────────────────────────────────────────────────┐
 │ שכבה 3: Supabase (Auth + Postgres, טבלאות נעולות)        │
 │ profiles · daily_logs · weekly_cycles                    │
 └─────────────────────────────────────────────────────────┘
     + קבצי JSON קבועים בריפו: data/foods.json, exercises.json, lists.json
```

### 2.1 שכבה 1: צד לקוח

**מה זה:** אתר סטטי בענף `main`, שנפרס ב-Vercel. HTML, CSS ו-JavaScript רגילים. מודולי ES בדפדפן (`<script type="module">`), בלי React ובלי שלב בנייה. הדפים בעברית, `<html lang="he" dir="rtl">`.

| רכיב | תפקיד | מתי |
|------|--------|-----|
| 6 דפי HTML | כניסה, הזנת נתונים, תכנית תזונה, תכנית אימונים, עדכון יומי, התקדמות ודוחות (סעיף 9) | MVP |
| `supabase-js` | **כניסה ויציאה בלבד.** נטען ב-`<script>` מ-jsDelivr, בגרסה מדויקת שנקבעת ב-M1 | MVP |
| כתובת Supabase ומפתח `sb_publishable_` | ב-`js/config.js`. נכנסים לדף רק בשביל הכניסה, והם לא פותחים אף טבלה | MVP |
| `js/api.js` | קריאה אחת לפונקציה: `POST /api/ask` עם טוקן הגישה של המשתמש | MVP |
| קוד משותף `shared/` | חישובים ותאריכים, לתצוגה מקדימה בדפדפן | MVP |
| קבצי נתונים | `foods.json` (חיפוש והצגת ערכים), `exercises.json`, `lists.json` | MVP |
| גרף SVG בסיסי | מגמת משקל בדוח (נוצר בקוד, עם טבלה לצדו) | MVP |
| Chart.js 4.5.1 דרך CDN | גרפים מלאים | Should, 1.1 |
| דף דשבורד מנהל | `admin.html` | Should, 1.3 |

**מה הלקוח עושה בעצמו:** כניסה ויציאה, חיפוש מזון ב-`foods.json`, והצגת נתונים שקיבל מהפונקציה.

**מה הלקוח לא עושה:** לא קורא לטבלאות, לא קורא ל-Gemini, לא מחזיק מפתח סודי, ולא קובע הרשאות. כל בדיקת "האם מחובר" בדפדפן היא חוויית משתמש בלבד. טקסט שמגיע מהנתונים מוצג עם `textContent`, ולא עם `innerHTML`.

### 2.2 שכבה 2: לוגיקה (פונקציה ב-Vercel)

**מה זה:** קובץ אחד, `api/ask.js`, שמשתמש במודולים מתיקיית `lib/` (לשרת בלבד) ומתיקיית `shared/`. Node.js 24, מודולי ES (`"type": "module"` ב-`package.json`).

**תפקידים:**
1. אימות המשתמש מטוקן הגישה.
2. בדיקת כל שדה שהתקבל, ובדיקת התנאים המוקדמים של הפעולה מול מצב ה-DB.
3. קריאה וכתיבה ב-Supabase, תמיד מסוננות לפי מזהה המשתמש מהאימות.
4. חישוב ערכים שנשמרים: `calories_in`, `tdee`, יעדים ודוח.
5. בניית הפרומפט, קריאה ל-Gemini, בדיקת הפלט והתאמת הגרמים.
6. החזרת JSON תמיד. פרטים טכניים נרשמים ב-`console.error`, בלי נתוני משתמש.

**תלות חיצונית יחידה בקוד:** `@supabase/supabase-js`. קריאה ל-Gemini דרך `fetch`, בלי ספרייה. בדיקת סכמה בקוד כתוב ביד.

### 2.3 שכבה 3: נתונים

- **Supabase Auth:** משתמשים שנוצרים ידנית בדשבורד (עד 5), כניסה בסיסמה בלבד. הרשמה עצמית מכובה (סעיף 4.2).
- **Supabase Postgres:** שלוש טבלאות בלבד (סעיף 3), RLS דולק בלי policy.
- **קבצי JSON בריפו:** רשימות קבועות (סעיף 3.8). הם לא טבלאות, לפי הסטאק.

### 2.4 ארבע הזרימות המרכזיות

**א. כניסה (MVP)**
1. `signInWithPassword(email, password)` ב-`index.html`.
2. `supabase-js` שומר את ה-session. הדף קורא לפעולה `get_profile`. אם אין פרופיל, עוברים ל-`profile.html`. אם יש, ל-`daily.html`.

**ב. הזנת נתונים ויצירת תכנית ראשונה (MVP)**
1. `profile.html` שולח את האשף לפעולה `save_profile`. הפונקציה בודקת את השדות ושומרת. בשמירה הראשונה היא שומרת גם את `baseline`.
2. הדפדפן קורא לפעולה `generate_plan` ומציג מצב המתנה.
3. הפונקציה בודקת שאין עדיין מחזור, מחשבת יעדים, קוראת ל-Gemini, בודקת את הפלט, מתאימה גרמים, מחשבת ערכים תזונתיים ומכניסה שורה ראשונה ל-`weekly_cycles`.
4. הדפדפן עובר ל-`nutrition.html`.
5. אם הפעולה נכשלה: הודעת שגיאה, ובדף `nutrition.html` כפתור "יצירת תכנית".

**ג. עדכון יומי (MVP)**
1. `daily.html` טוען את `foods.json`, ומקבל מהפעולה `get_daily` את שורת התאריך הנבחר, את התפריט והקטגוריות של התכנית הפעילה.
2. המשתמש בוחר מצב אימון, מסמן ארוחות, מוסיף מזון ב-`+` ומזין משקל.
3. בשמירה, הפעולה `save_daily` בודקת את השדות, מעתיקה את הארוחות שסומנו מהתפריט, מחשבת `calories_in` ו-`tdee`, וכותבת שורה אחת (upsert לפי `user_id, log_date`).
4. התשובה כוללת את המאזן של היום ושל אתמול, והדפדפן מציג אותם. אין אתמול: מוצג רק היום.

**ד. סוף מחזור (MVP, הפעלה בכפתור)**
1. ב-`progress.html`, מהיום שאחרי `cycle_end`, המשתמש רואה את הדוח המחושב (הפעולה `get_report`) וטופס פידבק (הפעולה `save_feedback`).
2. המשתמש לוחץ "סיום מחזור וקבלת תכנית חדשה". הדפדפן קורא ל-`close_cycle` עם `cycle_id`.
3. הפונקציה בודקת שהמחזור שייך למשתמש, הסתיים, ואין לו דוח. מחשבת דוח ויעדים, קוראת ל-Gemini, בודקת, מתאימה גרמים, ושומרת הכול בקריאת `rpc` אחת (סעיף 7.4).
4. הדפדפן מציג את הדוח ואת התכנית המעודכנת יחד.
5. אין פידבק: ההפעלה נמשכת לפי נתוני ההתקדמות בלבד, והדוח מציין שלא התקבל פידבק.

---

## 3. מבנה הנתונים

שלוש טבלאות, כמו בסטאק. שמות באנגלית, באותיות קטנות עם קו תחתון. התוכן בעברית. בונים את הטבלאות לפני המסכים. ה-DDL נשמר בריפו ב-`supabase/schema.sql`.

### 3.1 קשרים

```
auth.users (Supabase Auth, נוצר ידנית)
   │ 1
   │ 1
profiles (id = auth.users.id)
   │ 1                      │ 1
   │ N                      │ N
daily_logs              weekly_cycles
(שורה ליום)             (שורה למחזור)
```

- `daily_logs` ו-`weekly_cycles` קשורות ל-`profiles` ב-`user_id`.
- אין מפתח זר בין `daily_logs` ל-`weekly_cycles`. שיוך יום למחזור נעשה לפי התאריך: `cycle_start <= log_date <= cycle_end`.
- מחיקת משתמש מוחקת את שורותיו (`on delete cascade`).

### 3.2 `profiles`

שורה אחת למשתמש. נוצרת בהזנת הנתונים הראשונה. הטווחים נבדקים בפונקציה וגם כ-`check` בטבלה.

| עמודה | טיפוס | כללים | הערה |
|-------|-------|-------|------|
| `id` | `uuid` PK | FK ל-`auth.users(id)` | שווה למזהה המשתמש ב-Auth |
| `role` | `text` | `'user'` או `'admin'`, ברירת מחדל `'user'` | הפונקציה לא מקבלת אותה מהדפדפן. נקבעת ידנית בדשבורד |
| `name` | `text` | חובה | |
| `birth_date` | `date` | גיל מחושב 18–70 | הגיל מחושב ב-`ageOn()` בפונקציה ובדפדפן. בטבלה נבדקת רק תקינות התאריך, כי `check` לא יכול להשתמש בתאריך הנוכחי |
| `sex` | `text` | `'male'` או `'female'` | נדרש ל-BMR |
| `height_cm` | `numeric` | 120–210 | |
| `weight_kg` | `numeric` | 45–150 | משקל בעת ההזנה. משקל יומי נשמר ב-`daily_logs` |
| `body_type` | `text` | `'ectomorph'`, `'mesomorph'`, `'endomorph'` | |
| `waist_cm` | `numeric` | 40–200 | |
| `arm_cm` | `numeric` | 15–70 | |
| `leg_cm` | `numeric` | 25–100 | |
| `diet_preferences` | `jsonb` | מערך קודים מ-`lists.json`, ברירת מחדל `["none"]` | `"none"` לא משולב עם קוד אחר |
| `goal` | `text` | `'lose_weight'`, `'maintain_weight'`, `'strengthen'` | `lose_weight` נדחה כש-BMI נמוך מ-18.5 |
| `fitness_level` | `text` | `'sedentary'`, `'low'`, `'medium'`, `'high'` | רמת הקושי של התכנית בלבד |
| `workouts_per_week` | `int` | 1–7 | קובע את גורם הפעילות, ומשמש בתצוגת הביצוע |
| `baseline` | `jsonb` | נכתב פעם אחת | נתוני ההתחלה (משקל, היקפים, מטרה ותאריך). משמש את הדוחות העתידיים ואת הדשבורד |
| `preferred_hours` | `jsonb` | יכול להיות ריק | **Should, 1.2.** העמודה קיימת מ-M1 |
| `created_at` | `timestamptz` | ברירת מחדל `now()` | |

### 3.3 `daily_logs`

שורה אחת ליום לכל משתמש. הכתיבה היא upsert, כך שאפשר לתקן את אותו יום.

| עמודה | טיפוס | כללים | הערה |
|-------|-------|-------|------|
| `id` | `uuid` PK | `gen_random_uuid()` | |
| `user_id` | `uuid` | FK ל-`profiles(id)` | מגיע מהאימות |
| `log_date` | `date` | חובה, לא בעתיד | לפי שעון ישראל |
| `weight_kg` | `numeric` | 45–150 או ריק | |
| `workout` | `jsonb` | ראו 3.6.2 | ריק = לא עודכן |
| `meals` | `jsonb` | ראו 3.6.3 | ריק = לא עודכן |
| `calories_in` | `numeric` | | סך קלוריות מאכילה ומשתייה, מחושב בפונקציה |
| `tdee` | `numeric` | | ה-TDEE של אותו יום, מחושב בפונקציה |
| `created_at` | `timestamptz` | `now()` | |
| | | `unique (user_id, log_date)` | |

- **מאזן יומי = `calories_in − tdee`.** הוא לא נשמר. מחשבים אותו בכל תצוגה.
- **למה נשמרים `calories_in` ו-`tdee`:** המאזן של ימים קודמים לא ישתנה כשהפרופיל או מאגר המזון משתנים (הנחה).
- **"יום הושלם"** (KPI 2): `weight_kg` לא ריק, `meals` מכיל פריט אחד לפחות, ו-`workout` לא ריק.

### 3.4 `weekly_cycles`

שורה אחת למחזור לכל משתמש. **התכנית הפעילה היא השורה האחרונה** לפי `cycle_start`.

| עמודה | טיפוס | כללים | הערה |
|-------|-------|-------|------|
| `id` | `uuid` PK | `gen_random_uuid()` | |
| `user_id` | `uuid` | FK ל-`profiles(id)` | מגיע מהאימות |
| `cycle_start` | `date` | חובה | |
| `cycle_end` | `date` | `>= cycle_start` | כולל (היום האחרון של המחזור) |
| `menu` | `jsonb` | חובה, ראו 3.6.4 | התפריט שמלווה את המחזור |
| `training_plan` | `jsonb` | חובה, ראו 3.6.5 | התכנית שמלווה את המחזור |
| `report` | `jsonb` | ריק עד סגירת המחזור, ראו 3.6.6 | דוח על המחזור |
| `feedback` | `jsonb` | ריק עד שהמשתמש מזין, ראו 3.6.7 | פידבק על המחזור |
| `created_at` | `timestamptz` | `now()` | |
| | | `unique (user_id, cycle_start)` | מונע יצירת מחזור כפול |

**כלל הקשר בין מחזורים:** שורה N מחזיקה את התכנית שהמשתמש עבד לפיה ב-N, ואת הדוח והפידבק על N. התכנית המעודכנת שנוצרת בסוף N נשמרת בשורה N+1.

### 3.5 מחזור שבועי: כללי תאריכים

כל החישובים בקוד `shared/dates.js`, לפי `Asia/Jerusalem`. תאריך נשמר כמחרוזת `YYYY-MM-DD`. חשבון על תאריכים נעשה ב-UTC על תאריך בלי שעה.

| כלל | הגדרה |
|-----|--------|
| **המחזור הראשון** | `cycle_start` = היום. `cycle_end` = השבת הקרובה. אם זה נותן פחות מ-3 ימים (שישי או שבת), `cycle_end` = השבת שאחריה, כלומר מחזור של 8 או 9 ימים |
| **מחזור רגיל** | `cycle_start` = יום ראשון האחרון, כולל היום אם היום יום ראשון. `cycle_end` = `cycle_start` + 6 |
| **מתי אפשר לסגור** | מהיום שאחרי `cycle_end`. אין הגבלה מלמעלה ב-MVP |
| **סגירה באיחור** | לפי הכלל של מחזור רגיל, כך שהתכנית החדשה תמיד חלה על השבוע הנוכחי. ימים בפער אינם נכללים בדוח (הנחה) |
| **יום ב-`daily_logs`** | `log_date` = התאריך הנבחר. ברירת מחדל היום בישראל. אפשר לעדכן ימים קודמים, לא ימים עתידיים (הנחה) |

### 3.6 מבני ה-JSON

#### 3.6.1 `lists.json` (קבוע בריפו)

קודים באנגלית ותוויות בעברית, כדי שאותה רשימה תשמש טפסים, בדיקות והפרומפט.

```json
{
  "goals": [{"code":"lose_weight","label":"ירידה במשקל"},{"code":"strengthen","label":"חיזוק וכושר כללי"},{"code":"maintain_weight","label":"שמירה על משקל"}],
  "fitness_levels": [{"code":"sedentary","label":"ישיבתי"},{"code":"low","label":"נמוכה"},{"code":"medium","label":"בינונית"},{"code":"high","label":"גבוהה"}],
  "activity_factors": [{"min":1,"max":2,"factor":1.375},{"min":3,"max":5,"factor":1.55},{"min":6,"max":7,"factor":1.725}],
  "body_types": [{"code":"ectomorph","label":"רזה (אקטומורף)"},{"code":"mesomorph","label":"בינוני (מזומורף)"},{"code":"endomorph","label":"רחב (אנדומורף)"}],
  "sexes": [{"code":"female","label":"נקבה"},{"code":"male","label":"זכר"}],
  "diet_preferences": [{"code":"none","label":"ללא העדפות"},{"code":"vegetarian","label":"צמחוני"},{"code":"vegan","label":"טבעוני"},{"code":"gluten_free","label":"ללא גלוטן"}],
  "meal_slots": [{"code":"breakfast","label":"ארוחת בוקר"},{"code":"snack_1","label":"ארוחת ביניים 1"},{"code":"lunch","label":"ארוחת צהריים"},{"code":"snack_2","label":"ארוחת ביניים 2"},{"code":"dinner","label":"ארוחת ערב"}],
  "training_categories": [{"code":"aerobic","label":"אירובי"},{"code":"legs","label":"רגליים"},{"code":"arms","label":"ידיים"},{"code":"abs","label":"בטן"},{"code":"shoulders","label":"כתפיים"},{"code":"back","label":"גב"}],
  "workout_statuses": [{"code":"full","label":"בוצע מלא"},{"code":"partial","label":"בוצע חלקי"},{"code":"none","label":"לא בוצע"}]
}
```

#### 3.6.2 `daily_logs.workout`

```json
{"status": "partial", "categories": ["legs", "abs"]}
```

- `status` הוא `full`, `partial` או `none`.
- `full`: כל קטגוריות התכנית הפעילה, והפונקציה ממלאת את `categories`.
- `partial`: קטגוריה אחת לפחות, מתוך הקטגוריות של התכנית הפעילה.
- `none`: `categories` ריק.
- יום עם `full` או `partial` נספר כאימון אחד. אין דיווח על דקות, חזרות או משקלים.

#### 3.6.3 `daily_logs.meals`

```json
[
  {"slot": "breakfast", "source": "plan", "items": [{"food_id": "11825010", "grams": 200}]},
  {"slot": "extra", "source": "manual", "items": [{"food_id": "14000010", "grams": 250}]}
]
```

- `source: "plan"`: ארוחה שסומנה בווי. הפונקציה מעתיקה את הפריטים מהתפריט של התכנית הפעילה, כך ששינוי עתידי לא משנה יום שנשמר.
- `source: "manual"`: מזון או שתייה שנוספו ב-`+`, כולם תחת `slot: "extra"`.
- `food_id` הוא `smlmitzrach` ממאגר משרד הבריאות. `grams` מספר חיובי עד 2,000 (הנחה). אין הוספה של מזון שלא קיים במאגר.

#### 3.6.4 `weekly_cycles.menu`

```json
{
  "calorie_target": 2100,
  "protein_target": 114,
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

- המודל מחזיר רק `slot` ו-`items`. היעדים ו-`totals` מחושבים בקוד ונוספים לפני השמירה.
- התפריט הוא **תפריט יומי אחד** שחוזר בכל ימי המחזור, עם **חמש ארוחות בדיוק**, כמו בתמונות.
- `totals` נשמר כתמונת מצב. השמות נלקחים לפי `food_id` מ-`foods.json`.

#### 3.6.5 `weekly_cycles.training_plan`

```json
{
  "workouts_per_week": 4,
  "categories": [
    {"category": "aerobic", "exercises": [{"exercise_id": "walk_fast", "minutes": 30}]},
    {"category": "legs", "exercises": [{"exercise_id": "squat", "sets": 3, "reps": 12}]}
  ]
}
```

- התכנית שבועית, **בלי תאריכים ובלי ימי מנוחה**.
- `categories` מכיל בדיוק את 6 קטגוריות ה-MVP. מתיחות יתווספו כקטגוריה שביעית ב-1.1.
- `workouts_per_week` נלקח בקוד מהפרופיל ברגע יצירת התכנית, כדי שהשוואת הביצוע לא תשתנה בדיעבד.

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
  "workouts": {"done": 3, "planned": 4},
  "categories": [{"category": "legs", "times": 2}],
  "feedback_received": true,
  "summary_text": "נוסח קצר בעברית שהמודל כתב על בסיס המספרים"
}
```

- כל המספרים מחושבים ב-`shared/report.js`. המודל כותב רק את `summary_text`.
- `workouts.planned` הוא `null` במחזור שאינו בן 7 ימים, ואז מוצג רק מספר האימונים שבוצעו.
- ימים חסרים: הדוח מחושב מהימים שהוזנו.
- שדות Should יתווספו כמפתחות נוספים בגרסה 1.1.

#### 3.6.7 `weekly_cycles.feedback`

```json
{"training": "האימונים היו קשים מדי", "menu": "הארוחות גדולות מדי בערב", "submitted_at": "2026-10-25T09:12:00+03:00"}
```

טקסט חופשי, עד 500 תווים לכל שדה (הנחה).

### 3.7 נתוני דמה (חובה לפי הסטאק)

- 5 משתמשי דמה ב-Auth (נוצרים ידנית) עם 5 שורות ב-`profiles`.
- לפחות 14 שורות ב-`daily_logs` (שני משתמשים עם ימים רצופים).
- לפחות 5 שורות ב-`weekly_cycles`, אחת סגורה עם `report` ו-`feedback`, ואחת שהסתיימה ועדיין פתוחה לבדיקת `close_cycle`.
- `supabase/seed.sql` מכיל את הנתונים עם מזהי המשתמשים כפרמטרים להחלפה. סיסמאות לא נשמרות בריפו.

### 3.8 קבצי JSON קבועים בריפו

| קובץ | תוכן | גודל משוער | מי משתמש |
|------|------|------------|-----------|
| `data/foods.json` | מאגר המזון, ערכים ל-100 גרם | כ-640KB (4,620 פריטים) | דפדפן (חיפוש וערכים), פונקציה (בחירת מזונות, ערכים) |
| `data/exercises.json` | רשימת תרגילים | קטן | דפדפן ופונקציה |
| `data/lists.json` | רשימות קבועות (3.6.1) | קטן | דפדפן ופונקציה |
| `data/met.json` | ערכי MET | | **Should, 1.1.** מקור הנתונים טרם נבחר |

**מבנה `foods.json`** (מערך):

```json
{"id":"11825010","name":"מי גבינה, חומצי, נוזלי","kcal":24,"protein":0.8,"fat":0.1,"carbs":5.1,"menu":true,"tags":["vegetarian"]}
```

- נגזר מ-`scripts/moh_mitzrachim.csv`: `id` = `smlmitzrach`, `name` = `shmmitzrach`, `kcal` = `food_energy`, `protein`, `fat` = `total_fat`, `carbs` = `carbohydrates`.
- **ארבעת הפריטים שחסר בהם ערך לא נכנסים לקובץ.** פריטים עם 0 קלוריות נשארים, כי מים הם שתייה תקינה.
- **`menu: true`** מסמן את תת-הקבוצה של 300–600 מזונות שהמודל רשאי לבחור מהם. שאר המאגר משמש לחיפוש בעדכון היומי בלבד.
- **`tags`** הם `vegetarian`, `vegan` ו-`gluten_free`, רק לפריטים עם `menu: true`. טיוטת תת-הקבוצה והסימונים מוכנה על ידי Claude ומאושרת על ידי בעלת המוצר. הסימון אינו מתאים להסתמכות של צליאק או אלרגיה.
- הקובץ נוצר ע"י סקריפט חד-פעמי `scripts/build-foods.mjs`. אין שלב בנייה לאתר.

**מבנה `exercises.json`** (מערך):

```json
{"id":"squat","name":"סקוואט","category":"legs","equipment":"bodyweight","level":"low"}
```

- `category` הוא אחד מקודי `training_categories`.
- `equipment` הוא `bodyweight` או `dumbbells` בלבד, כך שכל תרגיל אפשרי גם בבית וגם בחדר כושר. האפליקציה לא מתייחסת למקום האימון.
- `level` הוא רמת הקושי המינימלית, לפי `fitness_levels`. הקוד שולח למודל רק תרגילים שמתאימים לרמת המשתמש (הנחה).

---

## 4. התחברות והרשאות

רמת הרשאות 2 לפי `course-stack.md`: עד 5 משתמשים שנוצרים ידנית, טופס כניסה בלבד.

### 4.1 תפקידים

| תפקיד | מה מותר | איפה נקבע |
|-------|---------|-----------|
| **משתמש אישי** (`role = 'user'`) | קורא וכותב **רק** שורות של עצמו | הפונקציה מסננת לפי המזהה מהאימות |
| **מנהל מערכת** (`role = 'admin'`) | קורא את הנתונים של כלל המשתמשים | **Should, 1.3.** הפונקציה בודקת את התפקיד (סעיף 4.5). ב-MVP ה-`role` נשמר בלבד |

### 4.2 זרימת הכניסה

1. בעלת המוצר מכבה בדשבורד של Supabase את `Allow new users to sign up`: Authentication, ואז Sign In / Providers. אחרת כל מי שיש לו המפתח הציבורי יכול לפתוח לעצמו משתמש.
2. בעלת המוצר יוצרת משתמש בדשבורד (אימייל וסיסמה), ומסמנת אותו כמאומת (בדיקה ב-M1).
3. `index.html` הוא טופס כניסה בלבד: אימייל, סיסמה, `signInWithPassword`. בלי הרשמה, שחזור סיסמה, הזמנות או Google.
4. כניסה שגויה: הודעת שגיאה בדף, בלי פירוט מה שגוי.
5. `js/auth.js` מייצא `requireSession()`. כל דף חוץ מ-`index.html` קורא לה בטעינה. אם אין session, מפנה ל-`index.html`.
6. יציאה: `signOut()` והפניה ל-`index.html`.
7. ה-session נשמר ע"י `supabase-js` ב-`localStorage`. זה מנגנון הספרייה. הנתונים עצמם תמיד ב-Supabase. הדף עצמו רשאי להשתמש ב-`localStorage` רק לטיוטה של טופס העדכון היומי (הנחה).

### 4.3 נעילת הטבלאות

ב-`supabase/policies.sql`. לפי הסטאק: RLS דולק בלי אף policy, בלי הרשאות ל-`anon` ול-`authenticated`, והרשאה מפורשת ל-`service_role` רק על מה שהמוצר צריך. מ-30.10.2026 Supabase לא נותנת לטבלה חדשה הרשאות אוטומטית, גם לא ל-`service_role`.

```sql
alter table public.profiles      enable row level security;
alter table public.daily_logs    enable row level security;
alter table public.weekly_cycles enable row level security;

revoke all on public.profiles, public.daily_logs, public.weekly_cycles
  from anon, authenticated;

grant select, insert, update on public.profiles, public.daily_logs, public.weekly_cycles
  to service_role;
```

- **אין הרשאת מחיקה.** מחיקה נעשית ידנית ע"י בעלת המוצר.
- **המשתמש לא יכול להפוך את עצמו למנהל,** כי הפונקציה לא מקבלת את `role` בשום פעולה.
- אם Supabase מציעה להוסיף policy או grant ל-`anon`, לא מקבלים את ההצעה.
- מפתח סודי עוקף את RLS, ולכן **כל שאילתה בפונקציה מסוננת לפי `user_id` מהאימות.** הקוד מרכז זאת ב-`lib/store.js`, כדי שלא תהיה שאילתה בלי סינון.

### 4.4 פונקציית בסיס הנתונים

ב-`supabase/functions.sql`. לפי הסטאק: `security invoker`, `search_path` ריק, שמות מלאים, ו-`execute` ל-`service_role` בלבד.

```sql
create function public.commit_close_cycle(
  p_user_id uuid, p_cycle_id uuid, p_report jsonb,
  p_next_start date, p_next_end date, p_menu jsonb, p_training_plan jsonb
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare v_next_id uuid;
begin
  update public.weekly_cycles set report = p_report
   where id = p_cycle_id and user_id = p_user_id and report is null;
  if not found then
    raise exception 'cycle_closed';
  end if;
  insert into public.weekly_cycles (user_id, cycle_start, cycle_end, menu, training_plan)
  values (p_user_id, p_next_start, p_next_end, p_menu, p_training_plan)
  returning id into v_next_id;
  return v_next_id;
end $$;

revoke execute on function public.commit_close_cycle from public, anon, authenticated;
grant execute on function public.commit_close_cycle to service_role;
```

הפונקציה רצה בטרנזקציה אחת: אם ההוספה נכשלת, גם הדוח לא נשמר. לחיצה כפולה מסתיימת ב-`cycle_closed`, והמחזור לא נדרס.

### 4.5 הרשאות מנהל (Should, גרסה 1.3)

הדשבורד לא נבנה ב-MVP. כשייבנה, הוא יעבור דרך הפונקציה: פעולות מנהל ייקראו את `role` של המשתמש המאומת מהטבלה, יחזירו 403 אם אינו `admin`, ורק אז יקראו נתונים של משתמש אחר. המנהל רק קורא.

### 4.6 אימות בתוך הפונקציה

1. קוראת את הכותרת `Authorization: Bearer <token>`. אם חסרה: 401 `unauthorized`.
2. מאמתת עם `supabase.auth.getUser(token)`, לפני כל גישה לנתונים. אם נכשל: 401.
3. המזהה של המשתמש הוא `user.id`. כל קריאה וכתיבה מסוננות לפיו.
4. הפונקציה לא רושמת ולא מחזירה את הטוקן.

---

## 5. שכבת ה-AI

### 5.1 דרך הקריאה

```
דפדפן ──POST /api/ask + token──▶ api/ask.js ──fetch + x-goog-api-key──▶ Gemini Interactions API
```

- **ספק ודגם:** Gemini דרך Interactions API, `POST https://generativelanguage.googleapis.com/v1beta/interactions`, כותרות `x-goog-api-key` ו-`Content-Type: application/json`.
- **הדגם נקבע במשתנה סביבה `GEMINI_MODEL`,** עם ברירת מחדל בקוד: `gemini-3.5-flash-lite`, לפיתוח, לבדיקה הסופית ולאתר החי (ADR-6). החלפה = שינוי המשתנה ופריסה מחדש.
- **כל הקריאה לספק מרוכזת בקובץ אחד, `lib/gemini.js`.**
- **אף פעם לא מהדפדפן.**

**גוף הבקשה לפי התיעוד הנוכחי:**

```json
{
  "model": "gemini-3.5-flash-lite",
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

שלושה פרטים שהתיעוד לא מכסה, ויש לאמת בקריאה אמיתית ב-M1:
- צורת `system_instruction`. אם נדחה, ההוראות נכתבות בתחילת `input`.
- הנתיב המדויק של טקסט ה-JSON בתשובת ה-REST.
- השם של שדה מקסימום טוקנים. עד אז הפלט מוגבל ע"י הסכמה.

**תקרת זמן:** 120 שניות לכל ניסיון (`AbortController`), ולכן שני ניסיונות נכנסים במקסימום של 300 שניות ב-Vercel Hobby (הנחה).

### 5.2 מה נשלח למודל

הקלט הוא אובייקט JSON אחד שנבנה ב-`lib/prompts.js` מהנתונים השמורים. אין בו שם, אימייל, תאריך לידה או מזהה משתמש, אלא רק גיל מחושב.

```json
{
  "task": "generate_plan",
  "profile": {"age": 34, "sex": "female", "height_cm": 165, "weight_kg": 71.2,
              "body_type": "mesomorph", "goal": "lose_weight", "fitness_level": "low",
              "workouts_per_week": 4, "diet_preferences": ["vegetarian"],
              "waist_cm": 80, "arm_cm": 28, "leg_cm": 54},
  "targets": {"calorie_target": 1850, "protein_target": 114,
              "meal_slots": ["breakfast","snack_1","lunch","snack_2","dinner"],
              "training_categories": ["aerobic","legs","arms","abs","shoulders","back"]},
  "foods": [{"id":"11825010","name":"...","kcal":24,"protein":0.8,"fat":0.1,"carbs":5.1}],
  "exercises": [{"id":"squat","name":"סקוואט","category":"legs"}],
  "progress": null,
  "feedback": null,
  "previous_plan": null
}
```

| שדה | ב-`generate_plan` | ב-`close_cycle` |
|-----|--------------------|------------------|
| `profile` | מהטבלה. משקל = המשקל האחרון ב-`daily_logs`, ואם אין, המשקל בפרופיל | כנ"ל |
| `targets` | מחושב בקוד (סעיף 6) | כנ"ל, על המשקל העדכני |
| `foods` | רק פריטים עם `menu: true` שעוברים את סינון ההעדפות (5.4) | כנ"ל |
| `exercises` | תרגילים שמתאימים לרמת הכושר | כנ"ל |
| `progress` | ריק | ה-`report` המחושב (בלי `summary_text`) |
| `feedback` | ריק | הפידבק, חתוך ל-500 תווים בכל שדה. ריק אם לא הוזן |
| `previous_plan` | ריק | `menu` ו-`training_plan` של המחזור שהסתיים |

**הוראות מערכת** כוללות שלוש מגבלות:
1. לא לתת המלצות רפואיות.
2. לא להמציא נתונים שלא הוזנו.
3. להשתמש רק בנתונים שבקלט.

ובנוסף: להחזיר רק מזהים מתוך `foods` ו-`exercises`, לכסות את כל הארוחות והקטגוריות, לכוון ליעדי הקלוריות והחלבון, להתאים את נפח התכנית למספר האימונים ולרמת הכושר, לא לחלק לימים, ולכתוב `summary_text` בעברית פשוטה, בניסוח שמתאים לכל מגדר, עד 600 תווים, ללא מספרים שלא מופיעים ב-`progress`.

הפידבק נשלח כשדה נתונים, ולא כהוראה. גם אם יכיל הוראות, הפלט נבדק בקוד ואינו יכול לעשות דבר מלבד למלא את הסכמה.

### 5.3 מה חוזר

JSON בלבד, לפי הסכמה ב-`lib/schemas.js`.

```json
{
  "type": "object",
  "properties": {
    "menu": {
      "type": "object",
      "properties": {
        "meals": {
          "type": "array", "minItems": 5, "maxItems": 5,
          "items": {
            "type": "object",
            "properties": {
              "slot": {"type": "string", "enum": ["breakfast","snack_1","lunch","snack_2","dinner"]},
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
        "categories": {
          "type": "array", "minItems": 6, "maxItems": 6,
          "items": {
            "type": "object",
            "properties": {
              "category": {"type": "string", "enum": ["aerobic","legs","arms","abs","shoulders","back"]},
              "exercises": {
                "type": "array", "minItems": 1, "maxItems": 6,
                "items": {
                  "type": "object",
                  "properties": {
                    "exercise_id": {"type": "string"},
                    "minutes": {"type": "integer", "minimum": 5, "maximum": 180},
                    "sets": {"type": "integer", "minimum": 1, "maximum": 10},
                    "reps": {"type": "integer", "minimum": 1, "maximum": 60}
                  },
                  "required": ["exercise_id"]
                }
              }
            },
            "required": ["category", "exercises"]
          }
        }
      },
      "required": ["categories"]
    },
    "summary_text": {"type": "string", "maxLength": 600}
  },
  "required": ["menu", "training_plan"]
}
```

- `summary_text` נדרש רק ב-`close_cycle`.
- רשימות המזהים התקפים **לא** מופיעות בסכמה כ-`enum`, כי סכמה גדולה עלולה להידחות. הבדיקה בקוד (5.5).

### 5.4 סינון המזונות לפני השליחה

ב-`lib/plan.js`, בקוד בלבד:
1. לוקחים פריטים עם `menu: true`.
2. אם בפרופיל יש העדפה שאינה `none`, משאירים רק פריטים שה-`tags` שלהם מכילים **את כל** ההעדפות שנבחרו.
3. אם נשארו פחות מ-100 פריטים (הנחה), הפעולה נכשלת עם `not_enough_foods` ולא נקראת למודל.

### 5.5 בדיקת הפלט והתאמת הגרמים (בקוד)

**בדיקה ב-`lib/validate.js`,** אחרי כל קריאה למודל:

| בדיקה | כשל |
|-------|------|
| הפלט הוא JSON תקין ועומד במבנה הסכמה | פלט לא תקין |
| כל `food_id` נמצא ב-`foods` שנשלחו למודל | פלט לא תקין |
| כל `exercise_id` נמצא ברשימה שנשלחה, ושייך לקטגוריה שבה הופיע | פלט לא תקין |
| באירובי יש `minutes`, ובכוח יש `sets` ו-`reps` | פלט לא תקין |
| חמש הארוחות ושש הקטגוריות מופיעות פעם אחת בדיוק | פלט לא תקין |
| `summary_text` קיים ובאורך עד 600 תווים (ב-`close_cycle`) | פלט לא תקין |

**התאמת גרמים ב-`shared/nutrition.js`,** אחרי שהבדיקה עברה:
1. מחשבים `factor = calorie_target / kcal`, כש-`kcal` הוא סך קלוריות התפריט.
2. אם `factor` מחוץ לטווח 0.5–1.5, התפריט רחוק מדי מהיעד, והפלט נחשב לא תקין (הנחה).
3. כל כמות מוכפלת ב-`factor` ומעוגלת ל-5 גרם.
4. מחשבים `totals` לכל ארוחה וליום, ומוסיפים את היעדים.

**יעד החלבון אינו תנאי כשל.** הוא נשלח למודל ומוצג מול הערך בפועל, כדי שתפריט טבעוני לא ייכשל שוב ושוב (הנחה). האחוז נמדד ב-`ai-tests.md`.

### 5.6 כשל

1. פלט לא תקין: **ניסיון נוסף אחד.** שני הניסיונות נספרים במכסה.
2. נכשל שוב: 502 `ai_failed`. **לא נכתב כלום ל-DB**, והתכנית הקודמת נשארת בתוקף.
3. תשובת 429 מהספק: לא מנסים שוב. 429 `ai_quota`. הדפדפן מציג "המכסה היומית הסתיימה, אפשר לנסות שוב מחר".
4. שגיאת רשת או 5xx מהספק: ניסיון נוסף אחד, ואז 502.
5. הודעת שגיאה גולמית של הספק לא מוחזרת לדפדפן ולא נרשמת עם נתוני משתמש.

### 5.7 מכסות (לפי `tech-stack.md`)

- Gemini 3.5 Flash-Lite חינמי (הדגם הנבחר, ADR-6): 15 קריאות לדקה, 500 ליום. לשם השוואה, Gemini 3.6 Flash: 5 לדקה, 20 ליום.
- משתמש צורך קריאה אחת ליצירת תכנית וקריאה אחת בסוף כל מחזור.
- הדפדפן חוסם לחיצה כפולה בזמן המתנה. לחיצה כפולה מכרטיסיות שונות עלולה לצרוך קריאה נוספת, אבל לא לכתוב פעמיים (4.4).
- נתוני דמה בלבד בשכבה החינמית.

### 5.8 קובץ הבדיקות `ai-tests.md`

דרישת הסטאק: לפחות 10 קלטים, תוצאה צפויה לכל אחד ואחוז הצלחה (יעד: 8 מתוך 10). הרצה: סקריפט `scripts/run-ai-tests.mjs` שרץ מקומית ב-Node, קורא את `scripts/ai-tests-inputs.json`, מפעיל את אותן `lib/plan.js` ו-`lib/validate.js`, וכותב את התוצאות. המפתח מגיע מ-`.env.local`. Claude לא קורא את הקובץ.

---

## 6. חישובים (בקוד, לא במודל)

כל הפונקציות טהורות, ב-`shared/`, ללא תלות בדפדפן או בשרת.

| קובץ | פונקציות | הערה |
|------|-----------|------|
| `shared/calc.js` | `ageOn(birth_date, date)` | גיל בשנים שלמות בתאריך נתון |
| | `bmr(sex, weight_kg, height_cm, age)` | Mifflin-St Jeor: גבר `10w + 6.25h − 5a + 5`, אישה `10w + 6.25h − 5a − 161` |
| | `activityFactor(workouts_per_week, lists)` | 1–2: 1.375. 3–5: 1.55. 6–7: 1.725 |
| | `tdee(profile, weight_kg, date, lists)` | `bmr × activityFactor` |
| | `calorieTarget(goal, sex, tdee, bmi)` | ירידה: `tdee − 400`. שמירה: `tdee`. חיזוק: `tdee + 150`. רצפה: 1,200 לאישה, 1,500 לגבר. ירידה עם BMI נמוך מ-18.5 מחושבת כשמירה |
| | `proteinTarget(weight_kg)` | `1.6 × weight_kg` |
| | `bmi(weight_kg, height_cm)` | ב-MVP לחסימה בלבד, בלי תצוגה |
| | `balance(calories_in, tdee)` | `calories_in − tdee` |
| `shared/nutrition.js` | `itemNutrition`, `sumNutrition`, `scaleMenu` | ערך ל-100 גרם כפול `grams/100`, וחישוב ההתאמה מ-5.5 |
| `shared/dates.js` | `todayIL()`, `addDays(date, n)`, `weekday(date)`, `firstCycle(today)`, `nextCycle(today)`, `datesBetween(a, b)` | הכול על מחרוזות `YYYY-MM-DD`. `todayIL()` משתמש ב-`Intl.DateTimeFormat` עם `timeZone: 'Asia/Jerusalem'` |
| `shared/report.js` | `buildReport(logs, cycle)` | הדוח (3.6.6) בלי `summary_text` |

**משקל לחישוב TDEE:** משקל היום ב-`daily_logs`. אם לא הוזן, המשקל האחרון שהוזן. אם אין אף אחד, `profiles.weight_kg`.

---

## 7. אינטגרציות, APIs ואוטומציות

### 7.1 סיכום האינטגרציות

| אינטגרציה | מי קורא | דרך | מתי |
|-----------|---------|-----|-----|
| Supabase Auth, כניסה ויציאה | דפדפן | `supabase-js`, מפתח publishable | MVP |
| Supabase Auth, אימות טוקן | פונקציה | `getUser` | MVP |
| Supabase DB | פונקציה בלבד | `supabase-js`, מפתח סודי | MVP |
| פונקציה `/api/ask` | דפדפן | `fetch` POST, כתובת יחסית | MVP |
| Gemini Interactions API | פונקציה בלבד | `fetch` | MVP |
| Google Fonts (Heebo) | דפדפן | CSS | MVP |
| n8n | n8n | Gmail, `/api/ask` | Should, 1.2 |
| Chart.js | דפדפן | CDN | Should, 1.1 |

### 7.2 החוזה של `POST /api/ask`

**בקשה:** כותרות `Authorization: Bearer <token>` ו-`Content-Type: application/json`. בגוף תמיד `action`. הפונקציה בודקת כל שדה, ודוחה גוף מעל 10KB (הנחה).

| `action` | שדות נוספים | מה מחזיר |
|----------|--------------|----------|
| `get_profile` | | הפרופיל, עם `age` מחושב, בלי `role` |
| `save_profile` | שדות הפרופיל, בלי `role` ובלי `baseline` | הפרופיל |
| `get_daily` | `date` | שורת היום, התפריט והקטגוריות הפעילים |
| `save_daily` | `date`, `weight_kg`, `workout`, `checked_slots`, `extra_items` | השורה, ומאזן היום ואתמול |
| `get_cycles` | | המחזורים של המשתמש, מהחדש לישן, עד 52 (הנחה) |
| `get_report` | `cycle_id` | הדוח השמור, או דוח מחושב למחזור שעוד לא נסגר |
| `save_feedback` | `cycle_id`, `training`, `menu` | המחזור |
| `generate_plan` | | המחזור החדש |
| `close_cycle` | `cycle_id` | המחזור הישן עם הדוח, והמחזור החדש |

**תשובה:** תמיד JSON.

```json
{ "ok": true, "data": { "...": "לפי הפעולה" } }
{ "ok": false, "error": { "code": "ai_quota", "fields": {} } }
```

**קודי שגיאה:** הדפדפן ממפה כל קוד להודעה בעברית ב-`js/messages.js`. הפונקציה לא שולחת טקסט חופשי.

| HTTP | `code` | מתי |
|------|--------|-----|
| 400 | `bad_request` | פעולה לא מוכרת או שדה חסר |
| 400 | `invalid_fields` | ערך לא תקין. `fields` מציין אילו שדות |
| 401 | `unauthorized` | טוקן חסר או לא תקין |
| 404 | `not_found` | `cycle_id` לא קיים או לא של המשתמש |
| 405 | `method_not_allowed` | שיטה שאינה POST |
| 409 | `plan_exists` | `generate_plan` כשיש כבר מחזור |
| 409 | `cycle_not_finished` | `close_cycle` לפני היום שאחרי `cycle_end` |
| 409 | `cycle_closed` | למחזור כבר יש דוח |
| 413 | `too_large` | גוף גדול מדי |
| 422 | `profile_missing` | אין שורת פרופיל |
| 422 | `no_plan` | אין תכנית פעילה, ונשלח דיווח שדורש אותה |
| 422 | `not_enough_foods` | הסינון (5.4) השאיר מעט מדי מזונות |
| 429 | `ai_quota` | מכסת Gemini |
| 502 | `ai_failed` | פלט לא תקין פעמיים, או כשל בספק |
| 500 | `server_error` | כל כשל אחר, כולל כשל כתיבה ל-DB |

**CORS:** אין. הדף והפונקציה באותה כתובת, ולכן אין כותרות CORS ואין טיפול ב-OPTIONS.

### 7.3 `generate_plan`

1. אימות (4.6).
2. קריאת הפרופיל של המשתמש. חסר: `profile_missing`.
3. בדיקה שאין שורות ב-`weekly_cycles`. יש: `plan_exists`.
4. חישוב המחזור הראשון, משקל עדכני, TDEE ויעדים.
5. סינון מזונות, בניית הקלט, קריאה למודל, בדיקה והתאמת גרמים, עם ניסיון נוסף אחד.
6. הכנסת שורה ל-`weekly_cycles`. התנגשות על `unique`: `plan_exists`.
7. החזרת השורה.

### 7.4 `close_cycle`

1. אימות.
2. קריאת שורת המחזור לפי `cycle_id` ו-`user_id`. בדיקות: קיימת, `todayIL() > cycle_end`, `report` ריק.
3. קריאת הפרופיל ושורות `daily_logs` בטווח המחזור.
4. חישוב הדוח, המשקל העדכני, TDEE ויעדים, ותאריכי המחזור הבא (`nextCycle(todayIL())`).
5. סינון מזונות, בניית הקלט (כולל `progress`, `feedback`, `previous_plan`), קריאה למודל, בדיקה והתאמת גרמים, עם ניסיון נוסף אחד.
6. הוספת `summary_text` לדוח.
7. קריאת `rpc` ל-`commit_close_cycle` (4.4). שגיאת `cycle_closed` או התנגשות על `unique`: 409 `cycle_closed`.
8. החזרת שתי השורות.

### 7.5 אוטומציות (n8n)

| אוטומציה | סוג | מתי | איך |
|----------|-----|-----|-----|
| הצגת מאזן קלוריות אחרי הזנת היום | אירועית | **MVP** | תשובת `save_daily`. לא n8n |
| עדכון תכנית ותפריט אחרי פידבק | אירועית | **MVP** | `close_cycle` בכפתור |
| בקשת פידבק ויצירת דוח שבועי | מתוזמנת | MVP בכפתור, **Should 1.2** מתוזמן | |
| תזכורת ב-08:00 אם אין נתוני אתמול | מתוזמנת | **Should, 1.2** | n8n, מייל |
| תזכורת אימון לפי `preferred_hours` | מתוזמנת | **Should, 1.2** | n8n, מייל |
| עדכון דשבורד מנהל | לא הוגדר מנגנון | Should, 1.3 | הדשבורד קורא דרך הפונקציה בטעינת הדף |

**ב-MVP אין n8n.** איפה הוא ירוץ הוא החלטה של גרסה 1.2.

**תכנון ראשוני לגרסה 1.2 (לא נבנה ב-MVP):**
- **מייל:** צומת Gmail בחשבון אחד של בעלת המוצר, לכתובות בדיקה בלבד.
- **תזכורות:** Schedule Trigger (אזור זמן ישראל), קריאה ל-Supabase עם מפתח סודי מה-Credentials של n8n, סינון משתמשים ו-Gmail.
- **תהליך שבועי:** Schedule Trigger ביום ראשון, קריאה ל-`/api/ask` לכל משתמש עם מחזור שהסתיים, עם השהיה של 15 שניות בין משתמשים.
- **נדרש שינוי בפונקציה:** ל-n8n אין טוקן משתמש. אפשרות מינימלית: כותרת `x-automation-secret` מול `AUTOMATION_SECRET`, עם `user_id` מפורש בגוף שמשמש רק במסלול הזה.

---

## 8. מפתחות ומה שאסור שיגיע לדפדפן

הריפו ציבורי. כל מה שבקוד גלוי לכולם.

### 8.1 איפה יושב כל מפתח

| סוד / ערך | סוג | איפה נשמר | בדפדפן? | מתי |
|-----------|-----|-----------|----------|-----|
| `GEMINI_API_KEY` | Secret | Vercel. להרצה מקומית מפתח dev נפרד ב-`.env.local` | **לעולם לא** | MVP |
| `SUPABASE_SECRET_KEY` | Secret | Vercel. להרצה מקומית מפתח dev נפרד ב-`.env.local` | **לעולם לא** | MVP |
| `GEMINI_MODEL` | Config | Vercel, גם בסביבת Development | לא | MVP |
| `SUPABASE_URL` | Config | Vercel, גם בסביבת Development. עותק ב-`js/config.js` לכניסה | כן, לכניסה | MVP |
| מפתח `sb_publishable_` | ציבורי | `js/config.js` | כן, לכניסה בלבד. לא פותח אף טבלה | MVP |
| טוקן הגישה של המשתמש | | `localStorage` (בניהול `supabase-js`), נשלח בכותרת `Authorization` | כן, שלו בלבד | MVP |
| סיסמאות משתמשים | | Supabase Auth בלבד | רק בטופס הכניסה | MVP |
| `AUTOMATION_SECRET` | Secret | Vercel, ו-Credentials של n8n | **אסור** | Should, 1.2 |
| חיבור Gmail (OAuth) | | Credentials של n8n | **אסור** | Should, 1.2 |

### 8.2 מה אסור שיגיע לדפדפן או לריפו

- מפתח Gemini, `sb_secret_`, `AUTOMATION_SECRET` ופרטי Gmail: לא בקוד, לא ב-`config.js`, לא ב-HTML, ולא בהיסטוריית Git.
- קבצי `.env*`: ב-`.gitignore`, מלבד `.env.example`.
- מפתחות Supabase הישנים `anon` ו-`service_role`: לא בשימוש.
- הודעת שגיאה גולמית של Gemini או של Supabase: לא מוחזרת לדפדפן.
- תוכן הפרומפט המלא והתשובה הגולמית של המודל: לא נרשמים בלוגים.
- סיסמאות של משתמשי הדמה: לא ב-`seed.sql` ולא ב-`ai-tests.md`.

### 8.3 הרצה מקומית

לפי ארבעת הכללים של `course-stack.md`:
1. `.gitignore` כבר מכסה את `.env`, `.env.*` ואת החריגה `!.env.example`.
2. `.claude/settings.json` חוסם את הקריאה של `.env` ו-`.env.*` על ידי Claude.
3. מפתחות dev נפרדים ב-`.env.local`. בעלת המוצר מדביקה אותם בעצמה.
4. `.env.example` בריפו מכיל רק את השמות `GEMINI_API_KEY` ו-`SUPABASE_SECRET_KEY`, בלי ערכים.

ההרצה: `vercel dev`, בכתובת `http://localhost:3000`, אחרי `npm i -g vercel`, `vercel login` ו-`vercel link`. בדיקת ה-AI והנתונים הסופית נעשית בכתובת החיה ב-Vercel.

### 8.4 הגדרות Vercel

אחרי שינוי במשתנה סביבה צריך פריסה מחדש. כל דחיפה ל-`main` מעדכנת את האתר ואת הפונקציה יחד.

---

## 9. מבנה התיקיות של הקוד

ריפו ציבורי אחד, ענף `main` בלבד. האתר מוגש משורש הריפו ב-Vercel, והדף פונה לפונקציה בכתובת יחסית.

```
/
├── index.html                  # כניסה
├── profile.html                # הזנת נתונים (אשף)
├── nutrition.html              # תכנית תזונה
├── training.html               # תכנית אימונים
├── daily.html                  # עדכון יומי
├── progress.html               # התקדמות ודוחות, פידבק וסיום מחזור
├── admin.html                  # Should 1.3: דשבורד מנהל
│
├── css/
│   └── style.css               # עיצוב. הפירוט ב-DESIGN.md
│
├── images/                     # התמונות הקבועות (DESIGN.md)
│
├── js/                         # קוד הדפדפן
│   ├── config.js               # כתובת Supabase ומפתח publishable, לכניסה בלבד
│   ├── auth.js                 # signIn, signOut, requireSession
│   ├── api.js                  # callAsk(action, params) → POST /api/ask
│   ├── data.js                 # טעינת foods, exercises, lists
│   ├── messages.js             # קודי שגיאה → הודעות בעברית
│   ├── nav.js                  # כותרת וסרגל תחתון משותפים
│   ├── chart-basic.js          # גרף SVG בסיסי (1.1: מוחלף ב-Chart.js)
│   └── pages/                  # קובץ לכל דף
│       ├── login.js  profile.js  nutrition.js  training.js  daily.js  progress.js
│
├── shared/                     # קוד טהור, רץ בדפדפן ובפונקציה
│   ├── calc.js  nutrition.js  dates.js  report.js
│
├── api/
│   └── ask.js                  # הפונקציה היחידה: /api/ask
│
├── lib/                        # קוד שרת בלבד
│   ├── http.js                 # תשובות JSON, קודי שגיאה
│   ├── supabase.js             # לקוח יחיד עם המפתח הסודי
│   ├── auth.js                 # אימות הטוקן
│   ├── store.js                # כל השאילתות, מסוננות לפי user_id
│   ├── fields.js               # בדיקת השדות של כל פעולה
│   ├── gemini.js               # הקריאה ל-Gemini וחילוץ הטקסט
│   ├── prompts.js              # בניית הוראות המערכת והקלט
│   ├── schemas.js              # סכמת הפלט
│   ├── validate.js             # בדיקת הפלט (5.5)
│   ├── plan.js                 # סינון, קריאה, בדיקה והתאמה, עם ניסיון נוסף
│   └── cycle.js                # generate_plan ו-close_cycle
│
├── data/
│   ├── foods.json  exercises.json  lists.json
│   └── met.json                # Should 1.1
│
├── supabase/                   # SQL להרצה ידנית ב-SQL Editor
│   ├── schema.sql              # טבלאות
│   ├── policies.sql            # נעילה והרשאות
│   ├── functions.sql           # commit_close_cycle
│   └── seed.sql                # נתוני דמה
│
├── scripts/                    # כלי עזר שרצים על המחשב
│   ├── build-foods.mjs         # CSV → data/foods.json
│   ├── moh_mitzrachim.csv      # המקור (משרד הבריאות)
│   ├── run-ai-tests.mjs        # הרצת ai-tests
│   └── ai-tests-inputs.json    # קלטי הדמה
│
├── prototype/                  # עותק קפוא של אב הטיפוס מ-M0 (ADR-2)
├── spec/                       # מסמכי האפיון ומסמכי הרקע
├── ai-tests.md                 # 10 קלטים, תוצאה צפויה, אחוז הצלחה
├── package.json                # "type": "module"; תלות: @supabase/supabase-js
├── .env.example                # שמות המפתחות הסודיים, בלי ערכים
├── .claude/settings.json       # חסימת קריאה של .env על ידי Claude
├── .gitignore
└── CLAUDE.md
```

הערות:
- **`lib/` ו-`shared/` מחוץ ל-`api/`,** כי כל קובץ בתוך `api/` ב-Vercel הופך לפונקציה נפרדת.
- הפונקציה מייבאת את `data/foods.json` ישירות (`import foods from '../data/foods.json' with { type: 'json' }`). הדפדפן טוען את אותו קובץ ב-`fetch`.
- כל הקבצים בריפו גלויים, כי הריפו ציבורי. לכן אין בהם סודות או נתוני אמת.

---

## 10. כיסוי דרישות ה-Must

| # | דרישה | רכיב |
|---|-------|------|
| 1 | כניסה והרשאות | Supabase Auth, `js/auth.js`, `lib/auth.js`, `lib/store.js`, `policies.sql` |
| 3, 4, 5 | נתונים אישיים, העדפות, מטרה | `profile.html`, `save_profile`, `profiles`, `lists.json` |
| 7, 8 | תפריט ותכנית ע"י AI | `generate_plan`, `lib/plan.js`, `lib/gemini.js` |
| 9 | עדכון שבועי | `close_cycle`, `commit_close_cycle` |
| 10 | מגבלות פרומפט ובדיקת פלט | `lib/prompts.js`, `lib/validate.js` |
| 11 | תפריט יומי | `nutrition.html`, `weekly_cycles.menu` |
| 12 | ערכים תזונתיים | `shared/nutrition.js`, `foods.json` |
| 13, 14 | אירובי וכוח | `training.html`, `weekly_cycles.training_plan`, `exercises.json` |
| 16, 17, 18 | דיווח אימון, ארוחות ומשקל | `daily.html`, `save_daily`, `daily_logs` |
| 19 | בסיס נתונים | `supabase/schema.sql` (3 טבלאות) |
| 21, 23 | BMR, TDEE, יעדים ומאזן | `shared/calc.js`, `save_daily` |
| 24 | דוח שבועי | `shared/report.js`, `get_report`, `weekly_cycles.report`, `progress.html` |
| 26, 27 | פידבק והצגת תכנית מעודכנת | `save_feedback`, `weekly_cycles.feedback`, `progress.html`, `close_cycle` |
| 35 | Responsive, RTL, נגישות | כל הדפים, `css/style.css`. הפירוט ב-`DESIGN.md` |
| 36 | נתוני דמה ו-`ai-tests.md` | `seed.sql`, `scripts/run-ai-tests.mjs`, `ai-tests.md` |
| 37 | הקמת תשתית | ריפו, Vercel, Supabase |

---

## 11. אילוצים שהמסמך מכבד

| אילוץ | איך |
|-------|-----|
| פרויקט Vercel אחד, בלי CORS | 1.2, 7.2 |
| Supabase רק דרך הפונקציה, טבלאות נעולות | 4.3 |
| עד 3 טבלאות | `profiles`, `daily_logs`, `weekly_cycles` |
| רשימה קבועה = קובץ, לא טבלה | `foods`, `exercises`, `lists` ב-`data/` |
| פונקציה אחת, תמיד JSON, רק POST לשינוי נתונים | `api/ask.js`, 7.2 |
| קלט מוגבל באורך | גוף עד 10KB, פידבק עד 500 תווים, מזונות מסוננים |
| פלט AI במבנה קבוע שהקוד בודק | 5.3 ו-5.5 |
| חישוב, סינון ותאריכים בקוד | סעיף 6 ו-5.4 |
| פעולה מקבילה בפונקציית בסיס נתונים | 4.4 |
| אין מפתח בקוד | סעיף 8 |
| בונים טבלה לפני מסך | `schema.sql` קודם לדפים |
| נתוני דמה בלבד בשכבה החינמית | 5.7 |
| שמות טבלאות ושדות באנגלית, קו תחתון | סעיף 3 |
| עד 5 משתמשים שנוצרים ידנית, הרשמה מכובה | 4.2 |
| ענף `main` בלבד | |
| עברית, RTL, 375px, נגישות | `dir="rtl"` בכל דף. הפירוט ב-`DESIGN.md` |

---

## 12. הנחות ונושאים פתוחים

### 12.1 הנחות שנקבעו במסמך

1. **קריאה אחת למודל** לתפריט ולתכנית (ולטקסט הדוח ב-`close_cycle`).
2. **ימים בפער בין מחזורים** אינם נכללים בדוח.
3. **אפשר לעדכן ימים קודמים,** ולא ימים עתידיים.
4. **`calories_in` ו-`tdee` נשמרים** בשורת היום, והמאזן מחושב בכל תצוגה.
5. **גבולות:** פידבק עד 500 תווים לשדה, גוף בקשה עד 10KB, `summary_text` עד 600 תווים, תקרת זמן 120 שניות לניסיון, עד 2,000 גרם לפריט שנוסף ידנית.
6. **`factor` בטווח 0.5–1.5** בהתאמת הגרמים, ועיגול ל-5 גרם.
7. **יעד החלבון אינו תנאי כשל.**
8. **מינימום 100 מזונות** אחרי סינון העדפות.
9. **רמת תרגיל:** הקוד שולח למודל רק תרגילים שמתאימים לרמת הכושר.
10. **`scripts/run-ai-tests.mjs`** מריץ את בדיקות ה-AI מקומית ב-Node.
11. **טיוטת הטופס היומי** יכולה להישמר ב-`localStorage`.

### 12.2 לבדוק ב-M1, לפני שבונים על זה

| # | נושא | מה לבדוק |
|---|------|-----------|
| 1 | Interactions API | צורת `system_instruction`, נתיב הטקסט בתשובת REST, שדה מקסימום טוקנים. אם נכשל, מעבר ל-`generateContent` ב-`lib/gemini.js` בלבד |
| 2 | יצירת משתמש ידנית | משתמש שנוצר בדשבורד יכול להיכנס בלי אימות אימייל |
| 3 | הרשמה עצמית | ניסיון `signUp` עם המפתח הציבורי נכשל |
| 4 | נעילת הטבלאות | קריאה עם המפתח הציבורי וטוקן משתמש נדחית, והפונקציה ניגשת עם המפתח הסודי |
| 5 | `commit_close_cycle` | קריאה שנייה מחזירה `cycle_closed`, וכשל בהוספה מבטל גם את הדוח |
| 6 | ייבוא JSON בפונקציה | `import ... with { type: 'json' }` נארז בפריסה של Vercel |
| 7 | Supabase | הפרויקט פעיל |

### 12.3 נושאים פתוחים שלא חוסמים

| # | נושא | מתי |
|---|------|-----|
| 1 | אישור תת-הקבוצה של המזונות והסימונים (`menu`, `tags`) | לפני M3 |
| 2 | אישור תוכן `exercises.json` | לפני M3 |
| 3 | מקור ערכי MET, והערכה ברמת קטגוריה | M7 |
| 4 | איפה n8n רץ | M7 |
| 5 | הפעלת התהליך השבועי ע"י n8n: `AUTOMATION_SECRET` | M7 |
| 6 | איכות הפלט בעברית | נבדק ב-`ai-tests.md` |
| 7 | מדדים מצטברים בדשבורד המנהל | לא הוגדרו (Could) |

### 12.4 שינויים מול מסמכי הרקע

מסמך זה גובר על המסמכים הבאים במקום שהם נכתבו לפני ההחלטות:
1. **`tech-stack.md`:** GitHub Pages, CORS, `getClaims` וגישה ישירה לטבלאות הוחלפו, לפי `course-stack.md`.
2. **`MVP.md` ו-`product-10-definitions.md`:** הקמת n8n ב-M1, דיווח מפורט על אימון, וחישוב `fitness_level` כגורם פעילות הוחלפו, לפי החלטות בעלת המוצר.

---

## החלטות מרכזיות (ADRs)

### ADR-1: הרצה מקומית דרך `scripts/dev.mjs`

**הקשר:** ב-M1 התברר ש-`vercel dev` (גרסה 65.9) בפרויקט מקושר לא קורא את `.env.local`. הפונקציה קיבלה רק את המשתנים מסביבת Development ב-Vercel, בלי `SUPABASE_SECRET_KEY`, ונכשלה בכל פנייה למסד. סעיף 8.3 מניח שהקובץ נקרא. Claude לא קורא את הקובץ, ולכן גם לא יכול להעתיק את הערכים.

**החלטה:** ההרצה המקומית היא `node --env-file=.env.local scripts/dev.mjs`. Node טוען את הקובץ, ו-`scripts/dev.mjs` מפעיל את `vercel dev --listen 3000`, שמעביר את המשתנים לפונקציה. המפתחות הסודיים נשארים בלי סביבת Development ב-Vercel. לא משתמשים ב-`vercel env pull`.

**השלכות:** שינוי בפקודת ההרצה בלבד. אין שינוי בקוד האפליקציה ובפריסה. בכלי ה-preview של Claude השרת עולה, אבל הפונקציה מחזירה 500. לכן Claude מריץ את הבדיקות מטרמינל רגיל.

### ADR-2: עותק קפוא של אב הטיפוס, ודף זמני למסכים שעוד לא חוברו

**הקשר:** ב-M2 הכניסה הפכה לאמיתית, והמסגרת המשותפת (`js/nav.js`) עברה ל-Supabase Auth ול-`/api/ask`. אב הטיפוס של M0 עבד מול `js/mock-api.js` עם כניסה מדומה, ולכן הפסיק לעבוד באותם דפים. בעלת המוצר רוצה להמשיך להציג אותו עד שכל המסכים ייבנו. ארבעת המסכים תכנית תזונה, תכנית אימונים, עדכון יומי ודוחות מחוברים לפונקציה רק ב-M4 עד M6.

**החלטה:**
- עותק קפוא של אב הטיפוס בתיקייה `prototype/`, עם קבצים משלו (דפים, `css/`, `js/`, `shared/`, `data/lists.json`, `data/demo/`, `images/`). השינוי היחיד בו: משתמש עם פרופיל עובר בכניסה לעדכון יומי. הוא לא פונה לשום שירות, ונגיש מקומית ובאתר בנתיב `/prototype/`.
- באפליקציה, ארבעת הדפים שעוד לא חוברו מפנים ל-`js/pages/coming-soon.js`: מסגרת המסך האמיתית וכרטיס "המסך הזה ייפתח בשלב הבא של הבנייה". קובצי הדפים מאב הטיפוס נשארים בשורש בלי שינוי, וכל Milestone שבונה מסך מחזיר אליהם את ההפניה ומחבר אותם לפונקציה.
- `js/mock-api.js`, `data/demo/` והבדיקות שלהם נשארים בשורש עד שהמסך האחרון יחובר.

**השלכות:** כ-1.5MB של קבצים כפולים בריפו (בעיקר התמונות). תיקון באפליקציה לא עובר לעותק אוטומטית. הוא מועבר רק כשבעלת המוצר מחליטה על כך במפורש, כמו הלחיצה על מספרי השלבים באשף והחלון ביציאה עם שינויים שלא נשמרו (M2). העותק שומר נתונים ב-`localStorage` כמו ב-M0, וזה מותר רק בו. לאחר ש-M6 יאושר, אפשר להחליט אם למחוק את התיקייה.

### ADR-3: תת-קבוצת המזונות לתפריט נשמרת ב-`scripts/menu-foods.csv`

**הקשר:** סעיף 3.8 קובע ש-`menu: true` ו-`tags` מסמנים 300–600 מזונות, בטיוטה של Claude ובאישור בעלת המוצר. בעלת המוצר צריכה לבדוק את הרשימה בכלי שהיא מכירה, ו-`foods.json` (4,620 שורות) לא מתאים לבדיקה.

**החלטה:** הרשימה המאושרת נשמרת ב-`scripts/menu-foods.csv` (נפתח באקסל): מזהה, שם, קבוצה, צמחוני / טבעוני / ללא גלוטן (כן / לא), וערכים ל-100 גרם לעיון. `scripts/build-foods.mjs` קורא אותו ובונה מחדש את `data/foods.json`. 320 מזונות אושרו ב-M3. בכל צירוף העדפות נשארים לפחות 179 מזונות. במקרה של ספק, מזון לא סומן "ללא גלוטן".

**השלכות:** שינוי ברשימה = עריכת הקובץ והרצת הסקריפט. בדיקת יחידה מוודאת 300–600 מזונות ולפחות 120 בכל צירוף.

### ADR-4: המודל מקבל מזהי מזון קצרים

**הקשר:** בבדיקות M3 המודל העתיק לפעמים לא נכון את מזהי משרד הבריאות בני 8 הספרות (למשל `42101129` במקום `42101130`), והפלט נפסל. ניסיון לשים את המזהים כ-`enum` בסכמה נדחה על ידי Gemini, כמו שסעיף 5.3 צפה.

**החלטה:** `lib/plan.js` שולח למודל את המזונות עם מזהים קצרים (`f1`, `f2`, ...), וממיר את התשובה חזרה למזהים האמיתיים לפני הבדיקה. מזהה קצר שלא קיים נשאר כמו שהוא, ונפסל בבדיקה. ב-DB נשמרים תמיד המזהים האמיתיים.

**השלכות:** אין שינוי במבני ה-JSON השמורים (3.6.4). אחרי השינוי, 11 מתוך 11 קלטים עברו ב-Flash-Lite בניסיון הראשון.

### ADR-5: האירובי נקבע בקוד, והמודל מתכנן רק את קטגוריות הכוח

**הקשר:** החלטת בעלת המוצר ב-M3: האירובי הוא הליכה, ריצה, רכיבה על אופניים או עלייה במדרגות, 30 דקות בכל אימון, לכל רמות הכושר, והמשתמש בוחר פעילות אחת בכל אימון. בנוסף, בסכמה של 5.3 רק `exercise_id` חובה, והמודל השמיט בעקביות את `reps` בתרגילי הכוח, כך שכל הפלטים נפסלו.

**החלטה:** הסכמה (`lib/schemas.js`) כוללת רק את 5 קטגוריות הכוח, ובכל תרגיל `exercise_id`, `sets` ו-`reps` הם חובה. תרגילי האירובי לא נשלחים למודל. `lib/plan.js` מוסיף את קטגוריית האירובי: כל תרגילי האירובי המותרים, `minutes: 30`. מבנה `training_plan` השמור לא משתנה: 6 קטגוריות, אירובי ראשון.

**השלכות:** הבדיקה (5.5) בודקת 5 קטגוריות כוח. `exercises.json`, `seed.sql` והתכניות השמורות של משתמשי הדמה עודכנו לארבעת תרגילי האירובי. ב-M4 מסך תכנית האימונים יציג "בכל אימון: 30 דקות של אחת מהפעילויות", כמו באב הטיפוס.

### ADR-6: Gemini 3.5 Flash-Lite הוא הדגם היחיד, גם לבדיקה הסופית וגם באתר

**הקשר:** התכנון היה פיתוח ב-Flash-Lite, והרצה סופית ושימוש באתר ב-Gemini 3.6 Flash. ב-2–3.11.2026 החזירו 3.6, 3.7 ו-3.8 Flash בשכבה החינמית שוב ושוב HTTP 503 ("high demand") על בקשה בגודל מלא, ורק 6 מתוך 11 קלטים קיבלו תשובה. כל תשובה שהתקבלה הייתה תקינה. Flash-Lite עבר 11 מתוך 11, ויש לו 500 קריאות ביום במקום 20.

**החלטה (באישור בעלת המוצר):** `gemini-3.5-flash-lite` הוא הדגם לפיתוח, להרצה הסופית של `ai-tests.md` ולאתר החי. זו גם ברירת המחדל בקוד (`lib/gemini.js`). חוזרים לדגם Flash רק אם בעלת המוצר תחליט על כך, למשל אם האיכות לא תספיק, וההחלפה היא שינוי של `GEMINI_MODEL` ב-Vercel.

**השלכות:** בדחיפה, `GEMINI_MODEL` ב-Vercel יוגדר ל-`gemini-3.5-flash-lite`. המכסה מספיקה בשפע לחמישה משתמשים. זה הדגם הפשוט יותר. יעד החלבון אינו תנאי כשל, והוא נמדד ב-`ai-tests.md`.
