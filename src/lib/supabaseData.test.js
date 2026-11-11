import { describe, it, expect } from 'vitest';
import { diffCollection } from './supabaseData.js';

const ids = (arr) => arr.map((r) => r.id).sort();

describe('diffCollection', () => {
  it('upserts new and changed rows, leaves unchanged ones', () => {
    const prev = [{ id: 'a', v: 1 }, { id: 'b', v: 1 }];
    const next = [{ id: 'a', v: 1 }, { id: 'b', v: 2 }, { id: 'c', v: 1 }];
    const { upserts, deleteIds } = diffCollection(prev, next);
    expect(ids(upserts)).toEqual(['b', 'c']); // b changed, c new; a untouched
    expect(deleteIds).toEqual([]);
  });

  it('deletes rows removed since last sync', () => {
    const prev = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const next = [{ id: 'a' }];
    const { upserts, deleteIds } = diffCollection(prev, next);
    expect(upserts).toEqual([]);
    expect(deleteIds.sort()).toEqual(['b', 'c']);
  });

  it('handles a deep field change', () => {
    const prev = [{ id: 'a', tags: ['x'] }];
    const next = [{ id: 'a', tags: ['x', 'y'] }];
    expect(diffCollection(prev, next).upserts).toEqual([{ id: 'a', tags: ['x', 'y'] }]);
  });

  it('is empty when nothing changed', () => {
    const rows = [{ id: 'a', v: 1 }, { id: 'b', v: 2 }];
    const { upserts, deleteIds } = diffCollection(rows, rows);
    expect(upserts).toEqual([]);
    expect(deleteIds).toEqual([]);
  });

  it('tolerates empty / missing sides', () => {
    expect(diffCollection(undefined, [{ id: 'a' }]).upserts).toEqual([{ id: 'a' }]);
    expect(diffCollection([{ id: 'a' }], undefined).deleteIds).toEqual(['a']);
    expect(diffCollection(undefined, undefined)).toEqual({ upserts: [], deleteIds: [] });
  });

  it('ignores id-less records', () => {
    const { upserts, deleteIds } = diffCollection([], [{ id: 'a' }, { noId: true }]);
    expect(ids(upserts)).toEqual(['a']);
    expect(deleteIds).toEqual([]);
  });
});
