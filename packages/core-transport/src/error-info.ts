/**
 * Übersetzt technische Transport-/Login-Fehler in nutzerfreundliche, handlungsleitende
 * Meldungen. Rein und testbar — funktioniert sowohl mit der {@link TransportError}-Taxonomie
 * als auch mit Fehlern, die über die native Bridge kommen (Objekt mit `code`/`message`).
 */

export type TransportErrorKind =
  | 'auth'
  | 'autodiscover'
  | 'network'
  | 'tls'
  | 'server'
  | 'database'
  | 'unknown';

export interface ErrorInfo {
  readonly kind: TransportErrorKind;
  /** Kurze, klare Überschrift. */
  readonly title: string;
  /** Verständliche Erklärung. */
  readonly detail: string;
  /** Optionaler, konkreter Lösungshinweis. */
  readonly hint?: string;
  /** Ursprüngliche technische Meldung (für Diagnose/„Details anzeigen"). */
  readonly technical: string;
}

function errorText(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (error !== null && typeof error === 'object') {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return '';
}

function errorCode(error: unknown): string {
  if (error !== null && typeof error === 'object') {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return '';
}

/** Klassifiziert einen beliebigen Fehler in eine nutzerfreundliche {@link ErrorInfo}. */
export function classifyError(error: unknown): ErrorInfo {
  const code = errorCode(error).toLowerCase();
  const technical = errorText(error) || 'Unbekannter Fehler';
  const text = technical.toLowerCase();

  const isAuth =
    code === 'auth' ||
    code.includes('auth') ||
    /\b401\b|unauthor|anmeld|kennwort|passwort|credential|forbidden|\b403\b/.test(text);
  const isAutodiscover = code.includes('autodiscover') || text.includes('autodiscover');
  const isTls =
    code.includes('tls') ||
    code.includes('cert') ||
    /zertifikat|certificate|\bssl\b|\btls\b|self.?signed|untrusted|trust/.test(text);
  const isNetwork =
    code === 'network' ||
    code.includes('unreachable') ||
    code.includes('network') ||
    /could not connect|connection|cannot connect|timed?\s?out|timeout|netzwerk|offline|nicht erreichbar|no address|hostname|kein netz|verbindung/.test(
      text,
    );
  const isServer = code.includes('server') || /\b50\d\b|server error|internal server/.test(text);
  const isDatabase =
    code.includes('db') || code.includes('database') || /sqlcipher|datenbank/.test(text);

  if (isAuth) {
    return {
      kind: 'auth',
      title: 'Anmeldung fehlgeschlagen',
      detail: 'Benutzername oder Passwort wurde vom Server nicht akzeptiert.',
      hint: 'Tipp: Benutzername als „DOMÄNE\\Benutzer" oder „benutzer@domäne" eingeben.',
      technical,
    };
  }
  if (isTls) {
    return {
      kind: 'tls',
      title: 'Zertifikatsproblem',
      detail: 'Dem Sicherheitszertifikat des Servers wird nicht vertraut.',
      hint: 'Ein firmeninternes Zertifikat muss auf dem iPhone installiert und vertraut sein.',
      technical,
    };
  }
  if (isAutodiscover) {
    return {
      kind: 'autodiscover',
      title: 'Server nicht gefunden',
      detail:
        'Dein Exchange-Server konnte über die E-Mail-Adresse nicht automatisch ermittelt werden.',
      hint: 'Prüfe die E-Mail-Adresse. Falls nötig, hinterlegt die IT die Serveradresse manuell.',
      technical,
    };
  }
  if (isNetwork) {
    return {
      kind: 'network',
      title: 'Server nicht erreichbar',
      detail: 'Es konnte keine Verbindung zum Exchange-Server aufgebaut werden.',
      hint: 'Bist du im Firmennetz oder per VPN verbunden? Prüfe auch deine Internetverbindung.',
      technical,
    };
  }
  if (isServer) {
    return {
      kind: 'server',
      title: 'Serverfehler',
      detail: 'Der Exchange-Server hat einen Fehler gemeldet.',
      hint: 'Bitte später erneut versuchen. Hält es an, die IT kontaktieren.',
      technical,
    };
  }
  if (isDatabase) {
    return {
      kind: 'database',
      title: 'Lokaler Speicher',
      detail: 'Die verschlüsselte lokale Datenbank konnte nicht geöffnet werden.',
      technical,
    };
  }
  return {
    kind: 'unknown',
    title: 'Etwas ist schiefgelaufen',
    detail: 'Es ist ein unerwarteter Fehler aufgetreten.',
    technical,
  };
}
