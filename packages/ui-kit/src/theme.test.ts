import { describe, expect, it } from 'vitest';
import { themeColors } from './theme';
import { color } from './tokens';

describe('themeColors', () => {
  it('liefert helle Flächen im Light-Schema', () => {
    const t = themeColors('light');
    expect(t.bgCanvas).toBe(color.bgCanvas);
    expect(t.textPrimary).toBe(color.textPrimary);
    expect(t.bgElevated).toBe(color.bgElevated);
  });

  it('liefert dunkle Flächen im Dark-Schema', () => {
    const t = themeColors('dark');
    expect(t.bgCanvas).toBe(color.bgCanvasDark);
    expect(t.textPrimary).toBe(color.textPrimaryDark);
    expect(t.bgElevated).toBe(color.bgElevatedDark);
    expect(t.textSecondary).toBe(color.textSecondaryDark);
  });

  it('hält die Markenfarben in beiden Schemata gleich', () => {
    expect(themeColors('light').brandPrimary).toBe(themeColors('dark').brandPrimary);
    expect(themeColors('dark').danger).toBe(color.danger);
  });
});
