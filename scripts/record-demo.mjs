// Records a self-running tutorial video for a new user, with a large blue cursor and step captions.
// It runs on the prototype (prototype/, ADR-2): data stays in the browser, no database and no Gemini.
// A new browser profile is used every time, so the "new user" always starts from the beginning.
// Needs a static server in the project root: npx serve -l 3000
// Run: node scripts/record-demo.mjs [http://localhost:3000/prototype]
// Output: demo-video/demo.webm
import { mkdirSync, renameSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const BASE = (process.argv[2] ?? 'http://localhost:3000/prototype').replace(/\/$/, '');
const OUT_DIR = fileURLToPath(new URL('../demo-video/', import.meta.url));
const SIZE = { width: 1280, height: 720 };

// ---- Overlay injected into every page: blue cursor, click ripple, step card and title card ----
const overlay = () => {
  const ARROW = `<svg width="54" height="70" viewBox="0 0 27 35" xmlns="http://www.w3.org/2000/svg">
    <path d="M2 2 L2 28 L8.5 22 L13 32.5 L17.5 30.5 L13 20.5 L22 20.5 Z" fill="#1D6FE8" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>`;
  const css = `
    #demo-cursor { position: fixed; left: 0; top: 0; z-index: 2147483647; pointer-events: none;
      filter: drop-shadow(0 3px 5px rgba(0,0,0,.35)); transition-property: transform; transition-timing-function: cubic-bezier(.45,0,.25,1); }
    #demo-cursor svg { display: block; margin: -3px 0 0 -3px; transition: transform .12s; transform-origin: 3px 3px; }
    #demo-cursor.press svg { transform: scale(.82); }
    .demo-ripple { position: fixed; z-index: 2147483646; pointer-events: none; width: 20px; height: 20px; margin: -10px 0 0 -10px;
      border-radius: 50%; border: 4px solid #1D6FE8; background: rgba(29,111,232,.18); animation: demo-ripple .6s ease-out forwards; }
    @keyframes demo-ripple { to { transform: scale(3.4); opacity: 0; } }
    #demo-step { position: fixed; z-index: 2147483645; pointer-events: none; top: 50%; right: 24px; width: 300px;
      transform: translateY(-50%); direction: rtl; font-family: Heebo, sans-serif; background: #fff; border-radius: 18px;
      border-right: 8px solid #1D6FE8; box-shadow: 0 10px 30px rgba(0,0,0,.14); padding: 22px 24px; transition: opacity .4s; }
    #demo-step .num { color: #1D6FE8; font-weight: 700; font-size: 18px; margin-bottom: 6px; }
    #demo-step .title { color: #1f2a26; font-weight: 700; font-size: 27px; line-height: 1.25; }
    #demo-step .text { color: #4a5550; font-size: 18px; line-height: 1.45; margin-top: 10px; }
    #demo-brand { position: fixed; z-index: 2147483645; pointer-events: none; top: 28px; left: 32px; direction: rtl;
      font-family: Heebo, sans-serif; color: #47705f; font-weight: 700; font-size: 20px; }
    #demo-brand span { display: block; color: #7a857f; font-weight: 400; font-size: 15px; }
    #demo-title { position: fixed; inset: 0; z-index: 2147483646; display: flex; flex-direction: column; align-items: center;
      justify-content: center; gap: 14px; direction: rtl; font-family: Heebo, sans-serif; background: #47705f; color: #fff;
      transition: opacity .7s; text-align: center; }
    #demo-title h1 { margin: 0; font-size: 54px; font-weight: 700; }
    #demo-title p { margin: 0; font-size: 26px; opacity: .9; }
    #demo-title.hide { opacity: 0; }
    @media (max-width: 1100px) { #demo-step, #demo-brand { display: none; } }
    /* Prototype-only parts are hidden, so the video looks like the real app. */
    .demo-strip, .section:has(.demo-users), form > p.hint { display: none !important; }
  `;
  const store = {
    get: (k, d) => { try { return JSON.parse(sessionStorage.getItem(k)) ?? d; } catch { return d; } },
    set: (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* not needed */ } },
  };
  const install = () => {
    if (document.getElementById('demo-cursor')) return;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.append(style);
    const cursor = document.createElement('div');
    cursor.id = 'demo-cursor';
    cursor.innerHTML = ARROW;
    const pos = store.get('demoPos', { x: 640, y: 420 });
    cursor.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
    const brand = document.createElement('div');
    brand.id = 'demo-brand';
    brand.innerHTML = 'כושר ותזונה<span>סרטון הדגמה</span>';
    document.body.append(cursor, brand);
    const step = store.get('demoStep', null);
    if (step) window.demoStep(step.num, step.title, step.text, true);
    if (store.get('demoTitle', null)) window.demoTitle(...store.get('demoTitle'), true);
  };
  window.demoMove = (x, y, ms) => {
    const c = document.getElementById('demo-cursor');
    c.style.transitionDuration = `${ms}ms`;
    c.style.transform = `translate(${x}px, ${y}px)`;
    store.set('demoPos', { x, y });
  };
  window.demoClick = () => {
    const c = document.getElementById('demo-cursor');
    const { x, y } = store.get('demoPos', { x: 0, y: 0 });
    c.classList.add('press');
    setTimeout(() => c.classList.remove('press'), 180);
    const r = document.createElement('div');
    r.className = 'demo-ripple';
    r.style.left = `${x}px`;
    r.style.top = `${y}px`;
    document.body.append(r);
    setTimeout(() => r.remove(), 700);
  };
  window.demoStep = (num, title, text, instant) => {
    let box = document.getElementById('demo-step');
    if (!box) {
      box = document.createElement('div');
      box.id = 'demo-step';
      document.body.append(box);
    }
    box.innerHTML = `<div class="num">${num}</div><div class="title">${title}</div>${text ? `<div class="text">${text}</div>` : ''}`;
    if (!instant) {
      box.style.opacity = '0';
      requestAnimationFrame(() => requestAnimationFrame(() => { box.style.opacity = '1'; }));
    }
    store.set('demoStep', { num, title, text });
  };
  window.demoTitle = (title, sub, instant) => {
    document.getElementById('demo-title')?.remove();
    const t = document.createElement('div');
    t.id = 'demo-title';
    t.innerHTML = `<h1>${title}</h1><p>${sub}</p>`;
    if (!instant) t.classList.add('hide');
    document.body.append(t);
    if (!instant) requestAnimationFrame(() => requestAnimationFrame(() => t.classList.remove('hide')));
    store.set('demoTitle', [title, sub]);
  };
  window.demoHideTitle = () => {
    const t = document.getElementById('demo-title');
    if (t) t.classList.add('hide');
    setTimeout(() => t?.remove(), 800);
    store.set('demoTitle', null);
  };
  if (document.body) install();
  else document.addEventListener('DOMContentLoaded', install);
};

