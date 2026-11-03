import { addDays, todayIL } from '../../shared/dates.js';
import { icon } from '../icons.js';
import {
  byId, getDemoFoods, getLists, labelOf,
} from '../data.js';
import { errorMessage, fieldMessage } from '../messages.js';
import { callAsk } from '../mock-api.js';
import { initPage } from '../nav.js';
import {
  MEAL_IMAGES, choiceGroup, clear, el, fatalCard, formatDate, noPlanCard, num, setFieldError, stateCard, textField,
} from '../ui.js';

const MAX_RESULTS = 20;
const WEIGHT_RANGE = [45, 150];

function balanceBlock(label, value, solo) {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  const word = value > 0 ? 'עודף' : value < 0 ? 'גרעון' : 'מאוזן';
  return el('div', { class: `metric ${solo ? 'solo' : ''}` },
    el('span', { class: 'small' }, label),
    el('span', { class: 'balance-value' }, `${sign}${num(Math.abs(value))}`),
    el('span', { class: 'small' }, `קלוריות, ${word}`));
}

function balanceCard(b) {
  return el('section', { class: 'card', 'aria-labelledby': 'bal', role: 'status' },
    el('h2', { id: 'bal' }, 'מאזן קלוריות'),
    el('div', { class: 'balance-grid' },
      balanceBlock('היום', b.today, b.yesterday === null),
      b.yesterday === null ? null : balanceBlock('אתמול', b.yesterday)));
}

