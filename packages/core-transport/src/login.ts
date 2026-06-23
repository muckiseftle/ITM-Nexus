/**
 * Login-Namen für Exchange/NTLM robust parsen und formatieren (rein, testbar).
 *
 * Exchange On-Premises akzeptiert je nach Setup unterschiedliche Anmeldeformen:
 * - **Down-Level** (`DOMÄNE\Benutzer`) — klassischer NetBIOS-Domänenlogin, oft für NTLM.
 * - **UPN** (`benutzer@domäne.tld`) — User-Principal-Name, oft = E-Mail-Adresse.
 * - **Bar** (`benutzer`) — nur der Kontoname; Domäne implizit.
 *
 * Diese Logik klassifiziert die Eingabe und kann zwischen den Formen konvertieren, damit
 * der native Transport (NTLM-Credential bzw. preemptiver Basic-Header) korrekt befüllt wird.
 */

export type LoginForm = 'downlevel' | 'upn' | 'bare';

export interface ParsedLogin {
  /** Ursprüngliche (getrimmte) Eingabe. */
  readonly raw: string;
  /** Reiner Benutzername ohne Domänenanteil. */
  readonly user: string;
  /** Domänenanteil, falls aus der Eingabe ableitbar (NetBIOS-Domäne oder UPN-Suffix). */
  readonly domain?: string;
  readonly form: LoginForm;
}

/**
 * Klassifiziert einen Login-Namen. Reihenfolge der Erkennung: Down-Level (`\`) vor UPN (`@`),
 * da `DOMÄNE\benutzer@host` theoretisch vorkommen kann (Down-Level dominiert dann).
 */
export function parseLogin(input: string): ParsedLogin {
  const raw = input.trim();

  const backslash = raw.indexOf('\\');
  if (backslash > 0 && backslash < raw.length - 1) {
    const domain = raw.slice(0, backslash);
    const user = raw.slice(backslash + 1);
    return { raw, user, domain, form: 'downlevel' };
  }

  const at = raw.lastIndexOf('@');
  if (at > 0 && at < raw.length - 1) {
    const user = raw.slice(0, at);
    const domain = raw.slice(at + 1);
    return { raw, user, domain, form: 'upn' };
  }

  return { raw, user: raw, form: 'bare' };
}

/**
 * Liefert die Down-Level-Form (`DOMÄNE\Benutzer`), falls eine Domäne bekannt ist
 * (aus der Eingabe oder als Fallback übergeben). Sonst den reinen Benutzernamen.
 */
export function toDownLevel(login: ParsedLogin, fallbackDomain?: string): string {
  const domain = login.domain ?? fallbackDomain;
  if (login.form === 'upn') {
    // UPN-Suffix ist eine DNS-Domäne, keine NetBIOS-Domäne → nur mit explizitem Fallback.
    return fallbackDomain !== undefined ? `${fallbackDomain}\\${login.user}` : login.raw;
  }
  return domain !== undefined ? `${domain}\\${login.user}` : login.user;
}

/**
 * Liefert die UPN-Form (`benutzer@domäne`). Nutzt das Domänen-Suffix der E-Mail, wenn die
 * Eingabe selbst keine UPN-Domäne trägt.
 */
export function toUpn(login: ParsedLogin, emailDomain?: string): string {
  if (login.form === 'upn') return login.raw;
  const domain = emailDomain;
  return domain !== undefined ? `${login.user}@${domain}` : login.user;
}
