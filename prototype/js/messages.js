// Error codes (ARCHITECTURE 7.2) mapped to Hebrew messages.
const ERRORS = {
  bad_request: 'הבקשה לא תקינה. אפשר לרענן את הדף ולנסות שוב.',
  invalid_fields: 'יש שדות שצריך לתקן.',
  unauthorized: 'צריך להתחבר מחדש.',
  not_found: 'המחזור המבוקש לא נמצא.',
  method_not_allowed: 'הבקשה לא תקינה.',
  plan_exists: 'כבר קיימת תכנית.',
  cycle_not_finished: 'המחזור הנוכחי טרם הסתיים.',
  cycle_closed: 'המחזור הזה כבר נסגר.',
  too_large: 'הטקסט ארוך מדי.',
  profile_missing: 'צריך למלא קודם את הנתונים האישיים.',
  no_plan: 'עדיין אין תכנית. אפשר ליצור אותה עכשיו.',
  not_enough_foods: 'יש מעט מדי מזונות שמתאימים להעדפות שנבחרו.',
  ai_quota: 'המכסה היומית הסתיימה, אפשר לנסות שוב מחר.',
  ai_failed: 'לא הצלחנו ליצור תכנית. אם יש תכנית קודמת, היא נשארת בתוקף. אפשר לנסות שוב.',
  server_error: 'משהו השתבש. אפשר לנסות שוב.',
};

export const errorMessage = (code) => ERRORS[code] ?? ERRORS.server_error;

const FIELD_ERRORS = {
  required: 'יש למלא שדה זה',
  age_range: 'הגיל צריך להיות בין 18 ל-70',
  invalid_date: 'יש להזין תאריך תקין, בתבנית dd/mm/yyyy',
  none_combined: '"ללא העדפות" לא משתלב עם העדפה אחרת',
  goal_blocked: 'לא זמין לפי הגובה והמשקל שהוזנו',
  no_category: 'יש לסמן לפחות קטגוריה אחת',
  future_date: 'אי אפשר לדווח על תאריך עתידי',
  too_long: 'אפשר לכתוב עד 500 תווים',
  invalid: 'הערך לא תקין',
};

export function fieldMessage(code, range) {
  if (code === 'out_of_range' && range) return `הערך צריך להיות בין ${range[0]} ל-${range[1]}`;
  return FIELD_ERRORS[code] ?? FIELD_ERRORS.invalid;
}
