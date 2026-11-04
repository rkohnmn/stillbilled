import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays, addMonths, daysInMonth, diffDays, formatDate, fromDay, isLeap, isValidISO, makeISO, toDay, todayISO,
} from '../../js/core/dates.js';

test('leap years follow the Gregorian rule', () => {
  assert.equal(isLeap(2024), true);
  assert.equal(isLeap(2026), false);
  assert.equal(isLeap(1900), false);
  assert.equal(isLeap(2000), true);
  assert.equal(daysInMonth(2024, 2), 29);
  assert.equal(daysInMonth(2026, 2), 28);
});

test('isValidISO rejects impossible dates and bad shapes', () => {
  assert.equal(isValidISO('2026-02-28'), true);
  assert.equal(isValidISO('2024-02-29'), true);
  assert.equal(isValidISO('2026-02-29'), false);
  assert.equal(isValidISO('2026-13-01'), false);
  assert.equal(isValidISO('2026-00-10'), false);
  assert.equal(isValidISO('2026-1-5'), false);
  assert.equal(isValidISO('26-01-05'), false);
  assert.equal(isValidISO(''), false);
  assert.equal(isValidISO(null), false);
  assert.equal(isValidISO(20260105), false);
});

test('toDay and fromDay round-trip every day across 60 years', () => {
  assert.equal(toDay('1970-01-01'), 0);
  assert.equal(toDay('1970-01-02'), 1);
  assert.equal(toDay('1969-12-31'), -1);
  const start = toDay('1990-01-01');
  const end = toDay('2050-12-31');
  let previous = null;
  for (let z = start; z <= end; z++) {
    const iso = fromDay(z);
    assert.equal(toDay(iso), z);
    assert.ok(isValidISO(iso), iso);
    if (previous) assert.ok(iso > previous, `${iso} should come after ${previous}`);
    previous = iso;
  }
});

test('toDay throws on an invalid date', () => {
  assert.throws(() => toDay('2026-02-30'), RangeError);
});

test('diffDays and addDays', () => {
  assert.equal(diffDays('2026-01-01', '2026-01-31'), 30);
  assert.equal(diffDays('2026-01-31', '2026-01-01'), -30);
  assert.equal(diffDays('2024-02-28', '2024-03-01'), 2);
  assert.equal(diffDays('2026-02-28', '2026-03-01'), 1);
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addDays('2024-03-01', -1), '2024-02-29');
  assert.equal(addDays('2026-10-26', 0), '2026-10-26');
});

test('days are counted across the US daylight-saving change without shifting', () => {
  assert.equal(diffDays('2026-03-07', '2026-03-09'), 2);
  assert.equal(diffDays('2026-11-01', '2026-11-02'), 1);
  assert.equal(addDays('2026-03-08', 1), '2026-03-09');
});

test('addMonths clamps to the end of a shorter month', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2024-01-31', 1), '2024-02-29');
  assert.equal(addMonths('2026-03-31', 1), '2026-04-30');
  assert.equal(addMonths('2026-12-15', 1), '2027-01-15');
  assert.equal(addMonths('2026-01-15', 12), '2027-01-15');
  assert.equal(addMonths('2026-01-15', -1), '2025-12-15');
  assert.equal(addMonths('2026-01-15', -13), '2024-12-15');
  assert.equal(addMonths('2024-02-29', 12), '2025-02-28');
  assert.equal(addMonths('2026-05-05', 0), '2026-05-05');
});

test('makeISO pads', () => {
  assert.equal(makeISO(2026, 3, 5), '2026-03-05');
});

test('formatDate formats the calendar day it was given, whatever the viewer time zone', () => {
  assert.equal(formatDate('2026-01-01', 'en-US'), 'Jan 1, 2026');
  assert.equal(formatDate('2026-12-31', 'en-US'), 'Dec 31, 2026');
  assert.equal(formatDate('2026-07-04', 'en-US', { month: 'long', day: 'numeric' }), 'July 4');
  assert.equal(formatDate('garbage', 'en-US'), 'garbage');
  assert.equal(formatDate(undefined, 'en-US'), '');
});

test('todayISO uses the local calendar date of the given clock', () => {
  assert.equal(todayISO(new Date(2026, 9, 26, 23, 59)), '2026-10-26');
  assert.equal(todayISO(new Date(2026, 0, 1, 0, 0)), '2026-01-01');
});
