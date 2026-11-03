// Page frame: screen header with the user menu, and the bottom nav.
import { callAsk } from './api.js';
import { requireSession, signOut } from './auth.js';
import { icon } from './icons.js';
import {
  el, fatalCard, loadingIndicator, popover,
} from './ui.js';

const NAV_ITEMS = [
  { key: 'daily', href: 'daily.html', label: 'עדכון יומי', icon: 'home', fillable: true },
  { key: 'training', href: 'training.html', label: 'תכנית אימונים', icon: 'dumbbell' },
  { key: 'nutrition', href: 'nutrition.html', label: 'תכנית תזונה', icon: 'utensils' },
  { key: 'progress', href: 'progress.html', label: 'דוחות', icon: 'chart' },
];

// A page with unsaved changes sets a guard. Leaving through the frame asks it first.
let leaveGuard = null;
export function setLeaveGuard(guard) {
  leaveGuard = guard;
}

export function leave(go) {
  if (leaveGuard) leaveGuard(go);
  else go();
}

async function logOut() {
  await signOut();
  location.href = 'index.html';
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
    el('button', { class: 'menu-item', type: 'button', onClick: () => leave(logOut) }, 'יציאה'));
  popover(userBtn, menu);
  const back = onBack === null
    ? el('span')
    : el('button', {
      class: 'icon-btn',
      type: 'button',
      'aria-label': 'חזרה',
      onClick: onBack ?? (() => leave(() => {
        if (history.length > 1) history.back();
        else location.href = 'daily.html';
      })),
    }, icon('right'));
  return el('header', { class: 'screen-header' }, back, el('h1', {}, title), userBtn, menu);
}

// Builds the frame and returns { main, profile, showNav }. Redirects when not signed in or with no profile.
export async function initPage({
  title, active, requireProfile = true, onBack,
}) {
  if (!(await requireSession())) return null;
  const app = document.getElementById('app');
  app.replaceChildren(loadingIndicator());
  const res = await callAsk('get_profile');
  if (!res.ok && res.error.code === 'unauthorized') {
    await logOut();
    return null;
  }
  const profile = res.ok ? res.data : null;
  if (res.ok && requireProfile && !profile) {
    location.replace('profile.html');
    return null;
  }
  const main = el('main', { id: 'main', tabindex: '-1' });
  app.replaceChildren(screenHeader(title, onBack), main);

  // The nav is shown only to a user who already has a profile (DESIGN, bottom nav).
  let navShown = false;
  const showNav = () => {
    if (navShown) return;
    navShown = true;
    document.body.classList.add('has-nav');
    app.append(bottomNav(active));
  };
  if (profile) showNav();

  if (!res.ok) {
    main.append(fatalCard(res.error.code));
    return null;
  }
  return { main, profile, showNav };
}
