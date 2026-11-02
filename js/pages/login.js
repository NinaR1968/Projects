import { callAsk } from '../api.js';
import { currentSession, signIn, signOut } from '../auth.js';
import { icon } from '../icons.js';
import { errorMessage } from '../messages.js';
import {
  el, safetyNote, setFieldError, stateCard, textField,
} from '../ui.js';

const errorBox = el('div', { role: 'alert' });

// A user with a profile starts at the daily update, a new user at the wizard.
async function goHome() {
  const res = await callAsk('get_profile');
  if (res.ok) {
    location.replace(res.data ? 'daily.html' : 'profile.html');
    return true;
  }
  if (res.error.code === 'unauthorized') await signOut();
  errorBox.replaceChildren(stateCard('error', errorMessage(res.error.code)));
  return false;
}

function render() {
  const app = document.getElementById('app');
  const state = { email: '', password: '' };

  const emailField = textField({
    label: 'אימייל', type: 'email', iconName: 'mail', attrs: { autocomplete: 'username' }, onInput: (v) => { state.email = v; },
  });
  const passField = textField({
    label: 'סיסמה', type: 'password', iconName: 'lock', attrs: { autocomplete: 'current-password' }, onInput: (v) => { state.password = v; },
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

  const submit = el('button', { class: 'btn btn-primary', type: 'submit' }, 'התחברות');

  const form = el('form', {
    class: 'stack',
    novalidate: true,
    onSubmit: async (e) => {
      e.preventDefault();
      if (submit.disabled) return;
      errorBox.replaceChildren();
      setFieldError(emailField, state.email.trim() ? '' : 'יש למלא שדה זה');
      setFieldError(passField, state.password ? '' : 'יש למלא שדה זה');
      if (!state.email.trim() || !state.password) {
        form.querySelector('.has-error input')?.focus();
        return;
      }
      submit.disabled = true;
      const result = await signIn(state.email.trim(), state.password);
      if (result === 'ok' && await goHome()) return;
      submit.disabled = false;
      // The message never says which of the two was wrong.
      if (result === 'invalid') errorBox.replaceChildren(stateCard('error', 'פרטי הכניסה שגויים'));
      else if (result === 'error') errorBox.replaceChildren(stateCard('error', errorMessage('server_error')));
    },
  },
  errorBox,
  emailField,
  passField,
  submit);

  const main = el('main', { id: 'main', tabindex: '-1' },
    el('div', { class: 'login-title' }, el('h1', {}, 'ברוכים הבאים'), el('p', {}, 'לתכנית הכושר והתזונה שלך')),
    form,
    safetyNote());

  app.replaceChildren(
    el('img', { class: 'login-hero', src: 'images/login.jpg', alt: 'ציוד כושר וקערת סלט על שולחן' }),
    main,
  );
}

render();
if (await currentSession()) await goHome();
