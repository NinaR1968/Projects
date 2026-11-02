import {
  byId, getExercises, getLists, labelOf,
} from '../data.js';
import { callAsk } from '../mock-api.js';
import { initPage } from '../nav.js';
import {
  CATEGORY_INFO, clear, el, expandable, fatalCard, noPlanCard,
} from '../ui.js';

const exerciseLine = (e, name) => (e.minutes ? `${e.minutes} דקות ${name}` : `${e.sets}x${e.reps} ${name}`);

async function render(main) {
  clear(main);
  const [lists, exercises, cycles] = await Promise.all([getLists(), getExercises(), callAsk('get_cycles')]);
  if (!cycles.ok) {
    main.append(fatalCard(cycles.error.code));
    return;
  }
  const cycle = cycles.data[0];
  if (!cycle) {
    main.append(noPlanCard(() => render(main)));
    return;
  }
  const plan = cycle.training_plan;
  const exercisesById = byId(exercises);

  main.append(
    el('section', { class: 'card center' },
      el('h2', {}, 'תכנית אימונים שבועית'),
      el('p', {}, `${plan.categories.length} קטגוריות · ${plan.workouts_per_week} אימונים בשבוע`)),
    el('div', { class: 'stack' }, plan.categories.map((c) => {
      const info = CATEGORY_INFO[c.category];
      const name = labelOf(lists.training_categories, c.category);
      return expandable(
        [
          el('img', { src: info.img, alt: info.alt }),
          el('span', { class: 'exp-title' }, el('strong', {}, name), el('span', { class: 'small muted' }, info.text)),
        ],
        el('ul', { class: 'line-list', 'aria-label': `תרגילי ${name}` }, c.exercises.map((e) => el('li', {},
          el('span', {}, exerciseLine(e, exercisesById.get(e.exercise_id).name))))),
      );
    })),
  );
}

const frame = await initPage({ title: 'תכנית אימונים', active: 'training' });
if (frame) await render(frame.main);
