// Shared building blocks for the pages. Data text always goes in as text nodes, never as HTML.
import { icon } from './icons.js';
import { callAsk } from './mock-api.js';
import { errorMessage, fieldMessage } from './messages.js';

let idCounter = 0;
export const nextId = (prefix) => `${prefix}-${++idCounter}`;

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'class') node.className = value;
    else if (key === 'value') node.value = value;
    else if (key === 'checked' || key === 'disabled' || key === 'hidden' || key === 'selected') node[key] = true;
    else node.setAttribute(key, value === true ? '' : value);
  }
  node.append(...children.flat().filter((c) => c !== null && c !== undefined && c !== false));
  return node;
}

export const clear = (node) => node.replaceChildren();

export const formatDate = (date) => {
  const [y, m, d] = date.split('-').map(Number);
  return `${d}.${m}.${y}`;
};

export const num = (n) => Number(n).toLocaleString('en-US');

export const MEAL_IMAGES = {
  breakfast: ['images/breakfast.jpg', 'ארוחת בוקר בריאה'],
  snack_1: ['images/snack_1.jpg', 'חטיף בריא'],
  lunch: ['images/lunch.jpg', 'ארוחת צהריים בריאה'],
  snack_2: ['images/snack_2.jpg', 'חטיף בריא'],
  dinner: ['images/dinner.jpg', 'ארוחת ערב בריאה'],
};

export const CATEGORY_INFO = {
  aerobic: { img: 'images/aerobic.jpg', alt: 'גבר ואישה רצים בפארק', text: 'שיפור סיבולת לב ריאה' },
  legs: { img: 'images/legs.jpg', alt: 'אימון רגליים', text: 'חיזוק פלג גוף תחתון' },
  arms: { img: 'images/arms.jpg', alt: 'אימון ידיים עם משקולת', text: 'חיזוק ידיים וזרועות' },
  abs: { img: 'images/abs.jpg', alt: 'אימון בטן', text: 'חיזוק שרירי בטן' },
  shoulders: { img: 'images/shoulders.jpg', alt: 'אימון כתפיים', text: 'חיזוק כתפיים' },
  back: { img: 'images/back.jpg', alt: 'אימון גב', text: 'חיזוק שרירי גב' },
};

export const SAFETY_TEXT = 'המידע באפליקציה הוא כללי ואינו ייעוץ רפואי או תזונתי. אם יש לך מצב רפואי, הריון, אלרגיה או רגישות, יש להתייעץ עם איש מקצוע לפני שמתחילים.';
export const safetyNote = () => el('p', { class: 'safety' }, SAFETY_TEXT);

// ---- State cards ----
export function stateCard(kind, message, ...extra) {
  const icons = {
    info: 'info', error: 'alert', success: 'checkCircle', plain: 'info',
  };
  const live = kind === 'error' ? { role: 'alert' } : { role: 'status' };
  return el('div', { class: `state-card state-${kind}`, ...live },
    icon(icons[kind]),
    el('div', { class: 'body' }, el('p', {}, message), ...extra));
}

export const waitingCard = () => stateCard('info', 'התכנית בהכנה. זה עשוי לקחת כמה שניות');

// "No plan yet" card with the create button, including its waiting and error states.
export function noPlanCard(onCreated) {
  const box = el('div', { class: 'stack' });
  const show = (errorCode) => {
    const button = el('button', { class: 'btn btn-primary', type: 'button' }, 'יצירת תכנית');
    button.addEventListener('click', async () => {
      button.disabled = true;
      box.replaceChildren(waitingCard());
      const res = await callAsk('generate_plan');
      if (res.ok || res.error.code === 'plan_exists') onCreated();
      else show(res.error.code);
    });
    box.replaceChildren(...[
      errorCode ? stateCard('error', errorMessage(errorCode)) : null,
      stateCard('plain', 'עדיין אין תכנית. אפשר ליצור אותה עכשיו', button),
    ].filter(Boolean));
  };
  show();
  return box;
}

export function fatalCard(code) {
  return stateCard('error', errorMessage(code));
}

// ---- Fields ----
export function setFieldError(wrapper, message) {
  wrapper.querySelector('.field-error')?.remove();
  wrapper.classList.toggle('has-error', Boolean(message));
  const control = wrapper.querySelector('input, select, textarea');
  if (!message) {
    control?.removeAttribute('aria-invalid');
    control?.removeAttribute('aria-describedby');
    return;
  }
  const id = nextId('err');
  wrapper.append(el('p', { class: 'field-error', id }, icon('alert', 'icon-sm'), message));
  if (control) {
    control.setAttribute('aria-invalid', 'true');
    control.setAttribute('aria-describedby', id);
  }
}

export function textField({ label, type = 'text', value, iconName, attrs = {}, onInput }) {
  const id = nextId('f');
  const input = el('input', {
    id, type, value: value ?? '', ...attrs, onInput: (e) => onInput?.(e.target.value),
  });
  return el('div', { class: 'field' },
    el('label', { for: id }, label),
    el('div', { class: `input-wrap ${iconName ? 'has-icon' : ''}` }, iconName ? icon(iconName) : null, input));
}

export function selectField({ label, value, options, onChange }) {
  const id = nextId('f');
  const select = el('select', { id, onChange: (e) => onChange(e.target.value) },
    el('option', { value: '', selected: !value }, 'בחירת אפשרות'),
    options.map((o) => el('option', { value: o.code, selected: String(o.code) === String(value) }, o.label)));
  return el('div', { class: 'field' }, el('label', { for: id }, label), select);
}

export function choiceGroup({ legend, name, value, options, onChange }) {
  const box = el('fieldset', { class: 'field' },
    el('legend', {}, legend),
    el('div', { class: 'choices' }, options.map((o) => el('label', { class: 'choice' },
      el('input', {
        type: 'radio', name, value: o.code, checked: o.code === value, onChange: () => onChange(o.code),
      }),
      icon('check', 'icon-sm'),
      o.label))));
  return box;
}

export function fieldErrorText(code, range) {
  return fieldMessage(code, range);
}

// ---- Expandable card ----
export function expandable(head, body, extra) {
  const bodyId = nextId('exp');
  const panel = el('div', { class: 'exp-body', id: bodyId, hidden: true }, body);
  const button = el('button', {
    class: 'exp-head', type: 'button', 'aria-expanded': 'false', 'aria-controls': bodyId,
  }, head, icon('left', 'chev'));
  button.addEventListener('click', () => {
    const open = button.getAttribute('aria-expanded') === 'true';
    button.setAttribute('aria-expanded', String(!open));
    panel.hidden = open;
  });
  return el('article', { class: 'exp-card' }, button, extra, panel);
}

// ---- Popover shared by the demo tools and the user menu ----
export function popover(button, panel) {
  const close = (refocus) => {
    panel.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (refocus) button.focus();
  };
  button.setAttribute('aria-expanded', 'false');
  panel.hidden = true;
  button.addEventListener('click', () => {
    const opening = panel.hidden;
    panel.hidden = !opening;
    button.setAttribute('aria-expanded', String(opening));
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) close(true);
  });
  document.addEventListener('click', (e) => {
    if (!panel.hidden && !panel.contains(e.target) && !button.contains(e.target)) close(false);
  });
}
