// The 4-step data wizard (DESIGN, "הזנת נתונים").
import {
  bmi, MIN_BMI_FOR_LOSS, NAME_MAX, RANGES, ageOn, validateProfile,
} from '../../shared/calc.js';
import { todayIL } from '../../shared/dates.js';
import { callAsk } from '../api.js';
import { getLists, labelOf } from '../data.js';
import { errorMessage } from '../messages.js';
import { initPage, leave, setLeaveGuard } from '../nav.js';
import {
  choiceGroup, clear, el, fieldErrorText, generatePlanIn, loadingIndicator, noPlanCard, selectField, setFieldError,
  stateCard, textField,
} from '../ui.js';

const STEPS = [
  { name: 'פרטים אישיים', fields: ['name', 'sex', 'birth_date', 'height_cm', 'weight_kg'] },
  { name: 'מדידות', fields: ['body_type', 'waist_cm', 'arm_cm', 'leg_cm'] },
  { name: 'העדפות ומטרות', fields: ['diet_preferences', 'fitness_level', 'workouts_per_week', 'goal'] },
  { name: 'סקירה ואישור', fields: [] },
];

const FIELD_NAMES = [...new Set(STEPS.flatMap((s) => s.fields))];
const SEX_LABELS = [{ code: 'female', label: 'אישה' }, { code: 'male', label: 'גבר' }];

// Browsers show their own format in a native date field, so birth date is typed as dd/mm/yyyy (DESIGN).
function parseBirthDate(text) {
  const m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(text.trim());
  if (!m) return '';
  const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : '';
}

const formatBirthDate = (iso) => (iso ? iso.split('-').reverse().join('/') : '');

const BODY_PATHS = {
  female: 'M24 25h12C37 29 43 29 45 33L50 62C50.500 66 46.500 67 46 63L41 38C40 46 38 50 38 54C38 60 43 66 43 76C43 92 39 110 38 144C38 147 32 147 32 144L30 84L28 144C28 147 22 147 22 144C21 110 17 92 17 76C17 66 22 60 22 54C22 50 20 46 19 38L14 63C13.500 67 9.500 66 10 62L15 33C17 29 23 29 24 25Z',
  male: 'M25 25h10C36 29 46 29 49 34L55 64C55.500 68 51 69 50.500 65L43 40C42 50 41 56 41 62C41 68 42 72 42 78C42 95 40 115 39 144C39 147 33 147 33 144L30 86L27 144C27 147 21 147 21 144C20 115 18 95 18 78C18 72 19 68 19 62C19 56 18 50 17 40L9.500 65C9 69 4.500 68 5 64L11 34C14 29 24 29 25 25Z',
};

// Where each girth is measured: a ring around the body part, with a line out to its label.
const MEASURE_MARKS = {
  female: [
    { label: 'יד', cx: 44.500, cy: 44, rx: 3.500 },
    { label: 'מותן', cx: 30, cy: 56, rx: 9 },
    { label: 'רגל', cx: 36.500, cy: 92, rx: 6.500 },
  ],
  male: [
    { label: 'יד', cx: 48, cy: 46, rx: 4 },
    { label: 'מותן', cx: 30, cy: 60, rx: 12 },
    { label: 'רגל', cx: 36, cy: 95, rx: 6.500 },
  ],
};

const silhouette = (sex) => {
  const marks = MEASURE_MARKS[sex].map(({ label, cx, cy, rx }) => `
    <ellipse class="measure-mark" cx="${cx}" cy="${cy}" rx="${rx}" ry="2"/>
    <line class="measure-mark" x1="${cx + rx}" y1="${cy}" x2="62" y2="${cy}"/>
    <text class="measure-label" x="64" y="${cy + 3}">${label}</text>`).join('');
  const span = document.createElement('span');
  span.innerHTML = `<svg class="silhouette" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 150" role="img" aria-label="איור גוף שמסמן איפה מודדים את היקף היד, המותן והרגל"><g fill="currentColor"><circle cx="30" cy="13" r="10"/><path d="${BODY_PATHS[sex]}"/></g>${marks}</svg>`;
  return span.firstChild;
};

