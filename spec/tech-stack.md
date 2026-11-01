# Tech Stack – כושר ותזונה: התאמה פרסונלית

**מקורות:** `PRD.md`, `product-10-definitions.md`, `course-stack.md`
**תאריך המחקר:** 13.10.2026
**סטטוס:** טיוטה לאישור. המסמך עוסק רק בבחירת טכנולוגיות, בלי מבנה מערכת ובלי תוכנית פיתוח.

---

## 1. תקציר ההמלצה

סטאק הקורס מכסה את רוב המוצר כמות שהוא. התוספות המומלצות הן הקטנות ביותר שנדרשות:

| תוספת | סיבה | מתי נדרשת |
|-------|------|-----------|
| קביעת דגם ה-AI וממשק הקריאה | הסטאק קובע רק "Gemini Flash" | MVP |
| אימות הכניסה של המשתמש בתוך הפונקציה | בלי זה כל אחד יכול לצרוך את מכסת ה-AI | MVP |
| ספריית גרפים (Chart.js דרך CDN) | הסטאק לא קובע ספרייה, ואין שלב בנייה | Should (גרסה 1.1) |
| פיתוח ובדיקות על Gemini 3.5 Flash-Lite | בשכבה החינמית ל-3.6 Flash יש רק 20 קריאות ליום | MVP, M2 |
| החלטה איפה n8n רץ | הסטאק קובע n8n אבל לא איפה הוא מתארח | Should (גרסה 1.2) |

**אין דרישת Must שהסטאק לא יכול לממש,** אחרי ההחלטה על גיל מינימלי 18 (ראו סעיף 2).

---

## 2. החלטה שהתקבלה במהלך המחקר

