import {
  byId, getExercises, getLists, labelOf,
} from '../data.js';
import { callAsk } from '../api.js';
import { initPage } from '../nav.js';
import {
  CATEGORY_INFO, clear, el, expandable, fatalCard, loadingIndicator, noPlanCard,
} from '../ui.js';

const exerciseLine = (e, name) => (e.minutes ? `${e.minutes} דקות ${name}` : `${e.sets}x${e.reps} ${name}`);

async function render(main) {
  main.replaceChildren(loadingIndicator());
  const [lists, exercises, cycles] = await Promise.all([getLists(), getExercises(), callAsk('get_cycles')]);
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
  const plan = cycle.training_plan;
  const exercisesById = byId(exercises);

  main.append(
    el('section', { class: 'card center' },
      el('h2', {}, 'תכנית אימונים שבועית'),
      el('p', {}, `${plan.categories.length} קטגוריות · ${plan.workouts_per_week} אימונים בשבוע`)),
    el('div', { class: 'stack' }, plan.categories.map((c) => {
      const info = CATEGORY_INFO[c.category];
      const name = labelOf(lists.training_categories, c.category);
      // An exercise missing from exercises.json is not shown.
      const shown = c.exercises.filter((e) => exercisesById.has(e.exercise_id));
      return expandable(
        [
          el('img', { src: info.img, alt: info.alt }),
          el('span', { class: 'exp-title' }, el('strong', {}, name), el('span', { class: 'small muted' }, info.text)),
        ],
        // Aerobic is one 30-minute activity per workout, chosen by the user (ADR-5).
        el('div', {},
          c.category === 'aerobic' ? el('p', {}, 'בכל אימון: 30 דקות של אחת מהפעילויות') : null,
          el('ul', { class: 'line-list', 'aria-label': `תרגילי ${name}` }, shown.map((e) => el('li', {},
            el('span', {}, c.category === 'aerobic'
              ? exercisesById.get(e.exercise_id).name
              : exerciseLine(e, exercisesById.get(e.exercise_id).name)))))),
      );
    })),
  );
}

const frame = await initPage({ title: 'תכנית אימונים', active: 'training' });
if (frame) await render(frame.main);