const browser = await chromium.launch({ channel: 'chrome', args: ['--force-device-scale-factor=1'] });
rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });
const context = await browser.newContext({ viewport: SIZE, recordVideo: { dir: OUT_DIR, size: SIZE } });
await context.addInitScript(overlay);
const page = await context.newPage();
const video = page.video();
const shotOnFail = async (e) => { await page.screenshot({ path: `${OUT_DIR}fail.png` }); console.log('URL', page.url()); throw e; };

const wait = (ms) => page.waitForTimeout(ms);
const loaded = () => page.waitForFunction(
  () => document.querySelector('main') && !document.body.innerText.includes('בטעינה'),
  null,
  { timeout: 60000 },
);
const step = (num, title, text = '') => page.evaluate(([a, b, c]) => window.demoStep(a, b, c), [num, title, text]);

// Scrolls smoothly so the element is comfortably on screen, above the bottom nav.
async function bringIntoView(loc) {
  const box = await loc.boundingBox();
  if (box && box.y > 80 && box.y + box.height < SIZE.height - 90) return;
  await loc.evaluate((e) => e.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  await wait(900);
}

async function moveTo(loc, ms = 750) {
  await bringIntoView(loc);
  const box = await loc.boundingBox();
  const x = Math.round(box.x + box.width / 2);
  const y = Math.round(box.y + box.height / 2);
  await page.evaluate(([a, b, c]) => window.demoMove(a, b, c), [x, y, ms]);
  await page.mouse.move(x, y);
  await wait(ms + 150);
}

async function click(loc, pause = 700) {
  await moveTo(loc);
  await page.evaluate(() => window.demoClick());
  await wait(150);
  await loc.click();
  await wait(pause);
}

async function type(loc, text) {
  await click(loc, 250);
  await loc.pressSequentially(text, { delay: 90 });
  await wait(450);
}

// A native dropdown list is not captured in the video, so the cursor clicks it and the value is set directly.
async function choose(loc, label) {
  await moveTo(loc);
  await page.evaluate(() => window.demoClick());
  await wait(300);
  await loc.selectOption({ label });
  await wait(700);
}

async function scrollBy(px) {
  await page.evaluate((n) => window.scrollBy({ top: n, behavior: 'smooth' }), px);
  await wait(1300);
}

const nav = (name) => page.locator('.bottom-nav').getByRole('link', { name });
const next = () => click(page.getByRole('button', { name: 'המשך', exact: true }), 1200);

// 0. Title card
await page.goto(`${BASE}/`);
await page.getByLabel('אימייל').waitFor();
await page.evaluate(() => window.demoTitle('כושר ותזונה: התאמה פרסונלית', 'מדריך למשתמש חדש: איך מתחילים', true));
await wait(3500);
await page.evaluate(() => window.demoHideTitle());
await wait(900);

// 1. Login
await step('שלב 1', 'כניסה לאפליקציה', 'מזינים אימייל וסיסמה ולוחצים על "התחברות".');
await wait(1500);
await type(page.getByLabel('אימייל'), 'new@demo.test');
await type(page.getByLabel('סיסמה', { exact: true }), 'demo1234');
await click(page.getByRole('button', { name: 'התחברות' }), 0);
await page.waitForURL(/profile/).catch(shotOnFail);
await loaded();
await wait(600);

// 2. Wizard, step 1
await step('שלב 2', 'פרטים אישיים', 'בכניסה הראשונה ממלאים פרופיל בארבעה שלבים קצרים. מתחילים בפרטים האישיים.');
await wait(2500);
await type(page.getByLabel('שם'), 'נועה');
await click(page.getByText('אישה', { exact: true }), 500);
await type(page.getByLabel('תאריך לידה'), '14/03/1992');
await type(page.getByLabel('גובה (ס"מ)'), '165');
await type(page.getByLabel('משקל נוכחי (ק"ג)'), '68');
await next();

// 3. Wizard, step 2
await step('שלב 3', 'מדידות', 'בוחרים מבנה גוף ומזינים היקפים. האיור מראה איפה מודדים.');
await wait(2000);
await choose(page.getByLabel('מבנה גוף'), 'בינוני (מזומורף)');
await type(page.getByLabel('היקף מותן (ס"מ)'), '78');
await type(page.getByLabel('היקף יד (ס"מ)'), '28');
await type(page.getByLabel('היקף רגל (ס"מ)'), '55');
await moveTo(page.locator('svg.silhouette'));
await wait(1200);
await next();

// 4. Wizard, step 3
await step('שלב 4', 'העדפות ומטרות', 'בוחרים העדפות תזונה, רמת כושר, כמה אימונים בשבוע ומה המטרה.');
await wait(2000);
await click(page.locator('label.check-row', { hasText: 'צמחוני' }), 500);
await choose(page.getByLabel('רמת כושר נוכחית'), 'בינונית');
await choose(page.getByLabel('כמה אימונים בשבוע'), '3');
await choose(page.getByLabel('מטרה עיקרית'), 'ירידה במשקל');
await next();

// 5. Wizard, review and plan
await step('שלב 5', 'סקירה ויצירת תכנית', 'בודקים שהכול נכון. אפשר לחזור ולתקן בלחיצה על "עריכה".');
await wait(2500);
await scrollBy(300);
await scrollBy(300);
await step('שלב 5', 'סקירה ויצירת תכנית', 'לוחצים על "שמירה ויצירת תכנית", וה-AI בונה תפריט ותכנית אימונים אישיים.');
await click(page.getByRole('button', { name: 'שמירה ויצירת תכנית' }), 0);
await page.waitForURL(/nutrition/, { timeout: 60000 }).catch(shotOnFail);
await loaded();

// 6. Nutrition plan
await step('שלב 6', 'תכנית תזונה', 'התפריט היומי שלך: קלוריות וחלבון לפי היעד, וחמש ארוחות.');
await wait(3000);
await click(page.getByRole('button', { name: /ארוחת בוקר/ }), 2000);
await scrollBy(300);
await wait(800);

// 7. Training plan
await click(nav('תכנית אימונים'), 0);
await loaded();
await step('שלב 7', 'תכנית אימונים', 'תכנית שבועית לפי רמת הכושר. לוחצים על קטגוריה כדי לראות את התרגילים.');
await wait(2500);
await click(page.locator('button.exp-head').nth(1), 2200);
await scrollBy(250);
await wait(800);

// 8. Daily update
await click(nav('עדכון יומי'), 0);
await loaded();
await step('שלב 8', 'עדכון יומי', 'כל יום מסמנים מה בוצע: אימון, ארוחות ומשקל.');
await wait(2500);
await click(page.getByText('בוצע מלא', { exact: true }), 600);
for (const meal of ['ארוחת בוקר', 'ארוחת ביניים 1', 'ארוחת צהריים']) {
  await click(page.locator('label.meal-row', { hasText: meal }), 400);
}
await step('שלב 8', 'הוספת מזון', 'אכלת משהו מחוץ לתפריט? מחפשים אותו במאגר המזון ומוסיפים.');
await click(page.getByRole('button', { name: 'הוספת מזון או שתייה' }));
await type(page.getByLabel('חיפוש במאגר'), 'בננה');
await click(page.getByRole('button', { name: /^בננה, טריה/ }));
await type(page.getByLabel('כמות בגרמים'), '120');
await click(page.getByRole('button', { name: 'הוספה', exact: true }), 1000);
await step('שלב 8', 'משקל ושמירה', 'מזינים את המשקל של היום ושומרים.');
await type(page.getByLabel('משקל (ק"ג)'), '67.8');
await click(page.getByRole('button', { name: 'שמירת עדכון יומי' }), 0);
await page.locator('[aria-labelledby="bal"]').waitFor({ timeout: 30000 });
await step('שלב 8', 'מאזן קלוריות', 'אחרי השמירה רואים מיד את מאזן הקלוריות של היום.');
await wait(500);
await moveTo(page.locator('[aria-labelledby="bal"] .balance-value').first());
await wait(3000);

// 9. Reports
await click(nav('דוחות'), 0);
await loaded();
await step('שלב 9', 'התקדמות ודוחות', 'בסוף כל שבוע מקבלים כאן דוח ותכנית מעודכנת. אפשר גם לכתוב פידבק.');
await wait(3500);
await scrollBy(300);
await wait(2000);

// 10. User menu
await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
await wait(900);
await step('שלב 10', 'הנתונים שלי', 'רוצה לעדכן את הפרופיל? פותחים את תפריט המשתמש ובוחרים "הנתונים שלי".');
await click(page.getByRole('button', { name: 'תפריט משתמש' }), 1000);
await moveTo(page.getByRole('link', { name: 'הנתונים שלי' }));
await wait(2500);

// 11. End card
await page.evaluate(() => window.demoTitle('זהו, אפשר להתחיל!', 'פרופיל, תפריט, אימונים ומעקב שבועי, במקום אחד'));
await wait(4000);

await context.close();
const recorded = await video.path();
renameSync(recorded, `${OUT_DIR}demo.webm`);
await browser.close();
console.log('Saved demo-video/demo.webm');
