// Date helpers. All dates are 'YYYY-MM-DD' strings; arithmetic is done in UTC on a date without a time.

const toUtc = (date) => new Date(`${date}T00:00:00Z`);
const fromUtc = (d) => d.toISOString().slice(0, 10);

export function todayIL(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

export function addDays(date, n) {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + n);
  return fromUtc(d);
}

// 0 = Sunday ... 6 = Saturday
export function weekday(date) {
  return toUtc(date).getUTCDay();
}

// From today to the coming Saturday; under 3 days extends to the Saturday after it.
export function firstCycle(today) {
  const daysLeft = 7 - weekday(today);
  const end = addDays(today, daysLeft - 1);
  return { cycle_start: today, cycle_end: daysLeft < 3 ? addDays(end, 7) : end };
}

// The most recent Sunday (today included) through the Saturday after it.
export function nextCycle(today) {
  const start = addDays(today, -weekday(today));
  return { cycle_start: start, cycle_end: addDays(start, 6) };
}

export function datesBetween(a, b) {
  const out = [];
  for (let d = a; d <= b; d = addDays(d, 1)) out.push(d);
  return out;
}
