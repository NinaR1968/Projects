// get_report and save_feedback with a fake store (spec/plans/milestone-6.md, 5.1). No network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { getReport, nowIL, saveFeedback } from '../lib/report.js';

const ID = '11111111-2222-4333-8444-555555555555';
const NOW = '2026-11-03T09:00:00+02:00';

const cycle = (over = {}) => ({
  id: ID, cycle_start: '2026-10-25', cycle_end: '2026-10-31', training_plan: { workouts_per_week: 3 },
  report: null, feedback: null, ...over,
});

function fakeStore(row = cycle()) {
  const saved = [];
  return {
    saved,
    getCycle: async (_u, id) => (id === row.id ? row : null),
    logsBetween: async () => [{
      log_date: '2026-10-26', weight_kg: 80, meals: [{}], workout: { status: 'full', categories: ['legs'] }, calories_in: 2000, tdee: 2100,
    }],
    saveFeedback: async (_u, _id, feedback) => { saved.push(feedback); return { ...row, feedback }; },
  };
}

const deps = (store, today = '2026-11-03') => ({ store, today: () => today, now: () => NOW });

test('get_report: the saved report of a closed cycle', async () => {
  const report = { days_total: 7, summary_text: 'x' };
  const out = await getReport('u1', { cycle_id: ID }, deps(fakeStore(cycle({ report }))));
  assert.equal(out.report, report);
});

test('get_report: computed for an open cycle, not_found for another user\'s or a bad id', async () => {
  const out = await getReport('u1', { cycle_id: ID }, deps(fakeStore()));
  assert.equal(out.report.days_logged, 1);
  assert.deepEqual(out.report.workouts, { done: 1, planned: 3 });
  assert.equal(out.report.summary_text, undefined);
  for (const id of ['99999999-2222-4333-8444-555555555555', 'abc', null]) {
    await assert.rejects(getReport('u1', { cycle_id: id }, deps(fakeStore())), { code: 'not_found', status: 404 });
  }
});

test('save_feedback: 500 characters pass and are trimmed, 501 are too_long', async () => {
  const store = fakeStore();
  const text = 'א'.repeat(500);
  const row = await saveFeedback('u1', { cycle_id: ID, training: `  ${text}  `, menu: 'טוב' }, deps(store));
  assert.deepEqual(row.feedback, { training: text, menu: 'טוב', submitted_at: NOW });
  await assert.rejects(saveFeedback('u1', { cycle_id: ID, training: `${text}א` }, deps(store)),
    { code: 'invalid_fields', fields: { training: 'too_long' } });
  await assert.rejects(saveFeedback('u1', { cycle_id: ID, menu: 5 }, deps(store)), { code: 'invalid_fields', fields: { menu: 'invalid' } });
  assert.equal(store.saved.length, 1);
});

test('save_feedback: two empty fields save no feedback', async () => {
  const store = fakeStore();
  await saveFeedback('u1', { cycle_id: ID, training: ' ', menu: '' }, deps(store));
  assert.deepEqual(store.saved, [null]);
});

test('save_feedback: closed, not finished, not found, and closed in the meantime', async () => {
  await assert.rejects(saveFeedback('u1', { cycle_id: ID, training: 'x' }, deps(fakeStore(cycle({ report: {} })))), { code: 'cycle_closed' });
  await assert.rejects(saveFeedback('u1', { cycle_id: ID, training: 'x' }, deps(fakeStore(), '2026-10-31')), { code: 'cycle_not_finished' });
  await assert.rejects(saveFeedback('u1', { cycle_id: 'x', training: 'x' }, deps(fakeStore())), { code: 'not_found' });
  const racing = { ...fakeStore(), saveFeedback: async () => null };
  await assert.rejects(saveFeedback('u1', { cycle_id: ID, training: 'x' }, deps(racing)), { code: 'cycle_closed', status: 409 });
});

test('nowIL gives the Israel time with its offset', () => {
  assert.equal(nowIL(new Date('2026-11-03T07:12:05Z')), '2026-11-03T09:12:05+02:00');
  assert.equal(nowIL(new Date('2026-07-01T07:00:00Z')), '2026-07-01T10:00:00+03:00');
});
