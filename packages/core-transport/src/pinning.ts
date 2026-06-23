/**
 * Certificate-Pinning-*Entscheidungslogik* (rein, testbar, **fail-closed**).
 *
 * Das native Modul extrahiert aus dem Server-Zertifikat den SubjectPublicKeyInfo (SPKI),
 * bildet `base64(SHA-256(SPKI))` und übergibt die so gewonnenen Pins dieser Funktion. Hier
 * fällt die Entscheidung, ob die Verbindung erlaubt wird — abgekoppelt von Krypto/Netzwerk,
 * damit die Sicherheitsregel **eindeutig testbar** ist (ADR-005, Security-First).
 *
 * Regeln:
 * - Existiert für den Host **keine** Pin-Policy → `allow` (Pinning ist für diesen Host nicht
 *   aktiv; es gilt der System-Trust). So bleibt der Demo-/Standardbetrieb möglich.
 * - Existiert eine Policy → es muss **mindestens ein** präsentierter Pin auf die Liste passen,
 *   sonst `deny`. Leere/fehlende präsentierte Pins ⇒ `deny` (fail-closed).
 */

export interface HostPinPolicy {
  /** Host, für den die Pins gelten (z. B. `mail.contoso.com`). */
  readonly host: string;
  /** Erlaubte SPKI-Pins als `base64(SHA-256(SPKI))` (inkl. Backup-Pins empfohlen). */
  readonly pins: readonly string[];
  /** Gilt die Policy auch für Subdomains von `host`? Default: false. */
  readonly includeSubdomains?: boolean;
}

export interface PinningConfig {
  readonly policies: readonly HostPinPolicy[];
}

export type PinDecision = 'allow' | 'deny';

export interface PinEvaluation {
  readonly decision: PinDecision;
  readonly reason: 'no-policy' | 'match' | 'no-match' | 'no-pins-presented';
  /** Host der angewandten Policy (falls eine griff). */
  readonly matchedHost?: string;
}

function hostMatches(policy: HostPinPolicy, host: string): boolean {
  const h = host.toLowerCase();
  const p = policy.host.toLowerCase();
  if (h === p) return true;
  return policy.includeSubdomains === true && h.endsWith(`.${p}`);
}

/** Findet die spezifischste passende Policy (exakter Host vor Subdomain-Wildcard). */
export function findPolicy(config: PinningConfig, host: string): HostPinPolicy | undefined {
  const h = host.toLowerCase();
  const exact = config.policies.find((pol) => pol.host.toLowerCase() === h);
  if (exact !== undefined) return exact;
  return config.policies.find((pol) => hostMatches(pol, host));
}

/**
 * Entscheidet fail-closed, ob eine Verbindung zu `host` mit den präsentierten SPKI-Pins
 * erlaubt ist. Siehe Modul-Doku für die Regeln.
 */
export function evaluatePinning(
  host: string,
  presentedPins: readonly string[],
  config: PinningConfig,
): PinEvaluation {
  const policy = findPolicy(config, host);
  if (policy === undefined) {
    return { decision: 'allow', reason: 'no-policy' };
  }
  if (presentedPins.length === 0) {
    return { decision: 'deny', reason: 'no-pins-presented', matchedHost: policy.host };
  }
  const pinned = new Set(policy.pins);
  const matches = presentedPins.some((pin) => pinned.has(pin));
  return matches
    ? { decision: 'allow', reason: 'match', matchedHost: policy.host }
    : { decision: 'deny', reason: 'no-match', matchedHost: policy.host };
}

/** Ist für mindestens einen Host Pinning konfiguriert? (Steuert native Aktivierung.) */
export function isPinningEnabled(config: PinningConfig): boolean {
  return config.policies.some((p) => p.pins.length > 0);
}
