import { describe, it, expect } from 'vitest';
import {
  recurringDates,
  ordinalWeekdayOfMonth,
  frequencyLabel,
  clientSlots,
  reconcileRecurringSessions,
  reconcileGroupSessions,
  reconcileSubscriptionCharges,
  allocateLedger,
  computeMonthlyStatement,
  sessionsClash,
  findConflicts,
  firstClash,
  renderTemplate,
} from './App.jsx';

// ---------------------------------------------------------------------------
// recurringDates — the occurrence generator underpinning every schedule.
// ---------------------------------------------------------------------------
describe('recurringDates', () => {
  it('lists weekly occurrences within the window (Oct 2026 Mondays)', () => {
    expect(recurringDates('2020-01-06', 'Monday', 'Weekly', '2026-10-01', '2026-10-31')).toEqual([
      '2026-10-05',
      '2026-10-12',
      '2026-10-19',
      '2026-10-26',
    ]);
  });

  it('honours every-2-weeks parity anchored to the given date', () => {
    expect(recurringDates('2026-10-05', 'Monday', 'Every 2 weeks', '2026-10-01', '2026-11-30')).toEqual([
      '2026-10-05',
      '2026-10-19',
      '2026-11-02',
      '2026-11-16',
      '2026-11-30',
    ]);
  });

  it('repeats the same weekday-of-month for Monthly (1st Monday)', () => {
    expect(recurringDates('2026-10-05', 'Monday', 'Monthly', '2026-10-01', '2026-12-31')).toEqual([
      '2026-10-05',
      '2026-11-02',
      '2026-12-07',
    ]);
  });

  it('skips months that lack the nth weekday (5th Saturday)', () => {
    // 2026-10-31 is the 5th Saturday of October; Nov and Dec have only four.
    expect(ordinalWeekdayOfMonth('2026-10-31')).toBe(5);
    expect(recurringDates('2026-10-31', 'Saturday', 'Monthly', '2026-10-01', '2026-12-31')).toEqual([
      '2026-10-31',
    ]);
  });

  it('returns [] for an unknown weekday or an inverted window', () => {
    expect(recurringDates('2026-10-05', 'Funday', 'Weekly', '2026-10-01', '2026-10-31')).toEqual([]);
    expect(recurringDates('2026-10-05', 'Monday', 'Weekly', '2026-10-31', '2026-10-01')).toEqual([]);
  });
});

