// Temporary M1 test page. M2 deletes it together with check.html.
import { callAsk } from '../api.js';
import {
  currentSession, isConfigured, signIn, signOut,
} from '../auth.js';
import { errorMessage } from '../messages.js';

const $ = (id) => document.getElementById(id);

function showMessage(kind, text) {
  const card = document.createElement('div');
  card.className = `state-card state-${kind}`;
  const body = document.createElement('p');
  body.textContent = text;
  card.append(body);
  $('message').replaceChildren(card);
}

function showSignedIn(session) {
  $('login-form').hidden = Boolean(session);
  $('signed-in').hidden = !session;
  $('who').textContent = session ? `החשבון המחובר: ${session.user.email}` : '';
  $('result').replaceChildren();
}

function resultLine(text) {
  const li = document.createElement('li');
  li.textContent = text;
  return li;
}

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('message').replaceChildren();
  if (!isConfigured()) {
    showMessage('error', 'החיבור ל-Supabase עדיין לא הוגדר.');
    return;
  }
  const ok = await signIn($('email').value.trim(), $('password').value);
  $('password').value = '';
  if (!ok) {
    showMessage('error', 'פרטי הכניסה שגויים');
    return;
  }
  showSignedIn(await currentSession());
});

$('check-btn').addEventListener('click', async () => {
  $('message').replaceChildren();
  const res = await callAsk('skeleton_check');
  if (!res.ok) {
    showMessage('error', errorMessage(res.error.code));
    return;
  }
  const d = res.data;
  const own = [...d.daily_logs, ...d.weekly_cycles].every((row) => row.user_id === d.user_id);
  showMessage('success', 'הפונקציה ענתה בהצלחה');
  $('result').replaceChildren(
    resultLine(`שם בפרופיל: ${d.profile?.name ?? 'אין פרופיל'}`),
    resultLine(`שורות עדכון יומי: ${d.daily_logs.length}`),
    resultLine(`מחזורים: ${d.weekly_cycles.length}`),
    resultLine(`כל השורות שייכות לחשבון הזה: ${own ? 'כן' : 'לא'}`),
    resultLine(`פריטים במאגר המזון: ${d.foods_count}`),
  );
});

$('logout-btn').addEventListener('click', async () => {
  await signOut();
  $('message').replaceChildren();
  showSignedIn(null);
});

if (isConfigured()) showSignedIn(await currentSession());
