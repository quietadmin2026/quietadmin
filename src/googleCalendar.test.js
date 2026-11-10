import { describe, it, expect } from 'vitest';
import {
  clientInitials,
  eventTitle,
  addMinutes,
  buildEventBody,
  desiredCalendarEvents,
  diffCalendar,
} from './googleCalendar.js';

describe('clientInitials', () => {
  it('builds dotted initials from each name part', () => {
    expect(clientInitials('Asha Rao')).toBe('A.R.');
    expect(clientInitials('Priya')).toBe('P.');
    expect(clientInitials('  maria  del  carmen ')).toBe('M.D.C.');
  });
  it('falls back for an empty name', () => {
    expect(clientInitials('')).toBe('Client');
    expect(clientInitials(null)).toBe('Client');
  });
});

describe('eventTitle — confidentiality modes', () => {
  const client = { name: 'Asha Rao' };
  const group = { name: 'Grief Support' };
  it('individual sessions honor the naming mode', () => {
    expect(eventTitle({ kind: 'individual', client, namingMode: 'name' })).toBe('Asha Rao');
    expect(eventTitle({ kind: 'individual', client, namingMode: 'initials' })).toBe('A.R.');
    expect(eventTitle({ kind: 'individual', client, namingMode: 'generic' })).toBe('Session');
  });
  it('groups never expose a member; only full-name mode shows the group name', () => {
    expect(eventTitle({ kind: 'group', group, namingMode: 'name' })).toBe('Grief Support');
    expect(eventTitle({ kind: 'group', group, namingMode: 'initials' })).toBe('Group session');
    expect(eventTitle({ kind: 'group', group, namingMode: 'generic' })).toBe('Group session');
  });
  it('defaults to initials for an unknown mode', () => {
    expect(eventTitle({ kind: 'individual', client, namingMode: 'nonsense' })).toBe('A.R.');
  });
});

describe('addMinutes', () => {
  it('adds within the same day', () => {
    expect(addMinutes('2026-11-10', '10:00', 60)).toEqual({ date: '2026-11-10', time: '11:00' });
    expect(addMinutes('2026-11-10', '09:15', 50)).toEqual({ date: '2026-11-10', time: '10:05' });
  });
  it('rolls over midnight', () => {
    expect(addMinutes('2026-11-10', '23:30', 60)).toEqual({ date: '2026-11-11', time: '00:30' });
  });
});

describe('buildEventBody', () => {
  it('produces a private timed event with start/end and a session marker', () => {
    const body = buildEventBody({
      summary: 'A.R.', date: '2026-11-12', time: '10:00', durationMin: 60, timeZone: 'Asia/Kolkata', sessionId: 's1',
    });
    expect(body.summary).toBe('A.R.');
    expect(body.visibility).toBe('private');
    expect(body.start).toEqual({ dateTime: '2026-11-12T10:00:00', timeZone: 'Asia/Kolkata' });
    expect(body.end).toEqual({ dateTime: '2026-11-12T11:00:00', timeZone: 'Asia/Kolkata' });
    expect(body.extendedProperties.private.quietadminSessionId).toBe('s1');
  });
  it('defaults a missing/zero duration to 60 minutes', () => {
    const body = buildEventBody({ summary: 'x', date: '2026-11-12', time: '10:00', durationMin: 0, timeZone: 'UTC', sessionId: 's1' });
    expect(body.end.dateTime).toBe('2026-11-12T11:00:00');
  });
});

describe('desiredCalendarEvents', () => {
  const clients = [{ id: 'c1', name: 'Asha Rao' }];
  const groups = [{ id: 'g1', name: 'Grief Support' }];
  const sessions = [
    { id: 's1', clientId: 'c1', date: '2026-11-12', time: '10:00', duration: 60, status: 'Scheduled' }, // future -> event
    { id: 's2', clientId: 'c1', date: '2026-11-13', time: '11:00', duration: 60, status: 'Cancelled' }, // excluded
    { id: 's3', clientId: 'c1', date: '2026-11-14', time: '12:00', duration: 60, status: 'Rescheduled' }, // excluded
    { id: 's4', clientId: 'c1', date: '2026-11-01', time: '09:00', duration: 60, status: 'Present' }, // past -> keep only
  ];
  const groupSessions = [{ id: 'gs1', groupId: 'g1', date: '2026-11-15', time: '17:00', duration: 90 }];

  it('creates events only for occupying sessions on/after the floor', () => {
    const { events, keep } = desiredCalendarEvents(
      { sessions, groupSessions, clients, groups },
      { namingMode: 'initials', floorIso: '2026-11-10', timeZone: 'UTC' },
    );
    expect([...events.keys()].sort()).toEqual(['gs1', 's1']);
    expect(events.get('s1').body.summary).toBe('A.R.');
    expect(events.get('gs1').body.summary).toBe('Group session');
  });

  it('keeps aged-but-live sessions (so past events are not deleted) and drops cancelled/rescheduled', () => {
    const { keep } = desiredCalendarEvents(
      { sessions, groupSessions, clients, groups },
      { floorIso: '2026-11-10' },
    );
    expect(keep.has('s1')).toBe(true);
    expect(keep.has('s4')).toBe(true); // past but still occupies -> protected from deletion
    expect(keep.has('s2')).toBe(false); // cancelled
    expect(keep.has('s3')).toBe(false); // rescheduled
  });
});

describe('diffCalendar', () => {
  const desired = new Map([['s1', { body: { summary: 'A.R.' }, sig: 'SIG1' }]]);

  it('creates an event not yet in the index', () => {
    const work = diffCalendar(desired, new Set(['s1']), {});
    expect(work.creates.map((c) => c.id)).toEqual(['s1']);
    expect(work.updates).toEqual([]);
    expect(work.deletes).toEqual([]);
  });

  it('updates when the signature changed', () => {
    const work = diffCalendar(desired, new Set(['s1']), { s1: { eventId: 'e1', sig: 'OLD' } });
    expect(work.creates).toEqual([]);
    expect(work.updates.map((u) => [u.id, u.eventId])).toEqual([['s1', 'e1']]);
  });

  it('no-ops when the signature matches', () => {
    const work = diffCalendar(desired, new Set(['s1']), { s1: { eventId: 'e1', sig: 'SIG1' } });
    expect(work.creates).toEqual([]);
    expect(work.updates).toEqual([]);
    expect(work.deletes).toEqual([]);
  });

  it('deletes an indexed event whose session is no longer kept', () => {
    const index = { s1: { eventId: 'e1', sig: 'SIG1' }, s9: { eventId: 'e9', sig: 'z' } };
    const work = diffCalendar(desired, new Set(['s1']), index);
    expect(work.deletes.map((d) => [d.id, d.eventId])).toEqual([['s9', 'e9']]);
    expect(work.creates).toEqual([]);
    expect(work.updates).toEqual([]);
  });
});
