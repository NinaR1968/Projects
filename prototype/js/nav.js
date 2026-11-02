// Page frame: demo strip, screen header with the user menu, and the bottom nav.
import { icon } from './icons.js';
import {
  callAsk, getDemoFailure, hasSession, resetDemo, setDemoFailure, signOut,
} from './mock-api.js';
import { el, fatalCard, popover } from './ui.js';

const NAV_ITEMS = [
  { key: 'daily', href: 'daily.html', label: 'עדכון יומי', icon: 'home', fillable: true },
  { key: 'training', href: 'training.html', label: 'תכנית אימונים', icon: 'dumbbell' },
  { key: 'nutrition', href: 'nutrition.html', label: 'תכנית תזונה', icon: 'utensils' },
  { key: 'progress', href: 'progress.html', label: 'דוחות', icon: 'chart' },
];

export function demoStrip() {
  const toggle = el('button', { class: 'demo-toggle', type: 'button' }, 'כלי הדגמה');
  const failure = el('input', {
    type: 'checkbox',
    checked: getDemoFailure(),
    onChange: (e) => setDemoFailure(e.target.checked),
  });
  const panel = el('div', { class: 'popover demo-panel' },
    el('label', { class: 'check-row small' }, failure, 'הדמיית כשל ביצירת תכנית'),
    el('button', {
      class: 'btn btn-outline',
      type: 'button',
      onClick: () => {
        if (!window.confirm('כל נתוני ההדגמה יימחקו ויוחזרו למצב ההתחלתי. להמשיך?')) return;
        resetDemo();
        location.href = 'index.html';
      },
    }, 'איפוס נתוני ההדגמה'));
  popover(toggle, panel);
  return el('div', { class: 'demo-strip' }, el('span', { class: 'demo-label' }, 'גרסת הדגמה'), toggle, panel);
}

// A page with unsaved changes sets a guard. Leaving through the frame asks it first.
let leaveGuard = null;
export function setLeaveGuard(guard) {
  leaveGuard = guard;
}

export function leave(go) {
  if (leaveGuard) leaveGuard(go);
  else go();
}

// A link that goes through the guard, so the page can ask before it is left.
function guardedLink(props, ...children) {
  return el('a', {
    ...props,
    onClick: (e) => {
      if (!leaveGuard || e.ctrlKey || e.metaKey || e.shiftKey) return;
      e.preventDefault();
      leave(() => { location.href = props.href; });
    },
  }, ...children);
}

function bottomNav(active) {
  return el('nav', { class: 'bottom-nav', 'aria-label': 'ניווט ראשי' },
    el('ul', {}, NAV_ITEMS.map((item) => el('li', {},
      guardedLink({ href: item.href, 'aria-current': item.key === active ? 'page' : undefined },
        icon(item.icon, item.fillable ? 'fillable' : ''),
        item.label)))));
}

function screenHeader(title, onBack) {
  const userBtn = el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'תפריט משתמש' }, icon('user'));
  const menu = el('div', { class: 'popover user-menu' },
    guardedLink({ class: 'menu-item', href: 'profile.html' }, 'הנתונים שלי'),
    el('button', {
      class: 'menu-item',
      type: 'button',
      onClick: () => leave(() => {
        signOut();
        location.href = 'index.html';
      }),
    }, 'יציאה'));
  popover(userBtn, menu);
  const back = onBack === null
    ? el('span')
    : el('button', {
      class: 'icon-btn',
      type: 'button',
      'aria-label': 'חזרה',
      onClick: onBack ?? (() => leave(() => {
        if (history.length > 1) history.back();
        else location.href = 'nutrition.html';
      })),
    }, icon('right'));
  return el('header', { class: 'screen-header' }, back, el('h1', {}, title), userBtn, menu);
}

// Builds the frame and returns the main element and the profile. Redirects when not signed in or with no profile.
export async function initPage({
  title, active, requireProfile = true, onBack,
}) {
  if (!hasSession()) {
    location.replace('index.html');
    return null;
  }
  const app = document.getElementById('app');
  const res = await callAsk('get_profile');
  const profile = res.ok ? res.data : null;
  if (res.ok && requireProfile && !profile) {
    location.replace('profile.html');
    return null;
  }
  const main = el('main', { id: 'main', tabindex: '-1' });
  const showNav = Boolean(profile);
  document.body.classList.toggle('has-nav', showNav);
  app.replaceChildren(demoStrip(), screenHeader(title, onBack), main);
  if (showNav) app.append(bottomNav(active));
  if (!res.ok) {
    main.append(fatalCard(res.error.code));
    return null;
  }
  return { main, profile };
}
