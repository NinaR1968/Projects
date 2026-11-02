// The cycle report (ARCHITECTURE 3.6.6), without summary_text. Missing days are simply skipped.
import { balance } from './calc.js';
import { datesBetween } from './dates.js';

const round1 = (n) => Math.round(n * 10) / 10;
const avg = (nums) => (nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : null);

export function buildReport(logs, cycle) {
  const days = datesBetween(cycle.cycle_start, cycle.cycle_end);
  const inCycle = logs
    .filter((l) => l.log_date >= cycle.cycle_start && l.log_date <= cycle.cycle_end)
    .sort((a, b) => a.log_date.localeCompare(b.log_date));

  const weights = inCycle.filter((l) => l.weight_kg != null);
  const weight = {
    first_kg: weights.length ? weights[0].weight_kg : null,
    last_kg: weights.length ? weights[weights.length - 1].weight_kg : null,
    change_kg: weights.length ? round1(weights[weights.length - 1].weight_kg - weights[0].weight_kg) : null,
    series: weights.map((l) => ({ date: l.log_date, kg: l.weight_kg })),
  };

  // A day with no reported food says nothing about intake, so it stays out of the calorie figures.
  const eaten = inCycle.filter((l) => l.meals && l.meals.length > 0);
  const calorieSeries = eaten.map((l) => ({
    date: l.log_date, in: l.calories_in, tdee: l.tdee, balance: balance(l.calories_in, l.tdee),
  }));

  const worked = inCycle.filter((l) => l.workout && l.workout.status !== 'none');
  const times = new Map();
  for (const l of worked) {
    for (const c of l.workout.categories) times.set(c, (times.get(c) || 0) + 1);
  }

  return {
    days_total: days.length,
    days_logged: inCycle.length,
    days_complete: inCycle.filter((l) => l.weight_kg != null && l.meals && l.meals.length > 0 && l.workout).length,
    weight,
    calories: {
      avg_in: avg(calorieSeries.map((s) => s.in)),
      avg_tdee: avg(calorieSeries.map((s) => s.tdee)),
      avg_balance: avg(calorieSeries.map((s) => s.balance)),
      series: calorieSeries,
    },
    workouts: {
      done: worked.length,
      planned: days.length === 7 ? cycle.training_plan.workouts_per_week : null,
    },
    categories: [...times].map(([category, n]) => ({ category, times: n })),
    feedback_received: Boolean(cycle.feedback),
  };
}
