import { todayIL } from '../../shared/dates.js';
import { weightChart, weightTable } from '../chart-basic.js';
import { getLists, labelOf } from '../data.js';
import { icon } from '../icons.js';
import { errorMessage, fieldMessage } from '../messages.js';
import { callAsk } from '../api.js';
import { initPage } from '../nav.js';
import {
  clear, el, fatalCard, formatDate, loadingIndicator, nextId, noPlanCard, num, setFieldError, stateCard, waitingCard,
} from '../ui.js';

const signed = (n) => (n > 0 ? `+${num(n)}` : n < 0 ? `−${num(Math.abs(n))}` : '0');
const balanceWord = (n) => (n > 0 ? 'עודף' : n < 0 ? 'גרעון' : 'מאוזן');

function metric(label, value, unit) {
  return el('div', { class: 'metric' },
    el('span', { class: 'small' }, label),
    el('span', { class: 'value' }, el('span', { class: 'num-ltr' }, value)),
    el('span', { class: 'small muted' }, unit));
}

function workoutsCard(w) {
  const dots = w.planned === null ? null : el('div', { class: 'dots', 'aria-hidden': 'true' },
    Array.from({ length: Math.max(w.planned, w.done) }, (_, i) => el('span', { class: `dot ${i < w.done ? 'full' : ''}` })));
  return el('section', { class: 'card' },
    el('div', { class: 'row-between' },
      el('h2', {}, 'ביצוע אימונים'),
      el('span', { class: 'big-value num-ltr' }, w.planned === null ? String(w.done) : `${w.done}/${w.planned}`)),
    w.planned === null ? el('p', { class: 'small' }, 'מספר האימונים שבוצעו במחזור') : el('p', { class: 'small' }, `בוצעו ${w.done} מתוך ${w.planned} שתוכננו`),
    dots);
}

function caloriesCard(cal) {
  return el('section', { class: 'card' },
    el('h2', {}, 'צריכת קלוריות ומאזן'),
    el('div', { class: 'table-wrap' },
      el('table', {},
        el('thead', {}, el('tr', {},
          el('th', { scope: 'col' }, 'תאריך'),
          el('th', { scope: 'col', class: 'num' }, 'נצרכו'),
          el('th', { scope: 'col', class: 'num' }, 'TDEE'),
          el('th', { scope: 'col', class: 'num' }, 'מאזן'))),
        el('tbody', {}, cal.series.map((d) => el('tr', {},
          el('td', {}, formatDate(d.date)),
          el('td', { class: 'num' }, num(d.in)),
          el('td', { class: 'num' }, num(d.tdee)),
          el('td', { class: 'num' }, el('span', { class: 'num-ltr' }, signed(d.balance)), ` ${balanceWord(d.balance)}`)))))),
    el('p', { class: 'small' }, `ממוצע ליום: ${num(cal.avg_in)} קלוריות נצרכו`));
}

function feedbackForm(cycle, onSaved) {
  const fieldFor = (key, label) => {
    const id = nextId('fb');
    const area = el('textarea', {
      id, maxlength: 500, placeholder: 'כאן כותבים...',
    });
    area.value = cycle.feedback?.[key] ?? '';
    return { area, node: el('div', { class: 'field' }, el('label', { for: id }, label), area) };
  };
  const training = fieldFor('training', 'פידבק על האימונים');
  const menu = fieldFor('menu', 'פידבק על התפריט');
  const status = el('div');
  const save = el('button', { class: 'btn btn-outline', type: 'button' }, 'שמירת פידבק');
  save.addEventListener('click', async () => {
    save.disabled = true;
    setFieldError(training.node, '');
    setFieldError(menu.node, '');
    const res = await callAsk('save_feedback', {
      cycle_id: cycle.id, training: training.area.value, menu: menu.area.value,
    });
    save.disabled = false;
    if (res.ok) {
      onSaved(res.data);
      status.replaceChildren(stateCard('success', 'הפידבק נשמר'));
    } else if (res.error.code === 'invalid_fields') {
      if (res.error.fields.training) setFieldError(training.node, fieldMessage(res.error.fields.training));
      if (res.error.fields.menu) setFieldError(menu.node, fieldMessage(res.error.fields.menu));
    } else status.replaceChildren(stateCard('error', errorMessage(res.error.code)));
  });
  return el('section', { class: 'card' },
    el('h2', {}, 'פידבק'),
    el('p', { class: 'small' }, 'עד 500 תווים בכל שדה'),
    training.node, menu.node, status, save);
}

function savedFeedback(feedback, received) {
  return el('section', { class: 'card' },
    el('h2', {}, 'הפידבק שנשמר'),
    received && feedback?.training ? el('p', {}, el('strong', {}, 'על האימונים: '), feedback.training) : null,
    received && feedback?.menu ? el('p', {}, el('strong', {}, 'על התפריט: '), feedback.menu) : null,
    !received ? el('p', {}, 'לא התקבל פידבק') : null);
}

