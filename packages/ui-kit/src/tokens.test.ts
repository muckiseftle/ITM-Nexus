import { describe, expect, it } from 'vitest';
import { avatarPalette, brand, color, radius, space, typography } from './tokens';

describe('Design-Tokens', () => {
  it('definiert die Markenfarbe als gültigen Hex-Wert', () => {
    expect(color.brandPrimary).toMatch(/^#[0-9A-F]{6}$/i);
  });

  it('verwendet ein 4-pt-Raster für Abstände', () => {
    for (const value of Object.values(space)) {
      expect(value % 4).toBe(0);
    }
  });

  it('hat aufsteigende Radius-Stufen', () => {
    expect(radius.sm).toBeLessThan(radius.md);
    expect(radius.md).toBeLessThan(radius.lg);
  });

  it('definiert die erwartete Typo-Hierarchie', () => {
    expect(typography.largeTitle.size).toBeGreaterThan(typography.title.size);
    expect(typography.title.size).toBeGreaterThan(typography.body.size);
    expect(typography.body.size).toBeGreaterThan(typography.caption.size);
  });

  it('nutzt die Indigo-Leitfarbe (brand[600]) als Markenfarbe', () => {
    expect(brand[600]).toBe('#4F46E5');
    expect(color.brandPrimary).toBe(brand[600]);
  });

  it('definiert nur gültige Avatar-Hexfarben', () => {
    expect(avatarPalette.length).toBeGreaterThanOrEqual(8);
    for (const hex of avatarPalette) {
      expect(hex).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });
});
