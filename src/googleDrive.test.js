import { describe, it, expect } from 'vitest';
import { mergeValue } from './googleDrive.js';

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
