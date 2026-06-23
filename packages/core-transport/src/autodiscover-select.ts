/**
 * Autodiscover-*Auswahllogik* (rein, testbar). Der eigentliche Netzwerkabruf und das
 * XML-Parsing der Autodiscover-Antworten passieren im nativen Connector; hier wird nur
 * aus den ermittelten Kandidaten der zu verwendende Endpunkt + das Auth-Verfahren gewählt
 * (inkl. Fallback-Reihenfolge).
 */

export type AuthScheme = 'basic' | 'ntlm' | 'oauth';
export type DiscoverySource =
  | 'https-root'
  | 'autodiscover-subdomain'
  | 'http-redirect'
  | 'srv'
  | 'manual';

export interface EndpointCandidate {
  readonly source: DiscoverySource;
  /** Kleiner = zuerst probieren (Fallback-Reihenfolge). */
  readonly priority: number;
  readonly ewsUrl?: string;
  readonly easUrl?: string;
  readonly authSchemes: readonly AuthScheme[];
  readonly reachable: boolean;
}

export interface SelectedEndpoints {
  readonly source: DiscoverySource;
  readonly auth: AuthScheme;
  readonly ewsUrl?: string;
  readonly easUrl?: string;
}

/** Bevorzugte Auth-Verfahren in absteigender Reihenfolge. */
const AUTH_PREFERENCE: readonly AuthScheme[] = ['oauth', 'ntlm', 'basic'];

function pickAuth(schemes: readonly AuthScheme[]): AuthScheme | undefined {
  return AUTH_PREFERENCE.find((pref) => schemes.includes(pref));
}

/**
 * Wählt den ersten erreichbaren Kandidaten (nach Priorität sortiert), der mindestens einen
 * Endpunkt und ein unterstütztes Auth-Verfahren bietet. Gibt `undefined` zurück, wenn kein
 * brauchbarer Kandidat existiert.
 */
export function selectEndpoints(
  candidates: readonly EndpointCandidate[],
): SelectedEndpoints | undefined {
  const usable = [...candidates]
    .filter((c) => c.reachable && (c.ewsUrl !== undefined || c.easUrl !== undefined))
    .sort((a, b) => a.priority - b.priority);

  for (const candidate of usable) {
    const auth = pickAuth(candidate.authSchemes);
    if (auth === undefined) continue;
    return {
      source: candidate.source,
      auth,
      ...(candidate.ewsUrl !== undefined ? { ewsUrl: candidate.ewsUrl } : {}),
      ...(candidate.easUrl !== undefined ? { easUrl: candidate.easUrl } : {}),
    };
  }
  return undefined;
}