async function start() {
  const lists = await getLists();
  const today = todayIL();
  let step = 0;
  let errors = {};
  let busy = false;

  const frame = await initPage({
    title: 'הזנת נתונים',
    active: null,
    requireProfile: false,
    onBack: () => {
      if (step > 0) {
        step -= 1;
        errors = {};
        render();
      } else if (frame?.profile) leave(() => history.back());
    },
  });
  if (!frame) return;
  const { main, showNav } = frame;
  let { profile } = frame;

  // A save creates the plan while the user has no cycle yet (spec/plans/milestone-4.md, 1.2).
  // If the check fails, a plan is assumed, so no plan is created by mistake.
  let hasPlan = false;
  if (profile) {
    main.append(loadingIndicator());
    const cycles = await callAsk('get_cycles');
    hasPlan = !cycles.ok || cycles.data.length > 0;
  }

  const draft = {
    name: profile?.name ?? '',
    sex: profile?.sex ?? '',
    birth_date: profile?.birth_date ?? '',
    height_cm: profile?.height_cm ?? '',
    weight_kg: profile?.weight_kg ?? '',
    body_type: profile?.body_type ?? '',
    waist_cm: profile?.waist_cm ?? '',
    arm_cm: profile?.arm_cm ?? '',
    leg_cm: profile?.leg_cm ?? '',
    diet_preferences: profile?.diet_preferences ?? ['none'],
    fitness_level: profile?.fitness_level ?? '',
    workouts_per_week: profile?.workouts_per_week ?? '',
    goal: profile?.goal ?? '',
  };

  let birthText = formatBirthDate(draft.birth_date);

  // Unsaved changes: the form now differs from what was loaded or last saved.
  const snapshot = () => JSON.stringify([draft, birthText]);
  let savedState = snapshot();
  let leaving = false;
  const isDirty = () => !leaving && snapshot() !== savedState;

  const toNumber = (v) => (v === '' ? '' : Number(v));
  const fieldError = (key) => (errors[key] ? fieldErrorText(errors[key], key === 'name' ? NAME_MAX : RANGES[key]) : '');
  const withError = (key, node) => {
    setFieldError(node, fieldError(key));
    node.dataset.field = key;
    return node;
  };
  const textInput = (key, label, type = 'text', attrs = {}, iconName) => withError(key, textField({
    label, type, value: draft[key], attrs, iconName, onInput: (v) => { draft[key] = type === 'number' ? toNumber(v) : v; },
  }));
  const numberInput = (key, label) => textInput(key, label, 'number', { inputmode: 'decimal', step: 'any', min: RANGES[key][0], max: RANGES[key][1] });

  const goTo = (index) => {
    step = index;
    errors = {};
    render();
    main.focus();
    window.scrollTo(0, 0);
  };

  // A new user moves only with "המשך". Once a profile is saved, any step can be opened directly.
  const stepper = () => el('ol', { class: 'stepper', 'aria-label': 'שלבי האשף' },
    STEPS.map((s, i) => {
      const content = [el('span', { class: 'num' }, String(i + 1)), s.name];
      return el('li', { 'aria-current': i === step ? 'step' : undefined },
        profile ? el('button', { class: 'step-link', type: 'button', onClick: () => goTo(i) }, content) : content);
    }));

  const stepOne = () => [
    textInput('name', 'שם', 'text', { autocomplete: 'off', maxlength: NAME_MAX }),
    withError('sex', choiceGroup({
      legend: 'מין', name: 'sex', value: draft.sex, options: SEX_LABELS, onChange: (v) => { draft.sex = v; },
    })),
    withError('birth_date', textField({
      label: 'תאריך לידה',
      value: birthText,
      iconName: 'calendar',
      attrs: { placeholder: 'dd/mm/yyyy', autocomplete: 'off', dir: 'ltr' },
      onInput: (v) => {
        birthText = v;
        draft.birth_date = parseBirthDate(v);
      },
    })),
    numberInput('height_cm', 'גובה (ס"מ)'),
    numberInput('weight_kg', 'משקל נוכחי (ק"ג)'),
  ];

  const stepTwo = () => [
    withError('body_type', selectField({
      label: 'מבנה גוף', value: draft.body_type, options: lists.body_types, onChange: (v) => { draft.body_type = v; },
    })),
    el('div', { class: 'measure-grid' },
      el('div', { class: 'stack' },
        numberInput('waist_cm', 'היקף מותן (ס"מ)'),
        numberInput('arm_cm', 'היקף יד (ס"מ)'),
        numberInput('leg_cm', 'היקף רגל (ס"מ)')),
      silhouette(draft.sex)),
  ];

  const dietChange = (code, checked) => {
    let prefs = draft.diet_preferences.filter((p) => p !== code);
    if (checked) prefs = code === 'none' ? ['none'] : [...prefs.filter((p) => p !== 'none'), code];
    draft.diet_preferences = prefs;
    // Updated in place, so keyboard focus stays on the checkbox.
    main.querySelectorAll('input[type="checkbox"]').forEach((box) => {
      box.checked = prefs.includes(box.value);
    });
  };

  const stepThree = () => {
    const blocked = typeof draft.weight_kg === 'number' && typeof draft.height_cm === 'number'
      && bmi(draft.weight_kg, draft.height_cm) < MIN_BMI_FOR_LOSS;
    if (blocked && draft.goal === 'lose_weight') draft.goal = '';
    const diet = withError('diet_preferences', el('fieldset', { class: 'field' },
      el('legend', {}, 'העדפות תזונה'),
      lists.diet_preferences.map((o) => el('label', { class: 'check-row' },
        el('input', {
          type: 'checkbox',
          value: o.code,
          checked: draft.diet_preferences.includes(o.code),
          onChange: (e) => dietChange(o.code, e.target.checked),
        }),
        el('span', {}, o.label, o.code === 'gluten_free' ? el('span', { class: 'hint' }, ' (לא מתאים לצליאק או לאלרגיה)') : null)))));
    const goals = withError('goal', el('fieldset', { class: 'field' },
      el('legend', {}, 'מטרה עיקרית'),
      lists.goals.map((o) => {
        const off = o.code === 'lose_weight' && blocked;
        return el('label', { class: `check-row ${off ? 'disabled' : ''}` },
          el('input', {
            type: 'radio',
            name: 'goal',
            value: o.code,
            disabled: off,
            checked: draft.goal === o.code,
            onChange: () => { draft.goal = o.code; },
          }),
          el('span', {}, o.label, off ? el('span', { class: 'hint' }, ' (לא זמין לפי הגובה והמשקל שהוזנו)') : null));
      })));
    return [
      diet,
      withError('fitness_level', selectField({
        label: 'רמת כושר נוכחית', value: draft.fitness_level, options: lists.fitness_levels, onChange: (v) => { draft.fitness_level = v; },
      })),
      withError('workouts_per_week', selectField({
        label: 'כמה אימונים בשבוע',
        value: draft.workouts_per_week,
        options: [1, 2, 3, 4, 5, 6, 7].map((n) => ({ code: n, label: String(n) })),
        onChange: (v) => { draft.workouts_per_week = toNumber(v); },
      })),
      goals,
    ];
  };

  const reviewGroup = (index, rows) => el('section', { class: 'card review-group' },
    el('div', { class: 'review-head' },
      el('h3', {}, STEPS[index].name),
      el('button', {
        class: 'text-link',
        type: 'button',
        'aria-label': `עריכת ${STEPS[index].name}`,
        onClick: () => { step = index; errors = {}; render(); },
      }, 'עריכה')),
    el('dl', {}, rows.map(([k, v]) => el('div', { class: 'review-row' }, el('dt', {}, k), el('dd', {}, String(v))))));

  const stepFour = () => {
    const prefs = draft.diet_preferences.map((p) => labelOf(lists.diet_preferences, p)).join(', ');
    return [
      reviewGroup(0, [
        ['שם', draft.name.trim()],
        ['מין', labelOf(SEX_LABELS, draft.sex)],
        ['גיל', ageOn(draft.birth_date, today)],
        ['גובה', `${draft.height_cm} ס"מ`],
        ['משקל', `${draft.weight_kg} ק"ג`],
      ]),
      reviewGroup(1, [
        ['מבנה גוף', labelOf(lists.body_types, draft.body_type)],
        ['היקף מותן', `${draft.waist_cm} ס"מ`],
        ['היקף יד', `${draft.arm_cm} ס"מ`],
        ['היקף רגל', `${draft.leg_cm} ס"מ`],
      ]),
      reviewGroup(2, [
        ['העדפות תזונה', prefs],
        ['רמת כושר', labelOf(lists.fitness_levels, draft.fitness_level)],
        ['אימונים בשבוע', draft.workouts_per_week],
        ['מטרה', labelOf(lists.goals, draft.goal)],
      ]),
    ];
  };

  const statusBox = el('div', { class: 'stack' });

  const allErrors = () => {
    const all = validateProfile(draft, lists, today);
    if (birthText.trim() && !draft.birth_date) all.birth_date = 'invalid_date';
    return all;
  };

  // Opens the first step with an invalid field and shows its messages.
  const showErrors = (all) => {
    errors = all;
    const first = FIELD_NAMES.find((f) => errors[f]);
    step = Math.max(0, STEPS.findIndex((s) => s.fields.includes(first)));
    render();
    main.querySelector('.has-error input, .has-error select')?.focus();
  };

  const nextStep = () => {
    const all = allErrors();
    errors = Object.fromEntries(STEPS[step].fields.filter((f) => all[f]).map((f) => [f, all[f]]));
    if (Object.keys(errors).length) {
      render();
      main.querySelector('.has-error input, .has-error select')?.focus();
      return;
    }
    step += 1;
    render();
    main.focus();
    window.scrollTo(0, 0);
  };

  const toPlan = () => { location.href = 'nutrition.html'; };

  // Returns true when the profile was saved, and the plan was created if there was none.
  // openPlan moves to the nutrition plan after a plan is created.
  const save = async (button, openPlan = false) => {
    if (busy) return false;
    statusBox.replaceChildren();
    // Steps can be skipped once a profile exists, so every field is checked again here.
    const all = allErrors();
    if (Object.keys(all).length) {
      showErrors(all);
      return false;
    }
    busy = true;
    if (button) button.disabled = true;
    const saved = await callAsk('save_profile', draft);
    if (!saved.ok) {
      busy = false;
      if (button) button.disabled = false;
      if (saved.error.code === 'invalid_fields') showErrors(saved.error.fields);
      else statusBox.replaceChildren(stateCard('error', errorMessage(saved.error.code)));
      return false;
    }
    savedState = snapshot();
    if (!profile) showNav();
    profile = saved.data;
    frame.profile = profile;

    if (hasPlan) {
      busy = false;
      render();
      statusBox.replaceChildren(stateCard('success', 'הנתונים נשמרו. השינוי ישפיע על התכנית הבאה, בסוף המחזור'));
      return true;
    }
    // The save button stays disabled while busy, so a second click cannot start another plan.
    render();
    const failed = await generatePlanIn(statusBox);
    busy = false;
    render();
    if (failed) {
      statusBox.replaceChildren(noPlanCard(toPlan, failed));
      return false;
    }
    hasPlan = true;
    statusBox.replaceChildren();
    if (openPlan) toPlan();
    return true;
  };

  // Asked before leaving the wizard with unsaved changes (DESIGN, "הזנת נתונים").
  const leaveDialog = el('dialog', { class: 'leave-dialog', 'aria-labelledby': 'leave-title' });
  document.body.append(leaveDialog);
  const askBeforeLeaving = (go) => {
    if (!isDirty()) {
      go();
      return;
    }
    const proceed = () => {
      leaving = true;
      go();
    };
    const choice = (text, cls, onClick) => el('button', { class: `btn ${cls}`, type: 'button', onClick }, text);
    leaveDialog.replaceChildren(
      el('h2', { id: 'leave-title' }, 'יש שינויים שלא נשמרו'),
      el('p', {}, 'מה לעשות עם השינויים?'),
      el('div', { class: 'stack' },
        choice('שמירה ומעבר', 'btn-primary', async () => {
          leaveDialog.close();
          if (await save()) proceed();
        }),
        choice('מעבר בלי שמירה', 'btn-outline', () => {
          leaveDialog.close();
          proceed();
        }),
        choice('ביטול', 'btn-text', () => leaveDialog.close())),
    );
    leaveDialog.showModal();
  };
  setLeaveGuard(askBeforeLeaving);
  // Closing the tab or typing another address: only the browser's own warning is possible there.
  window.addEventListener('beforeunload', (e) => {
    if (isDirty()) e.preventDefault();
  });

  function render() {
    const body = [stepOne, stepTwo, stepThree, stepFour][step]();
    const last = step === STEPS.length - 1;
    const saveLabel = hasPlan ? 'שמירה' : 'שמירה ויצירת תכנית';
    const primary = el('button', {
      class: 'btn btn-primary', type: 'button', disabled: busy,
    }, last ? saveLabel : 'המשך');
    primary.addEventListener('click', () => (last ? save(primary, true) : nextStep()));

    const headerBack = document.querySelector('.screen-header .icon-btn[aria-label="חזרה"]');
    if (headerBack) headerBack.hidden = step === 0 && !profile;

    clear(main);
    main.append(
      stepper(),
      el('section', { class: 'card', 'aria-labelledby': 'step-title' },
        el('h2', { id: 'step-title' }, STEPS[step].name),
        body.filter(Boolean)),
      statusBox,
      primary,
    );
  }

  render();
}

start();
