import { describe, expect, it } from 'vitest';
import { brandId, toAccountId, toFolderId, toMessageId } from './ids';

describe('brandId', () => {
  it('gibt den Wert unverändert (gebrandet) zurück', () => {
    expect(toAccountId('acc-1')).toBe('acc-1');
    expect(toFolderId('inbox')).toBe('inbox');
    expect(toMessageId('msg-42')).toBe('msg-42');
  });

  it('wirft bei leerem Wert', () => {
    expect(() => toAccountId('')).toThrow(/darf nicht leer sein/);
    expect(() => toAccountId('   ')).toThrow(/darf nicht leer sein/);
  });

  it('verwendet die übergebene Art in der Fehlermeldung', () => {
    expect(() => brandId('', 'CustomKind')).toThrow(/CustomKind/);
  });
});
