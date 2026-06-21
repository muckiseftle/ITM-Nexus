import { describe, expect, it } from 'vitest';
import { computeBackoff, defaultBackoff } from './backoff';

describe('computeBackoff', () => {
  it('wächst exponentiell ohne Jitter (jitter=0 → halbe Kappung)', () => {
    // raw = base * factor^(attempt-1); scale bei jitter=0 ist 0.5
    expect(computeBackoff(1, defaultBackoff, 0)).toBe(500); // 1000 * 0.5
    expect(computeBackoff(2, defaultBackoff, 0)).toBe(1000); // 2000 * 0.5
    expect(computeBackoff(3, defaultBackoff, 0)).toBe(2000); // 4000 * 0.5
  });

  it('liefert bei jitter=1 den vollen (gekappten) Wert', () => {
    expect(computeBackoff(1, defaultBackoff, 1)).toBe(1000);
    expect(computeBackoff(2, defaultBackoff, 1)).toBe(2000);
  });

  it('kappt bei maxMs', () => {
    const policy = { baseMs: 1000, factor: 2, maxMs: 3000, maxAttempts: 10 };
    expect(computeBackoff(10, policy, 1)).toBe(3000);
  });

  it('klemmt den Jitter auf [0,1]', () => {
    expect(computeBackoff(1, defaultBackoff, -5)).toBe(500);
    expect(computeBackoff(1, defaultBackoff, 5)).toBe(1000);
  });
});