async function start() {
  const frame = await initPage({ title: 'עדכון יומי', active: 'daily' });
  if (!frame) return;
  const { main } = frame;
  const [lists, foods] = await Promise.all([getLists(), getDemoFoods()]);
  const foodsById = byId(foods);
  const today = todayIL();
  let date = today;
  let form;
  let saving = false;

  const load = async () => {
    const res = await callAsk('get_daily', { date });
    clear(main);
    if (!res.ok) {
      main.append(fatalCard(res.error.code));
      return;
    }
    if (!res.data.menu) {
      main.append(noPlanCard(load));
      return;
    }
    const { log } = res.data;
    form = {
      status: log?.workout?.status ?? '',
      categories: log?.workout?.status === 'partial' ? [...log.workout.categories] : [],
      checked: (log?.meals ?? []).filter((m) => m.source === 'plan').map((m) => m.slot),
      extras: (log?.meals ?? []).filter((m) => m.source === 'manual').flatMap((m) => m.items),
      weight: log?.weight_kg ?? '',
    };
    render(res.data);
  };

  const dateBar = () => {
    const native = el('input', {
      class: 'date-native',
      type: 'date',
      value: date,
      max: today,
      'aria-label': `בחירת תאריך, נבחר ${formatDate(date)}`,
      onClick: (e) => e.target.showPicker?.(),
      onChange: (e) => {
        if (e.target.value && e.target.value <= today) {
          date = e.target.value;
          load();
        }
      },
    });
    const go = (n) => () => {
      date = addDays(date, n);
      load();
    };
    return el('div', { class: 'date-bar' },
      el('button', {
        class: 'icon-btn', type: 'button', 'aria-label': 'היום הקודם', onClick: go(-1),
      }, icon('right')),
      el('div', { class: 'date-center' },
        icon('calendar'),
        el('span', {}, formatDate(date)),
        native),
      el('button', {
        class: 'icon-btn', type: 'button', 'aria-label': 'היום הבא', disabled: date >= today, onClick: go(1),
      }, icon('left')));
  };

  const workoutCard = (categories) => {
    const partialBox = el('fieldset', { class: 'field', hidden: form.status !== 'partial' },
      el('legend', { class: 'small' }, 'אילו קטגוריות בוצעו?'),
      categories.map((code) => el('label', { class: 'check-row' },
        el('input', {
          type: 'checkbox',
          checked: form.categories.includes(code),
          onChange: (e) => {
            form.categories = e.target.checked
              ? [...form.categories, code]
              : form.categories.filter((c) => c !== code);
          },
        }),
        labelOf(lists.training_categories, code))));
    const group = choiceGroup({
      legend: 'מה בוצע היום?',
      name: 'workout',
      value: form.status,
      options: lists.workout_statuses,
      onChange: (v) => {
        form.status = v;
        partialBox.hidden = v !== 'partial';
      },
    });
    return el('section', { class: 'card', 'aria-labelledby': 'wk', 'data-section': 'workout' },
      el('h2', { id: 'wk' }, 'ביצוע אימון'), group, partialBox);
  };

  const mealsCard = (menu) => el('section', { class: 'card', 'aria-labelledby': 'ml' },
    el('h2', { id: 'ml' }, 'ארוחות'),
    menu.meals.map((meal) => {
      const [src, alt] = MEAL_IMAGES[meal.slot];
      return el('label', { class: 'meal-row' },
        el('input', {
          type: 'checkbox',
          checked: form.checked.includes(meal.slot),
          onChange: (e) => {
            form.checked = e.target.checked
              ? [...form.checked, meal.slot]
              : form.checked.filter((s) => s !== meal.slot);
          },
        }),
        el('img', { src, alt }),
        el('span', { class: 'name' }, labelOf(lists.meal_slots, meal.slot)),
        el('span', { class: 'small muted' }, `${num(meal.totals.kcal)} קלוריות`));
    }),
    extrasBlock());

  function extrasBlock() {
    const list = el('ul', { class: 'line-list', 'aria-label': 'מזון ושתייה שנוספו' });
    const drawList = () => {
      list.hidden = form.extras.length === 0;
      list.replaceChildren(...form.extras.map((item, i) => {
        const food = foodsById.get(item.food_id);
        return el('li', {},
          el('span', {}, `${food.name}, ${num(item.grams)} ג`),
          el('span', { class: 'amount small' }, `${num(Math.round((food.kcal * item.grams) / 100))} קלוריות`),
          el('button', {
            class: 'icon-btn',
            type: 'button',
            'aria-label': `הסרת ${food.name}`,
            onClick: () => {
              form.extras.splice(i, 1);
              drawList();
            },
          }, icon('x')));
      }));
    };
    drawList();

    let selected = null;
    const results = el('div', { 'aria-live': 'polite' });
    const search = textField({
      label: 'חיפוש במאגר',
      type: 'search',
      attrs: { autocomplete: 'off' },
      onInput: (v) => drawResults(v),
    });
    const grams = textField({ label: 'כמות בגרמים', type: 'number', attrs: { min: 1, max: 2000, inputmode: 'numeric' } });
    const adder = el('div', { class: 'stack', hidden: true });

    function drawResults(q) {
      selected = null;
      const term = q.trim();
      if (term.length < 2) {
        results.replaceChildren();
        return;
      }
      const found = foods.filter((f) => f.name.includes(term)).slice(0, MAX_RESULTS);
      if (!found.length) {
        results.replaceChildren(el('p', { class: 'small' }, 'לא נמצא מזון במאגר. אפשר להוסיף רק מזון שקיים במאגר.'));
        return;
      }
      results.replaceChildren(el('ul', { class: 'search-results' }, found.map((f) => el('li', {},
        el('button', {
          type: 'button',
          'aria-pressed': 'false',
          onClick: (e) => {
            selected = f;
            results.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', 'false'));
            e.currentTarget.setAttribute('aria-pressed', 'true');
            setFieldError(search, '');
            grams.querySelector('input').focus();
          },
        }, `${f.name} (${num(f.kcal)} קלוריות ל-100 ג)`)))));
    }

    const add = el('button', {
      class: 'btn btn-primary',
      type: 'button',
      onClick: () => {
        const g = Number(grams.querySelector('input').value);
        setFieldError(search, selected ? '' : 'יש לבחור מזון מהרשימה');
        const okGrams = g > 0 && g <= 2000;
        setFieldError(grams, okGrams ? '' : fieldMessage('out_of_range', [1, 2000]));
        if (!selected || !okGrams) return;
        form.extras.push({ food_id: selected.id, grams: g });
        selected = null;
        search.querySelector('input').value = '';
        grams.querySelector('input').value = '';
        results.replaceChildren();
        drawList();
        search.querySelector('input').focus();
      },
    }, 'הוספה');
    adder.append(search, results, grams, add);

    const toggle = el('button', {
      class: 'btn btn-outline',
      type: 'button',
      'aria-expanded': 'false',
      onClick: () => {
        adder.hidden = !adder.hidden;
        toggle.setAttribute('aria-expanded', String(!adder.hidden));
        if (!adder.hidden) search.querySelector('input').focus();
      },
    }, icon('plus'), 'הוספת מזון או שתייה');

    return el('div', { class: 'stack' }, list, toggle, adder);
  }

  function render(data, balance, error) {
    const weightField = textField({
      label: 'משקל (ק"ג)',
      type: 'number',
      value: form.weight,
      attrs: { inputmode: 'decimal', step: '0.1', min: WEIGHT_RANGE[0], max: WEIGHT_RANGE[1] },
      onInput: (v) => { form.weight = v; },
    });
    const workoutSection = workoutCard(data.categories);
    const status = el('div', { class: 'stack' });
    if (error) status.append(stateCard('error', errorMessage(error)));

    const save = el('button', { class: 'btn btn-primary', type: 'button' }, 'שמירת עדכון יומי');
    save.addEventListener('click', async () => {
      if (saving) return;
      saving = true;
      save.disabled = true;
      status.replaceChildren();
      setFieldError(weightField, '');
      workoutSection.querySelector('.field-error')?.remove();
      const res = await callAsk('save_daily', {
        date,
        weight_kg: form.weight === '' ? null : Number(form.weight),
        workout: form.status ? { status: form.status, categories: form.categories } : null,
        checked_slots: form.checked,
        extra_items: form.extras,
      });
      saving = false;
      save.disabled = false;
      if (res.ok) {
        render(data, res.data.balance);
        main.focus();
        window.scrollTo(0, 0);
        return;
      }
      if (res.error.code !== 'invalid_fields') {
        status.replaceChildren(stateCard('error', errorMessage(res.error.code)));
        return;
      }
      const { fields } = res.error;
      if (fields.weight_kg) {
        setFieldError(weightField, fieldMessage(fields.weight_kg, WEIGHT_RANGE));
        weightField.querySelector('input').focus();
      }
      if (fields.workout) setFieldError(workoutSection, fieldMessage(fields.workout));
      if (fields.date) status.replaceChildren(stateCard('error', fieldMessage(fields.date)));
    });

    clear(main);
    if (balance) main.append(balanceCard(balance));
    main.append(
      dateBar(),
      workoutSection,
      mealsCard(data.menu),
      el('section', { class: 'card', 'aria-labelledby': 'wg' }, el('h2', { id: 'wg' }, 'משקל'), weightField),
      status,
      save,
    );
  }

  await load();
}

start();
