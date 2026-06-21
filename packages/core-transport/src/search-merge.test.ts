import { toMessageId } from '@nexus/domain';
import { describe, expect, it } from 'vitest';
import type { SearchHit } from './search-merge';
import { mergeSearchResults } from './search-merge';

const hit = (id: string, rank: number, source: SearchHit['source']): SearchHit => ({
  messageId: toMessageId(id),
  rank,
  source,
});

describe('mergeSearchResults', () => {
  it('sortiert nach Rang absteigend', () => {
    const merged = mergeSearchResults(
      [hit('a', 1, 'local'), hit('b', 3, 'local')],
      [hit('c', 2, 'server')],
    );
    expect(merged.map((h) => h.messageId)).toEqual(['b', 'c', 'a']);
  });

  it('dedupliziert und markiert beidseitige Treffer als both', () => {
    const merged = mergeSearchResults([hit('a', 1, 'local')], [hit('a', 5, 'server')]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.source).toBe('both');
    expect(merged[0]?.rank).toBe(5); // höherer Rang gewinnt
  });

  it('behält die Quelle, wenn nur eine Seite trifft', () => {
    const merged = mergeSearchResults([hit('a', 1, 'local')], []);
    expect(merged[0]?.source).toBe('local');
  });

  it('bevorzugt bei Ranggleichstand lokal-zuerst (stabil)', () => {
    const merged = mergeSearchResults([hit('a', 2, 'local')], [hit('b', 2, 'server')]);
    expect(merged.map((h) => h.messageId)).toEqual(['a', 'b']);
  });
});
