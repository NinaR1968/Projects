import { icon } from '../icons.js';
import { byId, getFoods, getLists, labelOf } from '../data.js';
import { callAsk } from '../api.js';
import { initPage } from '../nav.js';
import {
  MEAL_IMAGES, clear, el, expandable, fatalCard, loadingIndicator, noPlanCard, num,
} from '../ui.js';

const tile = (iconName, cls, label, value) => el('div', { class: 'tile' },
  icon(iconName, cls), el('span', { class: 'value' }, value), el('span', { class: 'label' }, label));

const values = (t) => [
  ['קלוריות', num(t.kcal)], ['חלבון (ג)', num(t.protein)], ['פחמימות (ג)', num(t.carbs)], ['שומן (ג)', num(t.fat)],
];

async function render(main) {
  main.replaceChildren(loadingIndicator());
  const [lists, foods, cycles] = await Promise.all([getLists(), getFoods(), callAsk('get_cycles')]);
  clear(main);
  if (!cycles.ok) {
    main.append(fatalCard(cycles.error.code));
    return;
  }
  // The newest cycle is the active plan (ARCHITECTURE 3.4).
  const cycle = cycles.data[0];
  if (!cycle) {
    main.append(noPlanCard(() => render(main)));
    return;
  }
  const { menu } = cycle;
  const foodsById = byId(foods);

  main.append(
    el('section', { class: 'card', 'aria-labelledby': 'sum' },
      el('h2', { id: 'sum', class: 'center' }, 'סיכום יומי'),
      el('div', { class: 'tiles' },
        tile('flame', 'ic-kcal', 'קלוריות', num(menu.totals.kcal)),
        tile('dumbbell', 'ic-protein', 'חלבון (ג)', num(menu.totals.protein)),
        tile('wheat', 'ic-carbs', 'פחמימות (ג)', num(menu.totals.carbs)),
        tile('droplet', 'ic-fat', 'שומן (ג)', num(menu.totals.fat))),
      el('p', { class: 'small center' }, `יעד חלבון ${num(menu.protein_target)} ג, בתפריט ${num(menu.totals.protein)} ג · יעד קלוריות ${num(menu.calorie_target)}`)),
    el('div', { class: 'stack' }, menu.meals.map((meal) => {
      const [src, alt] = MEAL_IMAGES[meal.slot];
      const name = labelOf(lists.meal_slots, meal.slot);
      // An item whose food is missing from foods.json is not shown (PRD feature 12).
      const items = meal.items.filter((item) => foodsById.has(item.food_id));
      return expandable(
        [el('img', { src, alt }), el('span', { class: 'exp-title' }, el('strong', {}, name))],
        el('ul', { class: 'line-list', 'aria-label': `רכיבי ${name}` }, items.map((item) => el('li', {},
          el('span', {}, foodsById.get(item.food_id).name),
          el('span', { class: 'amount' }, `${num(item.grams)} ג`)))),
        el('div', { class: 'meal-values' }, values(meal.totals).map(([label, v]) => el('div', {},
          el('div', { class: 'value' }, v), el('div', { class: 'label' }, label)))),
      );
    })),
  );
}

const frame = await initPage({ title: 'תכנית תזונה', active: 'nutrition' });
if (frame) await render(frame.main);
