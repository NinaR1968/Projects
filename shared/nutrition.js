// Nutrition values are per 100 grams in the food files.

export function itemNutrition(item, foodsById) {
  const food = foodsById.get(item.food_id);
  const r = item.grams / 100;
  return { kcal: food.kcal * r, protein: food.protein * r, fat: food.fat * r, carbs: food.carbs * r };
}

export function sumNutrition(items, foodsById) {
  const sum = { kcal: 0, protein: 0, fat: 0, carbs: 0 };
  for (const item of items) {
    const n = itemNutrition(item, foodsById);
    for (const k of Object.keys(sum)) sum[k] += n[k];
  }
  return sum;
}

const roundTotals = (t) => ({
  kcal: Math.round(t.kcal), protein: Math.round(t.protein), fat: Math.round(t.fat), carbs: Math.round(t.carbs),
});

const roundTo5 = (g) => Math.max(5, Math.round(g / 5) * 5);

// Scales grams to the calorie target (ARCHITECTURE 5.5). Returns null when the menu is too far from the target.
export function scaleMenu(menu, foodsById, calorieTarget, proteinTarget) {
  const allItems = menu.meals.flatMap((m) => m.items);
  const factor = calorieTarget / sumNutrition(allItems, foodsById).kcal;
  if (!(factor >= 0.5 && factor <= 1.5)) return null;

  const meals = menu.meals.map((m) => {
    const items = m.items.map((i) => ({ food_id: i.food_id, grams: roundTo5(i.grams * factor) }));
    return { slot: m.slot, items, totals: roundTotals(sumNutrition(items, foodsById)) };
  });
  const totals = roundTotals(sumNutrition(meals.flatMap((m) => m.items), foodsById));
  return {
    calorie_target: Math.round(calorieTarget),
    protein_target: Math.round(proteinTarget),
    meals,
    totals,
  };
}
