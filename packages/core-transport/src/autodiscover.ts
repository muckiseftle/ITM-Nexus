/**
 * Autodiscover-*Planung* (rein, testbar): erzeugt die geordnete Liste der zu probierenden
 * Endpunkte für Exchange On-Premises sowie EWS-Direkt-Fallbacks. Der eigentliche
 * Netzabruf/XML-Parse passiert im nativen Connector — er konsumiert diesen Plan, damit die
 * Reihenfolge an *einer* getesteten Stelle definiert ist (Single Source of Truth).
 *
 * Reihenfolge nach dem Autodiscover-Ablauf (POX) für Exchange:
 *  1. POST https://<domain>/autodiscover/autodiscover.xml
 *  2. POST https://autodiscover.<domain>/autodiscover/autodiscover.xml
 *  3. GET  http://autodiscover.<domain>/autodiscover/autodiscover.xml  (erwartet 301/302 → https)
 *  4. DNS-SRV _autodiscover._tcp.<domain>  (iterativ; siehe Hinweis unten)
 */

import type { DiscoverySource } from './autodiscover-select';

export interface AutodiscoverProbe {
  readonly url: string;
  readonly source: DiscoverySource;
  readonly method: 'POST' | 'GET';
  /** Kleiner = zuerst probieren. */
  readonly priority: number;
}

/** Extrahiert die Domäne aus einer E-Mail-Adresse (kleingeschrieben). */
export function domainFromEmail(email: string): string | undefined {
  const at = email.lastIndexOf('@');
  if (at <= 0 || at >= email.length - 1) return undefined;
  const domain = email
    .slice(at + 1)
    .trim()
    .toLowerCase();
  return domain.length > 0 ? domain : undefined;
}

/**
 * Geordnete Autodiscover-Kandidaten für eine Domäne. SRV (Schritt 4) erfordert eine
 * DNS-Abfrage und wird hier bewusst NICHT als URL erzeugt — der native Connector kann sie
 * iterativ ergänzen; die HTTP-Schritte 1–3 decken die übergroße Mehrheit der On-Prem-Setups ab.
 */
export function buildAutodiscoverProbes(domain: string): readonly AutodiscoverProbe[] {
  const d = domain.trim().toLowerCase();
  return [
    {
      url: `https://${d}/autodiscover/autodiscover.xml`,
      source: 'https-root',
      method: 'POST',
      priority: 1,
    },
    {
      url: `https://autodiscover.${d}/autodiscover/autodiscover.xml`,
      source: 'autodiscover-subdomain',
      method: 'POST',
      priority: 2,
    },
    {
      url: `http://autodiscover.${d}/autodiscover/autodiscover.xml`,
      source: 'http-redirect',
      method: 'GET',
      priority: 3,
    },
  ];
}

/**
 * EWS-Direkt-Fallbacks, falls Autodiscover (Schritte 1–4) keinen Endpunkt liefert. Viele
 * On-Prem-Server sind unter dem Standardpfad erreichbar, auch wenn Autodiscover fehlt/zu ist.
 */
export function buildEwsFallbackUrls(domain: string): readonly string[] {
  const d = domain.trim().toLowerCase();
  return [
    `https://${d}/EWS/Exchange.asmx`,
    `https://autodiscover.${d}/EWS/Exchange.asmx`,
    `https://mail.${d}/EWS/Exchange.asmx`,
  ];
}

/**
 * Normalisiert eine vom Nutzer eingegebene Server-/EWS-URL (manueller Modus).
 *
 * Bewusst OHNE die `URL`-Web-API: In React Native/Hermes ist deren Implementierung
 * unvollständig (z. B. liefert `pathname` nicht zuverlässig), wodurch gültige Eingaben wie
 * `mail.firma.de` fälschlich als ungültig abgelehnt würden. Reine String-Verarbeitung
 * verhält sich auf Gerät und in Node identisch.
 */
export function normalizeEwsUrl(input: string): string | undefined {
  let value = input.trim();
  if (value.length === 0) return undefined;
  if (/\s/.test(value)) return undefined;

  // Schema ergänzen bzw. auf https erzwingen — EWS ist HTTPS-only; ein manuell getipptes
  // http:// würde sonst den Basic-Auth-Header im Klartext übertragen (Security).
  value = value.replace(/^http:\/\//i, 'https://');
  if (!/^https?:\/\//i.test(value)) {
    value = `https://${value}`;
  }

  const m = /^(https?:\/\/)([^/?#]+)([/?#].*)?$/i.exec(value);
  if (m === null) return undefined;
  const scheme = (m[1] ?? '').toLowerCase();
  const host = m[2] ?? '';
  // Host muss wie ein Server aussehen (mind. ein Punkt, Doppelpunkt für Port, oder localhost).
  if (host.length === 0 || !(host.includes('.') || host.includes(':') || host === 'localhost')) {
    return undefined;
  }

  let rest = m[3] ?? '';
  // Bloßer Host (ohne Pfad) → Standard-EWS-Pfad anhängen.
  if (rest === '' || rest === '/') {
    rest = '/EWS/Exchange.asmx';
  }
  return `${scheme}${host}${rest}`;
}
