import { icon } from '../icons.js';
import { callAsk, hasSession, signIn } from '../mock-api.js';
import { demoStrip } from '../nav.js';
import {
  el, safetyNote, setFieldError, stateCard, textField,
} from '../ui.js';

async function goHome() {
  const res = await callAsk('get_profile');
  location.replace(res.ok && res.data ? 'daily.html' : 'profile.html');
}

function render() {
  const app = document.getElementById('app');
  const state = { email: '', password: '' };
  const errorBox = el('div', { role: 'alert' });

  const emailField = textField({
    label: 'אימייל', type: 'email', iconName: 'mail', attrs: { autocomplete: 'off' }, onInput: (v) => { state.email = v; },
  });
  const passField = textField({
    label: 'סיסמה', type: 'password', iconName: 'lock', attrs: { autocomplete: 'off' }, onInput: (v) => { state.password = v; },
  });
  const passInput = passField.querySelector('input');
  const eyeBtn = el('button', { class: 'icon-btn eye-btn', type: 'button', 'aria-label': 'הצגת הסיסמה' }, icon('eye'));
  eyeBtn.addEventListener('click', () => {
    const show = passInput.type === 'password';
    passInput.type = show ? 'text' : 'password';
    eyeBtn.setAttribute('aria-label', show ? 'הסתרת הסיסמה' : 'הצגת הסיסמה');
    eyeBtn.replaceChildren(icon(show ? 'eyeOff' : 'eye'));
  });
  passField.querySelector('.input-wrap').append(eyeBtn);

  const fill = (email) => () => {
    state.email = email;
    emailField.querySelector('input').value = email;
    passInput.focus();
  };

  const form = el('form', {
    class: 'stack',
    novalidate: true,
    onSubmit: async (e) => {
      e.preventDefault();
      errorBox.replaceChildren();
      setFieldError(emailField, state.email.trim() ? '' : 'יש למלא שדה זה');
      setFieldError(passField, state.password ? '' : 'יש למלא שדה זה');
      if (!state.email.trim() || !state.password) return;
      if (signIn(state.email)) await goHome();
      else errorBox.replaceChildren(stateCard('error', 'פרטי הכניסה שגויים'));
    },
  },
  errorBox,
  emailField,
  passField,
  el('p', { class: 'hint' }, 'בגרסת ההדגמה הסיסמה לא נבדקת. אין להזין סיסמה אמיתית.'),
  el('button', { class: 'btn btn-primary', type: 'submit' }, 'התחברות'));

  const users = el('div', { class: 'section' },
    el('p', { class: 'small muted' }, 'משתמשי הדגמה:'),
    el('div', { class: 'demo-users' },
      el('button', { class: 'btn btn-outline', type: 'button', onClick: fill('new@demo.test') }, 'משתמש חדש'),
      el('button', { class: 'btn btn-outline', type: 'button', onClick: fill('veteran@demo.test') }, 'משתמש ותיק')));

  const main = el('main', { id: 'main', tabindex: '-1' },
    el('div', { class: 'login-title' }, el('h1', {}, 'ברוכים הבאים'), el('p', {}, 'לתכנית הכושר והתזונה שלך')),
    form,
    users,
    safetyNote());

  app.replaceChildren(
    demoStrip(),
    el('img', { class: 'login-hero', src: 'images/login.jpg', alt: 'ציוד כושר וקערת סלט על שולחן' }),
    main,
  );
}

if (hasSession()) goHome();
else render();
