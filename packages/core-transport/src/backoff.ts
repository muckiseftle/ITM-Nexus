/**
 * Exponentielles Backoff für die wiederholbare Ausführung von Outbox-Operationen.
 * Die Zeitbasis ist absichtlich konfigurierbar und der Jitter wird injiziert, damit die
 * Funktion vollständig deterministisch und testbar bleibt.
 */

export interface BackoffPolicy {
  readonly baseMs: number;
  readonly factor: number;
  readonly maxMs: number;
  readonly maxAttempts: number;
}

export const defaultBackoff: BackoffPolicy = {
  baseMs: 1_000,
  factor: 2,
  maxMs: 5 * 60_000,
  maxAttempts: 8,
};

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * Berechnet die Wartezeit (ms) vor dem nächsten Versuch.
 * Verwendet „Half-to-Full"-Jitter: das Ergebnis liegt in `[capped*0.5, capped]`.
 *
 * @param attempt 1-basiert (erster Fehlversuch = 1).
 * @param policy Backoff-Parameter.
 * @param jitter Deterministischer Faktor in `[0,1]` (z. B. aus einem injizierten PRNG).
 */
export function computeBackoff(
  attempt: number,
  policy: BackoffPolicy = defaultBackoff,
  jitter = 0,
): number {
  const exponent = Math.max(0, attempt - 1);
  const raw = policy.baseMs * policy.factor ** exponent;
  const capped = Math.min(raw, policy.maxMs);
  const scale = 0.5 + 0.5 * clamp01(jitter);
  return Math.round(capped * scale);
}