describe('frequencyLabel & clientSlots', () => {
  it('treats blank/Weekly as Weekly and passes others through', () => {
    expect(frequencyLabel('')).toBe('Weekly');
    expect(frequencyLabel('Weekly')).toBe('Weekly');
    expect(frequencyLabel('Monthly')).toBe('Monthly');
  });

  it('collects one slot per configured day/time pair', () => {
    expect(clientSlots({ day: 'Monday', time: '10:00' })).toEqual([{ day: 'Monday', time: '10:00' }]);
    expect(clientSlots({ day: 'Monday', time: '10:00', day2: 'Thursday', time2: '15:00' })).toHaveLength(2);
    expect(clientSlots({})).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// reconcileSubscriptionCharges — the monthly auto-biller (Bug 1 lived here).
// ---------------------------------------------------------------------------
describe('reconcileSubscriptionCharges', () => {
  const sub = { id: 'c1', status: 'Active', billingModel: 'Subscription', monthlyFee: 4000, joiningDate: '2026-06-01' };

  it('does nothing when auto-create is off (same reference)', () => {
    const charges = [];
    expect(reconcileSubscriptionCharges([sub], charges, false, '2026-09-15')).toBe(charges);
  });

  it('backfills a charge for every unbilled month up to today', () => {
    const result = reconcileSubscriptionCharges([sub], [], true, '2026-09-15');
    expect(result.map((c) => c.id)).toEqual([
      'sub-c1-2026-06',
      'sub-c1-2026-07',
      'sub-c1-2026-08',
      'sub-c1-2026-09',
    ]);
    expect(result.every((c) => c.amount === 4000 && c.reason === 'Subscription Fee')).toBe(true);
  });

  it('is idempotent — a second pass returns the same reference', () => {
    const first = reconcileSubscriptionCharges([sub], [], true, '2026-09-15');
    expect(reconcileSubscriptionCharges([sub], first, true, '2026-09-15')).toBe(first);
  });

  it('never bills before the accounting-start floor', () => {
    const result = reconcileSubscriptionCharges([sub], [], true, '2026-09-15', '2026-08');
    expect(result.map((c) => c.id)).toEqual(['sub-c1-2026-08', 'sub-c1-2026-09']);
  });

  it('does not recreate a deleted (tombstoned) charge', () => {
    const result = reconcileSubscriptionCharges([sub], [], true, '2026-09-15', '', ['sub-c1-2026-09']);
    expect(result.map((c) => c.id)).toEqual(['sub-c1-2026-06', 'sub-c1-2026-07', 'sub-c1-2026-08']);
  });

  it('ignores per-session and inactive clients', () => {
    const perSession = { id: 'c2', status: 'Active', billingModel: 'Per Session', sessionRate: 2500, joiningDate: '2026-06-01' };
    const archived = { ...sub, id: 'c3', status: 'Archived' };
    expect(reconcileSubscriptionCharges([perSession, archived], [], true, '2026-09-15')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// reconcileRecurringSessions — materialize/prune 1:1 sessions.
// ---------------------------------------------------------------------------
describe('reconcileRecurringSessions', () => {
  const recurring = {
    id: 'c1', status: 'Active', scheduleType: 'Recurring',
    day: 'Monday', time: '10:00', duration: 60, frequency: 'Weekly', joiningDate: '2026-09-01',
  };

  it('generates only future auto sessions for active recurring clients', () => {
    const result = reconcileRecurringSessions([recurring], [], '2026-10-01');
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((s) => s.auto && s.date >= '2026-10-01' && s.clientId === 'c1')).toBe(true);
    expect(result[0].id).toBe('auto-c1-2026-10-05-10:00');
  });

  it('is idempotent — a second pass returns the same reference', () => {
    const first = reconcileRecurringSessions([recurring], [], '2026-10-01');
    expect(reconcileRecurringSessions([recurring], first, '2026-10-01')).toBe(first);
  });

  it('prunes future unmarked auto sessions once a client is made Manual, keeping history', () => {
    const manual = { ...recurring, scheduleType: 'Manual' };
    const sessions = [
      { id: 'auto-c1-2026-10-19-10:00', clientId: 'c1', date: '2026-10-19', time: '10:00', status: 'Scheduled', auto: true },
      { id: 'auto-c1-2026-10-05-10:00', clientId: 'c1', date: '2026-10-05', time: '10:00', status: 'Scheduled', auto: true }, // past
      { id: 'm1', clientId: 'c1', date: '2026-10-22', time: '10:00', status: 'Present', auto: true }, // marked
      { id: 'man1', clientId: 'c1', date: '2026-10-20', time: '10:00', status: 'Scheduled', auto: false }, // non-auto
    ];
    const ids = reconcileRecurringSessions([manual], sessions, '2026-10-15').map((s) => s.id);
    expect(ids).not.toContain('auto-c1-2026-10-19-10:00'); // future unmarked auto -> pruned
    expect(ids).toEqual(expect.arrayContaining(['auto-c1-2026-10-05-10:00', 'm1', 'man1']));
  });

  it('does not generate before the accounting-start floor', () => {
    const result = reconcileRecurringSessions([recurring], [], '2026-09-25', '2026-10-01');
    expect(result.every((s) => s.date >= '2026-10-01')).toBe(true);
  });
});

describe('reconcileGroupSessions', () => {
  it('materializes meetings for active recurring groups only', () => {
    const group = { id: 'g1', status: 'Active', recurring: true, day: 'Monday', time: '18:00', startDate: '2026-09-01' };
    const result = reconcileGroupSessions([group], [], '2026-10-01');
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].id).toBe('gauto-g1-2026-10-05-18:00');
    const inactive = { ...group, status: 'Archived' };
    expect(reconcileGroupSessions([inactive], [], '2026-10-01')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// allocateLedger — FIFO settlement of payments against charges.
// ---------------------------------------------------------------------------
describe('allocateLedger', () => {
  const charges = [
    { id: 'a', date: '2026-01-01', amount: 100 },
    { id: 'b', date: '2026-02-01', amount: 100 },
  ];

  it('settles oldest charges first with an untargeted payment', () => {
    const { byCharge, credit } = allocateLedger(charges, [{ id: 'p', date: '2026-03-01', amount: 150 }]);
    expect(byCharge.a).toMatchObject({ paid: 100, balance: 0, status: 'Paid' });
    expect(byCharge.b).toMatchObject({ paid: 50, balance: 50, status: 'Partially Paid' });
    expect(credit).toBe(0);
  });

  it('returns overpayment as credit', () => {
    const { credit } = allocateLedger(charges, [{ id: 'p', date: '2026-03-01', amount: 250 }]);
    expect(credit).toBe(50);
  });

  it('applies a targeted payment to its own charge first', () => {
    const { byCharge } = allocateLedger(charges, [{ id: 'p', date: '2026-03-01', amount: 100, chargeId: 'b' }]);
    expect(byCharge.b.status).toBe('Paid');
    expect(byCharge.a.status).toBe('Pending');
  });

  it('spills a targeted payment overflow into the FIFO pool', () => {
    const { byCharge } = allocateLedger(charges, [{ id: 'p', date: '2026-03-01', amount: 150, chargeId: 'b' }]);
    expect(byCharge.b.status).toBe('Paid'); // 100 to b
    expect(byCharge.a).toMatchObject({ paid: 50, status: 'Partially Paid' }); // 50 overflow to oldest
  });
});

// ---------------------------------------------------------------------------
// computeMonthlyStatement — per-client monthly summary.
// ---------------------------------------------------------------------------
describe('computeMonthlyStatement', () => {
  it('summarizes attendance, fees and brought-forward balance for the month', () => {
    const client = { id: 'c1', name: 'Meera', reminder: 'Email' };
    const sessions = [
      { clientId: 'c1', date: '2026-10-03', status: 'Present' },
      { clientId: 'c1', date: '2026-10-10', status: 'Present' },
      { clientId: 'c1', date: '2026-10-17', status: 'Cancelled' },
    ];
    const charges = [
      { clientId: 'c1', date: '2026-09-01', amount: 2500, reason: 'Session Fee' }, // prior month
      { clientId: 'c1', date: '2026-10-03', amount: 2500, reason: 'Session Fee' },
      { clientId: 'c1', date: '2026-10-10', amount: 2500, reason: 'Session Fee' },
      { clientId: 'c1', date: '2026-10-05', amount: 1000, reason: 'Late Cancellation' },
    ];
    const payments = [
      { clientId: 'c1', date: '2026-09-15', amount: 1000 }, // prior month
      { clientId: 'c1', date: '2026-10-12', amount: 2500 },
    ];
    const s = computeMonthlyStatement(client, '2026-10', sessions, charges, payments);
    expect(s).toMatchObject({
      attended: 2,
      cancellations: 1,
      sessionFees: 5000,
      lateFees: 1000,
      otherCharges: 0,
      paymentsTotal: 2500,
      broughtForward: 1500, // 2500 prior charge - 1000 prior payment
    });
  });
});

// ---------------------------------------------------------------------------
// Scheduling conflict detection.
// ---------------------------------------------------------------------------
describe('conflict detection', () => {
  it('flags overlapping same-day sessions and clears non-overlaps', () => {
    expect(sessionsClash(
      { date: '2026-10-01', time: '10:00', duration: 60 },
      { date: '2026-10-01', time: '10:30', duration: 60 },
    )).toBe(true);
    expect(sessionsClash(
      { date: '2026-10-01', time: '10:00', duration: 60 },
      { date: '2026-10-01', time: '11:00', duration: 60 },
    )).toBe(false);
    expect(sessionsClash(
      { date: '2026-10-01', time: '10:00', duration: 60 },
      { date: '2026-10-02', time: '10:00', duration: 60 },
    )).toBe(false);
  });

  it('returns the set of clashing ids and the first clash for a candidate', () => {
    const blocks = [
      { id: '1', date: 'd', time: '10:00', duration: 60 },
      { id: '2', date: 'd', time: '10:30', duration: 60 },
      { id: '3', date: 'd', time: '12:00', duration: 60 },
    ];
    expect(findConflicts(blocks)).toEqual(new Set(['1', '2']));
    expect(firstClash(blocks, { date: 'd', time: '12:15', duration: 60 }, '3')).toBeNull();
    expect(firstClash(blocks, { date: 'd', time: '10:15', duration: 60 }, null)?.id).toBe('1');
  });
});

// ---------------------------------------------------------------------------
// renderTemplate — reminder/statement placeholder substitution.
// ---------------------------------------------------------------------------
describe('renderTemplate', () => {
  it('substitutes placeholders and keeps static lines', () => {
    expect(renderTemplate('Hi {name}\nThank you', { name: 'Meera' })).toBe('Hi Meera\nThank you');
  });

  it('drops a line whose only placeholders are all empty', () => {
    const out = renderTemplate('Hi {name}\nPay via {pay}\nThanks', { name: 'Meera', pay: '' });
    expect(out).toBe('Hi Meera\nThanks');
  });

  it('keeps a line that still has a non-empty placeholder', () => {
    expect(renderTemplate('Owed {amt} — {name}', { amt: '', name: 'Meera' })).toBe('Owed  — Meera');
  });
});