**גיל מינימלי 18.** תנאי השימוש של Gemini API מחייבים גיל 18 ומעלה ואוסרים שימוש באפליקציה "שמיועדת או עשויה להיות נגישה" לקטינים. הטווח 16–70 שנקבע בתחילה בוטל, ו-`PRD.md` ו-`MVP.md` עודכנו ל-18–70.
מקור: [Gemini API Additional Terms](https://ai.google.dev/gemini-api/terms)

---

## 3. שלב 1: טבלת התאמה בין דרישות ה-PRD לסטאק הקורס

**מקרא:** ✅ הסטאק מכסה. 🟡 מכסה חלקית. ❌ לא מכסה.

### דרישות Must

| # | דרישה | כיסוי | הערה |
|---|-------|-------|------|
| 1 | כניסה והרשאות (משתמש רואה רק את נתוניו) | ✅ | Supabase Auth והרשאות ברמת הטבלה, רמה 2 |
| 3, 4, 5 | טפסי נתונים, העדפות ומטרה | ✅ | אתר סטטי ו-Supabase |
| 7, 8 | יצירת תפריט ותכנית אימונים ע"י AI | 🟡 | הסטאק קובע "Gemini Flash" בלי דגם ובלי ממשק. הוכרע בשלב 2 |
| 9 | עדכון שבועי ע"י AI | 🟡 | כמו 7 ו-8 |
| 10 | מגבלות פרומפט ובדיקת פלט | ✅ | הסטאק דורש פלט JSON במבנה קבוע שהקוד בודק |
| 11, 13, 14 | הצגת תפריט ותכנית | ✅ | אתר סטטי |
| 12 | ערכים תזונתיים ממאגר המזון | ✅ | רשימה קבועה בקובץ JSON בריפו, חישוב בקוד |
| 16, 17, 18 | הזנת אימון, ארוחות ושתייה ומשקל | ✅ | Supabase, עמודות JSON |
| 19 | בסיס נתונים, 3 טבלאות | ✅ | תואם את מגבלת הסטאק |
| 21, 23 | BMR, TDEE ומאזן קלוריות | ✅ | חישוב בקוד, כפי שהסטאק דורש |
| 24 | דוח שבועי | ✅ | חישוב בקוד מעמודות JSON |
| 26, 27 | פידבק והצגת תכנית מעודכנת | ✅ | |
| 35 | Responsive, RTL ונגישות | 🟡 | הסטאק קובע דרישות, אבל לא מקור לגופן עברי |
| 36 | נתוני דמה וקובץ בדיקות AI | ✅ | דרישה של הסטאק עצמו |
| 37 | הקמת תשתית | ✅ | n8n לא נדרש ב-MVP (ראו סעיף 4.3) |
| – | **הגנה על הפונקציה מפני שימוש לא מורשה** | 🟡 | הסטאק דורש CORS לכתובת האתר, אבל CORS אינו הגנה ממשית (ראו סעיף 4.4) |

### דרישות Should

| # | דרישה | כיסוי | הערה |
|---|-------|-------|------|
| 2 | תפקיד מנהל | ✅ | תפקיד בפרופיל והרשאות טבלה |
| 6, 15 | שעות אימון מועדפות, מתיחות | ✅ | |
| 20 | BMI | ✅ | חישוב בקוד |
| 22 | הוצאה קלורית לפי תרגיל | 🟡 | נדרש קובץ ערכי MET. מתאים לכלל "רשימה קבועה ב-JSON", אבל מקור הנתונים לא נבחר |
| 25 | גרפים | ❌ | הסטאק לא קובע ספריית גרפים, ואין שלב בנייה |
| 28, 29 | תזכורות מייל | 🟡 | n8n ו-Gmail של הסטודנט קבועים בסטאק. איפה n8n מתארח לא נקבע |
| 30 | תהליך שבועי מתוזמן | 🟡 | n8n קבוע, אבל תזמון דורש שהמופע ירוץ ברציפות |
| 31, 34 | דשבורד מנהל: צפייה בנתונים ועדכון | ✅ | דפים סטטיים והרשאות טבלה, בלי זמן אמת |
| 32 | דשבורד מנהל: מגמות | ❌ | תלוי בספריית גרפים, כמו 25 |

**Could (33):** תצוגה מצטברת, ללא דרישות טכנולוגיות נוספות.

---

## 4. שלב 2: מחקר והשוואות

מה שהסטאק כבר מכסה לא נחקר מחדש. נחקרו רק החסרים.
**לא נדרשים בכלל:** שירות תשלומים, מפות ואחסון קבצים. ל-PRD אין תשלומים, מיקום או העלאת קבצים.

### 4.1 דגם ה-AI וממשק הקריאה

הסטאק קובע Gemini Flash כברירת מחדל. הושוו דגמי Gemini הנוכחיים:

| קריטריון | Gemini 3.8 Flash | Gemini 3.6 Flash | Gemini 3.5 Flash-Lite |
|----------|------------------|------------------|------------------------|
| מצב | יציב, חדש | יציב | יציב |
| תאריך שחרור | 2.9.2026 | 21.7.2026 | 21.7.2026 |
| תאריך סגירה | לא נקבע | לא נקבע | לא נקבע |
| שכבה חינמית | כן | כן | כן |
| **מגבלות שכבה חינמית** (קריאות לדקה / טוקנים לדקה / קריאות ליום) | 5 / 250K / 20 | 5 / 250K / 20 | 15 / 250K / 500 |
| מחיר בתשלום ל-1M טוקנים (קלט / פלט) | $0.75 / $3.75 עד 31.12.2026, ואז $1.50 / $7.50 | זהה ל-3.8 | $0.30 / $2.50 |
| פלט JSON לפי סכמה | נתמך | נתמך (לא נבדק במפורש) | נתמך (לא נבדק במפורש) |
| תיאור מהתיעוד | "Most intelligent Flash", ממוקד בהנדסת תוכנה ובסוכנים | איזון בין מהירות ליכולת, למשימות יומיומיות | המהיר והזול |

הערות:
- Gemini 3.1 Flash-Lite נפסל, כי תאריך הסגירה שלו הוא 7.5.2027.
- תיעוד Google לא מתייחס לאיכות בעברית עבור הדגמים האלה.
- **השכבה החינמית:** תוכן משמש לשיפור מוצרי Google, מבקרים אנושיים עשויים לקרוא אותו, ו-Google מורה לא לשלוח אליה מידע אישי. זה תואם את הכלל בסטאק: רק נתוני דמה. משתמשים אמיתיים דורשים מפתח בתשלום, ובשכבה בתשלום Google לא משתמשת בתוכן לשיפור מוצריה.

**מכסות השכבה החינמית (נקראו ב-13.10.2026 מ-AI Studio, פרויקט Default Gemini Project):**
- Gemini 3.6 Flash, 3.7 Flash ו-3.8 Flash: 5 קריאות לדקה, 250K טוקנים לדקה, **20 קריאות ליום**.
- Gemini 3.5 Flash-Lite ו-3.1 Flash-Lite: 15 קריאות לדקה, 250K טוקנים לדקה, 500 קריאות ליום.
- המכסה היומית מתאפסת בחצות לפי שעון החוף המערבי של ארה"ב (לפי תיעוד Google), כלומר בבוקר שעון ישראל (כ-9:00 עד 10:00, חישוב שלי). Google מציינת שהמגבלות אינן מובטחות ועשויות להשתנות.

**משמעות המכסה ל-MVP:**
- 20 קריאות ליום מספיקות לשימוש של עד 5 משתמשים (מחזור שבועי של 2 קריאות למשתמש הוא 10 קריאות), אבל לא לפיתוח ולבדיקות על אותו דגם.
- הרצה של `ai-tests.md` (10 קלטים) עולה 10 קריאות אם כל קלט הוא קריאה אחת, ו-20 קריאות אם תפריט ותכנית אימונים נוצרים בנפרד. במקרה השני זו כל המכסה של יום שלם.
- הגבלה של 5 קריאות לדקה פירושה שיצירת תכנית לכמה משתמשים ברצף צריכה המתנה בין קריאות.
- **אפשרויות:** (א) פיתוח ובדיקות ראשוניות על Gemini 3.5 Flash-Lite (500 קריאות ליום), והרצה סופית על 3.6 Flash ביום ייעודי; (ב) קריאה אחת שמחזירה גם תפריט וגם תכנית אימונים, כדי לחסוך מכסה (הכרעה ב-`ARCHITECTURE.md`); (ג) קישור חשבון חיוב. בשכבה בתשלום המגבלות גבוהות יותר (הערכים המדויקים לא נבדקו) ו-Google מפסיקה להשתמש בתוכן לשיפור מוצריה. עם נתוני דמה העלות זניחה, אבל זו החלטה שלך.

**ממשק הקריאה:**

| קריטריון | Interactions API | generateContent |
|----------|------------------|------------------|
| מצב | GA, "מומלץ לכל פרויקט חדש" (יוני 2026) | נתמך במלואו, מוגדר כ-legacy |
| פלט JSON לפי סכמה | מתועד (`response_format`) | לא נבדק בתיעוד הנוכחי |
| יציבות | היו שינויים שוברים במאי 2026 | בוגר |
| קריאה בלי ספרייה | כן, `fetch` ל-REST | כן |

הערה: דוגמאות ה-REST בתיעוד משתמשות ב-`v1beta`. התיעוד לא אומר אם יש `v1` יציב.

**שכבת הקריאה:** `fetch` ישיר ל-REST, או ספריית `@google/genai` (גרסה 2.3.0 ומעלה). בחירה ב-`fetch` מתאימה לכלל "בלי ספרייה שאפשר לוותר עליה".

**ספקים אחרים (Claude, OpenAI):** לא הושוו, כי הסטאק מכסה את הדרישה ואחרי העלאת הגיל ל-18 אין סיבה להחליף.

### 4.2 גרפים (Should)

| קריטריון | Chart.js | uPlot | ApexCharts |
|----------|----------|-------|------------|
| גרסה נוכחית | 4.5.1 | לא אומת | 8.x (נוכחי); 7.x אפשרי |
| רישיון | MIT | MIT | התיעוד לא מפרט תנאי שימוש חינמי, ויש דף רישוי נפרד |
| שימוש בלי שלב בנייה | CDN (CDNJS ו-jsDelivr) | נראה אפשרי (בנייה IIFE), בלי הוראות | CDN (jsDelivr) |
| גודל | לא נמצא בתיעוד | כ-50KB | כ-257KB מכווץ בחבילה הרגילה |
| נגישות | קנבס, דורש `role="img"` ו-`aria-label` ותוכן חלופי | לא מוזכר | לא מוזכר |
| RTL | לא מוזכר | לא מוזכר | לא מוזכר |
| התאמה לשימוש | גרפי קו ועמודות כלליים | סדרות זמן, פחות מתאים לעמודות מגוונות | רחב, כבד יותר |

### 4.3 הרצת n8n (Should, מגרסה 1.2)

n8n לא נדרש ב-MVP. ההרצה הידנית של התהליך השבועי יכולה לעבור דרך כפתור שקורא לפונקציה. התזכורות והתזמון הם Should.

| אפשרות | עלות | הערות |
|--------|------|-------|
| n8n Cloud | אין תוכנית חינמית קבועה. ניסיון חינם (14 ימים, כ-1,000 הרצות); Starter €20 לחודש בחיוב שנתי, 2,500 הרצות | ללא תחזוקה |
| אירוח עצמי (Community) | חינמי | דורש מחשב או שרת שרצים ברציפות. ברירת המחדל: הרצות שפוספסו נזרקות |
| בלי n8n ב-MVP | 0 | כפתור ידני בלבד |

הערות:
- **Schedule Trigger** קיים, וחובה לפרסם את ה-workflow. אזור הזמן נקבע לפי ה-workflow או המופע.
- **Gmail node** קיים ותומך בשליחת הודעה. הסטאק מגביל אותו לכתובות בדיקה בלבד, בחשבון Gmail אחד של בעל המוצר.
- מייל האימות של Supabase מוגבל ל-2 הודעות בשעה, ולכן לא מתאים לתזכורות.

### 4.4 הגנה על הפונקציה (MVP)

הפונקציה קוראת ל-Gemini ויכולה לצרוך את מכסת ה-AI. CORS לכתובת האתר, שהסטאק דורש, מונע רק דפדפנים אחרים, ולא בקשות ישירות.

| אפשרות | הערות |
|--------|-------|
| אימות ה-JWT של המשתמש בתוך הפונקציה | שימוש ב-`auth.getClaims` של supabase-js. מהיר עם מפתחות חתימה אסימטריים, אחרת פנייה לשרת ה-Auth. תיעוד השימוש בצד שרת חלקי, ולכן צריך לבדוק בפועל |
| CORS בלבד | לא מגן מפני בקשות ישירות |
| מפתח משותף בדפדפן | אסור לפי חוק המפתחות |

### 4.5 ספק הפונקציות

| קריטריון | Vercel | Netlify |
|----------|--------|---------|
| מבנה | `api/` בשורש הריפו | `netlify/functions/` |
| משך מקסימלי בחינמי | 300 שניות (גם ברירת מחדל) | לא נמצא בתיעוד שנקרא |
| גודל בקשה | 4.5MB | לא נמצא בתיעוד שנקרא |
| Node | Node.js 24 LTS זמין | לא נבדק |
| שימוש בחינמי | אישי ולא מסחרי (לפי הסטאק) | לא נבדק |

### 4.6 שאר הרכיבים שנבדקו

| רכיב | ממצא |
|------|------|
| **Supabase חינמי** | 2 פרויקטים פעילים, 500MB, 50,000 משתמשים פעילים בחודש, השהיה אחרי שבוע בלי פעילות |
| **מפתחות Supabase** | `sb_publishable_` בטוח לדפדפן. `sb_secret_` רק בשרת. מפתחות `anon` ו-`service_role` הישנים יוצאים משימוש עד סוף 2026 |
| **supabase-js בדפדפן** | נטען ב-script tag מ-jsDelivr, מקובע ל-`@2`. הגרסה הנוכחית 2.117.3, רישיון MIT, דורשת Node 22 ומעלה בשרת |
| **כניסה בסיסמה** | `signInWithPassword`. בפרויקטים מאוחסנים נדרש אימות אימייל לפני כניסה. התיעוד שנקרא לא מכסה יצירת משתמשים ידנית בדשבורד |
| **GitHub Pages** | חינמי בריפו ציבורי. אתר עד 1GB. 100GB רוחב פס בחודש (מגבלה רכה). לא מיועד לעסק מסחרי |
| **גופן עברי** | Google Fonts כולל את Heebo (עברית ולטינית). הבחירה בגופן תיעשה ב-`DESIGN.md` |

---

## 5. שלב 3: ההמלצה

| שכבה | בחירה | נימוק | מקור |
|------|-------|-------|------|
| צד לקוח | אתר סטטי (HTML, CSS, JavaScript) ב-GitHub Pages | הסטאק, בלי חריגה | [מגבלות Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits) |
| צד שרת | פונקציה אחת ב-**Vercel**, בתיקיית `api` | משך ריצה של 300 שניות מספיק ליצירת תכנית ע"י AI, ובקשה עד 4.5MB | [מגבלות Vercel](https://vercel.com/docs/functions/limitations), [Node.js runtime](https://vercel.com/docs/functions/runtimes/node-js) |
| נתונים והתחברות | Supabase | הסטאק. כניסה בסיסמה, הרשאות טבלה, מפתח `sb_publishable_` בדפדפן | [Pricing](https://supabase.com/pricing), [API keys](https://supabase.com/docs/guides/api/api-keys), [Passwords](https://supabase.com/docs/guides/auth/passwords) |
| תוספת: אימות משתמש בפונקציה | `auth.getClaims` של supabase-js | מונע צריכת מכסת ה-AI על ידי מי שלא מחובר | [getClaims](https://supabase.com/docs/reference/javascript/auth-getclaims) |
| דגם AI | **Gemini 3.6 Flash** (`gemini-3.6-flash`) לייצור ולבדיקה סופית, ו-**Gemini 3.5 Flash-Lite** לפיתוח ולבדיקות ראשוניות | 3.6 Flash יציב, ללא תאריך סגירה, בשל יותר מ-3.8, באותו מחיר עד 31.12.2026. בשכבה החינמית יש לו רק 20 קריאות ליום, ול-3.5 Flash-Lite יש 500. לשדרג ל-3.8 רק אם `ai-tests.md` מצדיק | [Models](https://ai.google.dev/gemini-api/docs/models), [Pricing](https://ai.google.dev/gemini-api/docs/pricing), [Deprecations](https://ai.google.dev/gemini-api/docs/deprecations) |
| ממשק AI | Interactions API, בקריאת `fetch` ישירה, עם `response_format` לפי סכמת JSON | מומלץ לפרויקטים חדשים, ומתועד לפלט מובנה. בלי ספרייה | [Interactions](https://ai.google.dev/gemini-api/docs/interactions), [Structured output](https://ai.google.dev/gemini-api/docs/structured-output) |
| גרפים (Should) | **Chart.js 4.5.1** דרך CDN | בשל, רישיון MIT, ללא שלב בנייה. נגישות באמצעות `role="img"`, `aria-label` ותוכן חלופי | [התקנה](https://www.chartjs.org/docs/latest/getting-started/installation.html), [נגישות](https://www.chartjs.org/docs/latest/general/accessibility.html) |
| אוטומציות ומייל (Should) | n8n ו-Gmail node | הסטאק. הרצה מתוזמנת ושליחת מייל נתמכות. לא נדרש ב-MVP | [Schedule Trigger](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.scheduletrigger/), [Gmail](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.gmail/) |
| מאגר מזון | קובץ JSON בריפו, נגזר מ-`moh_mitzrachim.csv` | רשימה קבועה, כפי שהסטאק מורה | `course-stack.md` |
| גרסאות | Git ו-GitHub, ענף `main` | הסטאק | `course-stack.md` |

**ללא תוספת:** תשלומים, מפות, אחסון קבצים, ספרייה לסכמות JSON וספריית תאריכים.

---

## 6. סיכונים ונושאים פתוחים

| # | נושא | מצב |
|---|------|-----|
| 1 | מכסות Gemini החינמיות | **נבדק** (ראו 4.1). המכסה היומית של 20 קריאות לדגמי Flash מגבילה פיתוח ובדיקות. נדרשת החלטה: Flash-Lite לפיתוח, או קישור חשבון חיוב |
| 2 | איכות הפלט בעברית | התיעוד לא מתחייב. תיבדק ב-`ai-tests.md` |
| 3 | שימוש ב-`getClaims` בצד שרת | התיעוד חלקי. לבדוק ב-M0, ולהשתמש ב-`getUser` אם צריך |
| 4 | יצירת משתמשים ידנית ואימות אימייל | התיעוד שנקרא לא מכסה. לבדוק ב-M0 |
| 5 | איפה n8n רץ (גרסה 1.2 ואילך) | פתוח: Cloud בתשלום או אירוח עצמי |
| 6 | משתמשים אמיתיים | דורשים מפתח Gemini בתשלום, ו-Vercel Hobby ו-GitHub Pages אינם מיועדים לשימוש מסחרי |
| 7 | הנחה על מחיר | מחיר Gemini 3.6 ו-3.8 Flash עולה מ-1.1.2027 (למשל קלט מ-$0.75 ל-$1.50). חל על שכבת התשלום בלבד |
| 8 | מקור ערכי MET (Should, פיצר 22) | טרם נבחר |
| 9 | Hobby ו-Pages אינם מיועדים למוצר מסחרי | אם המוצר ימשיך מעבר לקורס, צריך לבחון אחסון בתשלום |

---

## 7. מקורות

- [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini API rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)
- [AI Studio rate limit page](https://aistudio.google.com/rate-limit) (נקרא ע"י בעלת המוצר ב-13.10.2026, הדף דורש התחברות)
- [Gemini API Additional Terms](https://ai.google.dev/gemini-api/terms)
- [Gemini models](https://ai.google.dev/gemini-api/docs/models)
- [Gemini deprecations](https://ai.google.dev/gemini-api/docs/deprecations)
- [Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output)
- [Gemini text generation](https://ai.google.dev/gemini-api/docs/text-generation)
- [Gemini Interactions API](https://ai.google.dev/gemini-api/docs/interactions)
- [Vercel Functions limits](https://vercel.com/docs/functions/limitations)
- [Vercel Node.js runtime](https://vercel.com/docs/functions/runtimes/node-js)
- [Netlify Functions](https://docs.netlify.com/build/functions/overview/)
- [Supabase pricing](https://supabase.com/pricing)
- [Supabase API keys](https://supabase.com/docs/guides/api/api-keys)
- [Supabase JS installing](https://supabase.com/docs/reference/javascript/installing)
- [Supabase passwords](https://supabase.com/docs/guides/auth/passwords)
- [Supabase getClaims](https://supabase.com/docs/reference/javascript/auth-getclaims)
- [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
- [n8n: choose how to use n8n](https://docs.n8n.io/choose-how-to-use-n8n.md)
- [n8n pricing](https://n8n.io/pricing/)
- [n8n Schedule Trigger](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.scheduletrigger/)
- [n8n Gmail node](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.gmail/)
- [Chart.js installation](https://www.chartjs.org/docs/latest/getting-started/installation.html)
- [Chart.js accessibility](https://www.chartjs.org/docs/latest/general/accessibility.html)
- [uPlot](https://github.com/leeoniya/uPlot)
- [ApexCharts installation](https://apexcharts.com/docs/installation/)
- [Heebo – Google Fonts](https://fonts.google.com/specimen/Heebo)
