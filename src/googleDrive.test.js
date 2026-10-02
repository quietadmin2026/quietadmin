import { describe, it, expect } from 'vitest';
import { mergeValue, mergeThreeWay } from './googleDrive.js';

const ids = (arr) => arr.map((r) => r.id).sort();

describe('mergeThreeWay — array records honor deletions', () => {
  it('keeps a locally deleted record deleted even though remote still has it', () => {
    // The reported bug: delete locally, stale remote still has it -> must NOT return.
    const base = [{ id: 'a' }, { id: 'b' }];
    const local = [{ id: 'a' }]; // b deleted here
    const remote = [{ id: 'a' }, { id: 'b' }]; // remote not yet updated
    expect(ids(mergeThreeWay('charges', base, local, remote))).toEqual(['a']);
  });

  it('honors a remote deletion of a record we did not touch', () => {
    const base = [{ id: 'a' }, { id: 'b' }];
    const local = [{ id: 'a' }, { id: 'b' }];
    const remote = [{ id: 'a' }]; // remote deleted b
    expect(ids(mergeThreeWay('charges', base, local, remote))).toEqual(['a']);
  });

  it('keeps records added on either side', () => {
    const base = [{ id: 'a' }];
    const local = [{ id: 'a' }, { id: 'b' }]; // added locally
    const remote = [{ id: 'a' }, { id: 'c' }]; // added remotely
    expect(ids(mergeThreeWay('clients', base, local, remote))).toEqual(['a', 'b', 'c']);
  });

  it('lets a local edit win and keeps a remote edit when we did not touch it', () => {
    const localEdit = mergeThreeWay('clients', [{ id: 'a', v: 1 }], [{ id: 'a', v: 2 }], [{ id: 'a', v: 1 }]);
    expect(localEdit).toEqual([{ id: 'a', v: 2 }]);
    const remoteEdit = mergeThreeWay('clients', [{ id: 'a', v: 1 }], [{ id: 'a', v: 1 }], [{ id: 'a', v: 2 }]);
    expect(remoteEdit).toEqual([{ id: 'a', v: 2 }]);
  });

  it('keeps a local edit even when remote deleted that record', () => {
    const out = mergeThreeWay('clients', [{ id: 'a', v: 1 }], [{ id: 'a', v: 2 }], []);
    expect(out).toEqual([{ id: 'a', v: 2 }]);
  });
});

describe('mergeThreeWay — settings', () => {
  it('keeps each device’s own changed keys', () => {
    const base = { currency: 'INR', language: 'en', therapistName: 'A' };
    const local = { currency: 'USD', language: 'en', therapistName: 'A' }; // changed currency here
    const remote = { currency: 'INR', language: 'es', therapistName: 'A' }; // changed language there
    expect(mergeThreeWay('settings', base, local, remote)).toEqual({
      currency: 'USD',
      language: 'es',
      therapistName: 'A',
    });
  });
});

describe('mergeValue — array records (union by id)', () => {
  it('keeps records added on either side', () => {
    const base = [{ id: 'a', v: 1 }, { id: 'b', v: 1 }];
    const overlay = [{ id: 'a', v: 1 }, { id: 'c', v: 1 }];
    const merged = mergeValue('clients', base, overlay);
    expect(merged.map((r) => r.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('lets overlay win when the same id exists on both sides', () => {
    const base = [{ id: 'a', name: 'old' }];
    const overlay = [{ id: 'a', name: 'new' }];
    expect(mergeValue('clients', base, overlay)).toEqual([{ id: 'a', name: 'new' }]);
  });

  it('is order-safe and dedupes shared ids to one record', () => {
    const base = [{ id: 'x', v: 'base' }, { id: 'y', v: 'base' }];
    const overlay = [{ id: 'y', v: 'overlay' }, { id: 'z', v: 'overlay' }];
    const merged = mergeValue('sessions', base, overlay);
    expect(merged).toHaveLength(3);
    expect(merged.find((r) => r.id === 'y').v).toBe('overlay');
  });

  it('falls back gracefully when a side is not an array', () => {
    expect(mergeValue('charges', undefined, [{ id: 'a' }])).toEqual([{ id: 'a' }]);
    expect(mergeValue('charges', [{ id: 'a' }], null)).toEqual([{ id: 'a' }]);
    expect(mergeValue('charges', undefined, undefined)).toEqual([]);
  });
});

describe('mergeValue — settings object', () => {
  it('shallow-merges with overlay winning per key', () => {
    const base = { currency: 'INR', language: 'en', therapistName: 'A' };
    const overlay = { currency: 'USD', language: 'es' };
    expect(mergeValue('settings', base, overlay)).toEqual({
      currency: 'USD',
      language: 'es',
      therapistName: 'A', // base-only key preserved
    });
  });

  it('tolerates a missing/invalid side', () => {
    expect(mergeValue('settings', undefined, { currency: 'USD' })).toEqual({ currency: 'USD' });
    expect(mergeValue('settings', { currency: 'INR' }, undefined)).toEqual({ currency: 'INR' });
  });
});