async function start() {
  const frame = await initPage({ title: 'התקדמות ודוחות', active: 'progress' });
  if (!frame) return;
  const { main } = frame;
  const lists = await getLists();
  let cycles = [];
  let index = 0;
  let closing = false;

  const load = async () => {
    main.replaceChildren(loadingIndicator());
    const res = await callAsk('get_cycles');
    clear(main);
    if (!res.ok) {
      main.append(fatalCard(res.error.code));
      return;
    }
    cycles = res.data;
    if (!cycles.length) {
      main.append(noPlanCard(load));
      return;
    }
    await showCycle();
  };

  const closeButton = (cycle, status) => {
    const ended = todayIL() > cycle.cycle_end;
    const hintId = nextId('close-hint');
    const button = el('button', {
      class: 'btn btn-primary', type: 'button', disabled: !ended, ...(ended ? {} : { 'aria-describedby': hintId }),
    }, 'סיום מחזור וקבלת תכנית חדשה');
    button.addEventListener('click', async () => {
      if (closing) return;
      closing = true;
      button.disabled = true;
      status.replaceChildren(waitingCard());
      const res = await callAsk('close_cycle', { cycle_id: cycle.id });
      closing = false;
      if (res.ok || res.error.code === 'cycle_closed') {
        const list = await callAsk('get_cycles');
        if (!list.ok) {
          main.replaceChildren(fatalCard(list.error.code));
          return;
        }
        cycles = list.data;
        index = cycles.findIndex((c) => c.id === cycle.id);
        await showCycle();
        main.focus();
        return;
      }
      button.disabled = false;
      status.replaceChildren(stateCard('error', errorMessage(res.error.code)));
    });
    return el('div', { class: 'stack' },
      status,
      button,
      ended ? null : el('p', { class: 'small', id: hintId }, 'המחזור הנוכחי טרם הסתיים'));
  };

  async function showCycle() {
    const shown = cycles[index];
    main.replaceChildren(loadingIndicator());
    const res = await callAsk('get_report', { cycle_id: shown.id });
    clear(main);
    if (!res.ok) {
      main.append(fatalCard(res.error.code));
      return;
    }
    const { cycle, report } = res.data;
    const closed = Boolean(cycle.report);
    const go = (delta) => () => {
      index += delta;
      showCycle();
    };

    const weekBar = el('div', { class: 'week-bar' },
      el('button', {
        class: 'icon-btn', type: 'button', 'aria-label': 'השבוע הקודם', disabled: index >= cycles.length - 1, onClick: go(1),
      }, icon('right')),
      el('span', { class: 'num-ltr' }, `${formatDate(cycle.cycle_start)} - ${formatDate(cycle.cycle_end)}`),
      el('button', {
        class: 'icon-btn', type: 'button', 'aria-label': 'השבוע הבא', disabled: index === 0, onClick: go(-1),
      }, icon('left')));

    main.append(weekBar);

    // The most recently closed cycle: its report and the updated plan appear together.
    if (closed && index === 1) {
      main.append(el('section', { class: 'card', role: 'status' },
        el('h2', {}, 'התכנית והתפריט המעודכנים'),
        el('p', {}, 'התכנית והתפריט החדשים מוכנים למחזור הנוכחי. הדוח על המחזור שהסתיים מופיע כאן למטה.'),
        el('a', { class: 'text-link', href: 'nutrition.html' }, 'לתכנית תזונה', icon('left', 'icon-sm')),
        el('a', { class: 'text-link', href: 'training.html' }, 'לתכנית אימונים', icon('left', 'icon-sm'))));
    }

    if (report.days_logged === 0) {
      main.append(stateCard('plain', 'עדיין אין דיווחים במחזור הזה. הדוח ייבנה מהימים שיוזנו בעדכון היומי.'));
    } else {
      const { weight, calories } = report;
      main.append(el('div', { class: 'tiles-2' },
        metric('שינוי במשקל', weight.change_kg === null ? '–' : signed(weight.change_kg), 'ק"ג'),
        metric('מאזן קלוריות ממוצע ליום', calories.avg_balance === null ? '–' : signed(calories.avg_balance), calories.avg_balance === null ? 'קלוריות' : `קלוריות, ${balanceWord(calories.avg_balance)}`)));
      if (weight.series.length) {
        main.append(el('section', { class: 'card' },
          el('div', { class: 'row-between' },
            el('h2', {}, 'משקל (ק"ג)'),
            el('span', { class: 'big-value' }, String(weight.last_kg))),
          weightChart(weight.series),
          weightTable(weight.series)));
      }
      main.append(workoutsCard(report.workouts));
      if (calories.series.length) main.append(caloriesCard(calories));
      main.append(el('section', { class: 'card' },
        el('h2', {}, 'קטגוריות שבוצעו'),
        report.categories.length
          ? el('ul', { class: 'line-list' }, report.categories.map((c) => el('li', {},
            el('span', {}, labelOf(lists.training_categories, c.category)),
            el('span', { class: 'amount' }, c.times === 1 ? 'פעם אחת' : `${c.times} פעמים`))))
          : el('p', {}, 'לא דווחו אימונים במחזור הזה')));
    }

    if (closed) {
      main.append(el('section', { class: 'card' }, el('h2', {}, 'סיכום'), el('p', {}, report.summary_text)));
      main.append(savedFeedback(cycle.feedback, report.feedback_received));
    } else {
      const ended = todayIL() > cycle.cycle_end;
      if (ended) main.append(feedbackForm(cycle, (updated) => { cycles[index] = updated; }));
      else main.append(stateCard('plain', 'אפשר לכתוב פידבק מהיום שאחרי סוף המחזור'));
      main.append(closeButton(cycle, el('div', { class: 'stack' })));
    }
  }

  await load();
}

start();
