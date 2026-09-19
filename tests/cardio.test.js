import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Z5_LADDER, Z5_MAX_STEP, z5Session, z5TotalMinutes, progressZ5, z2Session,
  deloadSaturdaySession, maxHRFor, hrRange, SESSION_CAP_MIN,
} from '../src/engine/cardio.js';

test('every rung of the ladder fits inside the 45 minute budget', () => {
  for (const rung of Z5_LADDER) {
    const total = z5TotalMinutes(rung.step);
    assert.ok(total <= SESSION_CAP_MIN, `step ${rung.step} is ${total} min`);
  }
});

test('the ladder matches the published totals', () => {
  assert.deepEqual(Z5_LADDER.map((r) => z5TotalMinutes(r.step)), [36, 42, 43, 40, 43]);
  assert.deepEqual(
    Z5_LADDER.map((r) => [r.intervals, r.workMin, r.recoveryMin]),
    [[4, 3, 3], [5, 3, 3], [6, 3, 2], [4, 4, 3], [5, 4, 2]],
  );
});

test('a session has no recovery jog after the final interval', () => {
  const s = z5Session(0);
  assert.equal(s.phases.filter((p) => p.kind === 'work').length, 4);
  assert.equal(s.phases.filter((p) => p.kind === 'recovery').length, 3);
  assert.equal(s.phases[0].kind, 'warmup');
  assert.equal(s.phases.at(-1).kind, 'cooldown');
  assert.equal(s.phases.reduce((sum, p) => sum + p.minutes, 0), 36);
});

test('one step every two complete weeks', () => {
  let state = { z5Step: 0, z5WeeksAtStep: 0 };
  state = progressZ5(state, 4);
  assert.deepEqual([state.z5Step, state.z5WeeksAtStep], [0, 1], 'first complete week banks a week');
  state = progressZ5(state, 4);
  assert.deepEqual([state.z5Step, state.z5WeeksAtStep], [1, 0], 'second complete week steps up');
  assert.equal(state.changed, true);
});

test('missing intervals holds the step and restarts the two week clock', () => {
  const state = progressZ5({ z5Step: 1, z5WeeksAtStep: 1 }, 4); // step 1 prescribes 5
  assert.deepEqual([state.z5Step, state.z5WeeksAtStep], [1, 0]);
  assert.equal(state.held, true);
});

test('step 4 is the cap', () => {
  let state = { z5Step: Z5_MAX_STEP, z5WeeksAtStep: 1 };
  state = progressZ5(state, 5);
  assert.equal(state.z5Step, Z5_MAX_STEP);
  assert.equal(z5Session(Z5_MAX_STEP).atCap, true);
  assert.equal(z5Session(99).step, Z5_MAX_STEP, 'out of range steps clamp');
});

test('zone 2 is 40 minutes, and Sunday can be a walk', () => {
  assert.equal(z2Session({}).duration, 40);
  assert.equal(z2Session({ sundayWalk: true, isSunday: true }).walk, true);
  assert.equal(z2Session({ sundayWalk: true, isSunday: false }).walk, false, 'Wednesday is always a run');
});

test('deload Saturday is a 30 minute zone 2 run', () => {
  const s = deloadSaturdaySession();
  assert.equal(s.kind, 'z2');
  assert.equal(s.duration, 30);
});

test('heart rate falls back to 220 minus age, then to effort only', () => {
  assert.equal(maxHRFor({ maxHR: 190 }), 190);
  assert.equal(maxHRFor({ age: 40 }), 180);
  assert.equal(maxHRFor({ maxHR: 190, age: 40 }), 190, 'a measured max wins');
  assert.equal(maxHRFor({}), null);
  assert.equal(hrRange('z2', {}), null);
  assert.deepEqual(hrRange('z2', { age: 40 }), { low: 108, high: 126, max: 180 });
  assert.deepEqual(hrRange('z5', { age: 40 }), { low: 162, high: 180, max: 180 });
});
