import type { SecureStore } from '@nexus/core-transport';
import type { MailMessage } from '@nexus/domain';
import { NexusNative } from '../native/NexusNative';

/**
 * Freigegebene Postfächer (EWS-Delegation). Sicherheitsmodell: Ein Postfach kann nur
 * hinzugefügt/geöffnet werden, wenn der angemeldete Nutzer **serverseitig** dazu berechtigt
 * ist. Die Prüfung erfolgt nativ über EWS `GetFolder` mit `<t:Mailbox>`-Targeting — fehlt die
 * Berechtigung, antwortet Exchange mit `ErrorAccessDenied`. Es gibt KEINEN clientseitigen Weg,
 * ein nicht freigegebenes Postfach zu sehen oder zu öffnen.
 */

export interface SharedMailbox {
  readonly email: string;
  readonly displayName: string;
}

export type SharedMailboxFailure = 'forbidden' | 'invalid' | 'error';

/** Typisierter Fehler, damit die UI „keine Berechtigung" klar von technischen Fehlern trennt. */
export class SharedMailboxError extends Error {
  constructor(
    readonly reason: SharedMailboxFailure,
    message: string,
  ) {
    super(message);
    this.name = 'SharedMailboxError';
  }
}

const storeKey = (account: string): string => `nexus:shared:${account.toLowerCase()}`;

function deriveDisplayName(email: string): string {
  const local = email.split('@')[0] ?? email;
  return local
    .split(/[._-]+/)
    .map((p) => (p.length > 0 ? p.charAt(0).toUpperCase() + p.slice(1) : p))
    .join(' ');
}

/** Übersetzt einen nativen Reject in eine typisierte Fehlerart (für eine klare UI-Meldung). */
function classify(e: unknown): SharedMailboxError {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes('FORBIDDEN')) {
    return new SharedMailboxError('forbidden', 'Keine Berechtigung für dieses Postfach.');
  }
  if (msg.includes('INVALID')) {
    return new SharedMailboxError('invalid', 'Bitte eine gültige Postfach-Adresse eingeben.');
  }
  return new SharedMailboxError('error', 'Postfach konnte nicht geprüft werden.');
}

function parse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

/** Persistierte Liste freigegebener Postfächer des aktiven (delegierenden) Kontos. */
export async function listSharedMailboxes(
  store: SecureStore,
  account: string,
): Promise<readonly SharedMailbox[]> {
  const raw = await store.get(storeKey(account));
  if (raw === undefined) return [];
  const parsed = parse<unknown>(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter(
      (x): x is { email: string; displayName?: unknown } =>
        typeof x === 'object' && x !== null && typeof (x as { email?: unknown }).email === 'string',
    )
    .map((x) => ({
      email: x.email,
      displayName: typeof x.displayName === 'string' ? x.displayName : deriveDisplayName(x.email),
    }));
}

async function save(
  store: SecureStore,
  account: string,
  list: readonly SharedMailbox[],
): Promise<void> {
  await store.set(storeKey(account), JSON.stringify(list));
}

/**
 * Fügt ein freigegebenes Postfach hinzu — NUR nach serverseitiger Berechtigungsprüfung. Ohne
 * Berechtigung wirft EWS `ErrorAccessDenied` → hier ein {@link SharedMailboxError} mit
 * `reason: 'forbidden'`; es wird NICHTS gespeichert.
 */
export async function addSharedMailbox(
  store: SecureStore,
  account: string,
  email: string,
): Promise<SharedMailbox> {
  let verifiedEmail: string;
  try {
    const json = await NexusNative.transportVerifySharedMailbox(account, email);
    const result = parse<{ email?: unknown }>(json, {});
    verifiedEmail = typeof result.email === 'string' ? result.email : email.trim().toLowerCase();
  } catch (e: unknown) {
    throw classify(e);
  }
  const entry: SharedMailbox = {
    email: verifiedEmail,
    displayName: deriveDisplayName(verifiedEmail),
  };
  const current = await listSharedMailboxes(store, account);
  if (current.some((m) => m.email.toLowerCase() === entry.email.toLowerCase())) return entry;
  await save(store, account, [...current, entry]);
  return entry;
}

export async function removeSharedMailbox(
  store: SecureStore,
  account: string,
  email: string,
): Promise<void> {
  const current = await listSharedMailboxes(store, account);
  await save(
    store,
    account,
    current.filter((m) => m.email.toLowerCase() !== email.toLowerCase()),
  );
}

/**
 * Lädt (nur lesend) den Posteingang eines freigegebenen Postfachs. Der Server erzwingt die
 * Rechte erneut — bei fehlender Berechtigung wirft dies einen {@link SharedMailboxError}.
 */
export async function loadSharedInbox(
  account: string,
  email: string,
): Promise<readonly MailMessage[]> {
  try {
    const json = await NexusNative.transportSyncSharedInbox(account, email);
    const result = parse<{ messages?: unknown }>(json, {});
    return Array.isArray(result.messages) ? (result.messages as MailMessage[]) : [];
  } catch (e: unknown) {
    throw classify(e);
  }
}
