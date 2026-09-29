import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dayOffReason, trackingWindow, type ScheduleInput } from './tracking-window';

const office: ScheduleInput = {
  startTime: '09:00',
  endTime: '18:00',
  settings: { weekPattern: '5/2' },
};
const at = (iso: string) => new Date(`${iso}+05:00`);
const day = (ymd: string, extra: object = {}) => ({ ymd, ...extra });

describe('tracking window', () => {
  // 2026-09-29 is a Tuesday, 2026-10-03 a Saturday, 2026-10-04 a Sunday.
  it('is active only between schedule start and end on a workday', () => {
    const y = day('2026-09-28');
    assert.equal(trackingWindow(at('2026-09-29T08:59:00'), office, day('2026-09-29'), y).reason, 'before_start');
    assert.equal(trackingWindow(at('2026-09-29T09:00:00'), office, day('2026-09-29'), y).active, true);
    assert.equal(trackingWindow(at('2026-09-29T17:59:00'), office, day('2026-09-29'), y).active, true);
    assert.equal(trackingWindow(at('2026-09-29T18:00:00'), office, day('2026-09-29'), y).reason, 'after_end');
  });

  it('rejects weekends by week pattern, holidays and approved absences', () => {
    assert.equal(dayOffReason(office, day('2026-10-03')), 'day_off');
    assert.equal(dayOffReason({ ...office, settings: { weekPattern: '6/1' } }, day('2026-10-03')), null);
    assert.equal(dayOffReason(office, day('2026-09-29', { calendarDayType: 'holiday' })), 'holiday');
    assert.equal(dayOffReason(office, day('2026-10-03', { calendarDayType: 'workday' })), null);
    assert.equal(dayOffReason(office, day('2026-09-29', { onAbsence: true })), 'absence');
    const w = trackingWindow(at('2026-10-04T12:00:00'), office, day('2026-10-04'), day('2026-10-03'));
    assert.equal(w.active, false);
    assert.equal(w.reason, 'day_off');
  });

  it('lets the schedule year grid override the weekly pattern', () => {
    const s: ScheduleInput = { ...office, settings: { weekPattern: '5/2', yearGrid: { '2026-10-03': '8', '2026-09-29': 'В' } } };
    assert.equal(dayOffReason(s, day('2026-10-03')), null);
    assert.equal(dayOffReason(s, day('2026-09-29')), 'day_off');
  });

  it('widens the window by arrival-before / leave-after allowances', () => {
    const s: ScheduleInput = { ...office, settings: { weekPattern: '5/2', arrivalBeforeMinutes: 30, leaveAfterHours: 1 } };
    const y = day('2026-09-28');
    assert.equal(trackingWindow(at('2026-09-29T08:30:00'), s, day('2026-09-29'), y).active, true);
    assert.equal(trackingWindow(at('2026-09-29T18:59:00'), s, day('2026-09-29'), y).active, true);
    assert.equal(trackingWindow(at('2026-09-29T19:00:00'), s, day('2026-09-29'), y).active, false);
  });

  it('keeps an overnight shift active after midnight', () => {
    const night: ScheduleInput = { startTime: '20:00', endTime: '08:00', settings: { weekPattern: '6/1' } };
    const w = trackingWindow(at('2026-09-30T03:00:00'), night, day('2026-09-30'), day('2026-09-29'));
    assert.equal(w.active, true);
    assert.equal(trackingWindow(at('2026-09-30T09:00:00'), night, day('2026-09-30'), day('2026-09-29')).active, false);
  });
});
