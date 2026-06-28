#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/**
 * On-Device-Crash-Recorder (Diagnose, datenschutzfreundlich — KEIN Cloud/Telemetrie).
 *
 * Hintergrund: Eine Objective-C-`NSException`, die aus einer nativen TurboModule-Methode
 * über die React-Native-New-Architecture-Bridge entkommt, läuft über `objc_exception_rethrow`
 * → `std::terminate` → `abort()`. Das System-Crash-Log (`.ips`) zeigt dabei nur die
 * Rethrow-Maschinerie, **nie** den eigentlichen `reason` der Exception — wir tappten im Dunkeln.
 *
 * Dieser Recorder installiert (so früh wie möglich, via `+load`) zwei Netze:
 *   1. `NSSetUncaughtExceptionHandler` — fängt den `reason`/Namen/Stack jeder NSException ab,
 *      bevor `abort()` ausgelöst wird (der Handler wird von `_objc_terminate` aufgerufen).
 *   2. `sigaction` für SIGSEGV/SIGBUS/SIGABRT/SIGILL/SIGFPE/SIGTRAP — schreibt einen
 *      async-signal-sicheren `backtrace` (für die Hermes-GC-SIGSEGVs).
 *
 * Beides wird nach `Library/Caches/nexus-lastcrash.log` geschrieben und per `os_log`/NSLog
 * ausgegeben (live sichtbar über Console.app / `idevicesyslog` per USB). Beim nächsten Start
 * liest die App den Bericht aus und zeigt den Grund an — so braucht der Nutzer keinen Mac.
 */
@interface NexusCrashReporter : NSObject

/// Installiert die Handler (idempotent). Wird automatisch via `+load` aufgerufen.
+ (void)install;

/// Letzter gespeicherter Crash-Bericht (oder `nil`, falls keiner vorliegt).
+ (nullable NSString *)lastReport;

/// Löscht den gespeicherten Bericht (nach dem Anzeigen).
+ (void)clearReport;

@end

NS_ASSUME_NONNULL_END
