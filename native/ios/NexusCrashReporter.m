#import "NexusCrashReporter.h"
#import <execinfo.h>
#import <signal.h>
#import <string.h>
#import <unistd.h>
#import <fcntl.h>
#import <os/log.h>

// Signal-Handler-Pfad als C-String (async-signal-sicher — kein Foundation im Handler).
static char gSignalLogPath[1024] = {0};
static NSUncaughtExceptionHandler *gPreviousExceptionHandler = NULL;
static volatile sig_atomic_t gHandlingSignal = 0;
// Gesetzt, sobald der NSException-Handler den (reichhaltigen) Bericht geschrieben hat. Der
// SIGABRT-Signal-Handler (abort() folgt jeder unbehandelten NSException) darf den Grund dann
// NICHT mit einem mageren Signal-Bericht überschreiben.
static volatile sig_atomic_t gExceptionWritten = 0;

// Die Signale, die wir abfangen (Hermes-GC-Korruption ⇒ SIGSEGV/SIGBUS; abort ⇒ SIGABRT).
static const int kHandledSignals[] = {SIGSEGV, SIGBUS, SIGABRT, SIGILL, SIGFPE, SIGTRAP};
static const int kHandledSignalCount = (int)(sizeof(kHandledSignals) / sizeof(kHandledSignals[0]));
static struct sigaction gPreviousActions[6];

@implementation NexusCrashReporter

+ (NSString *)cachesDir {
  NSString *dir = NSSearchPathForDirectoriesInDomains(NSCachesDirectory, NSUserDomainMask, YES).firstObject;
  return dir ?: NSTemporaryDirectory();
}

// Reichhaltiger NSException-Bericht (Name + reason + Stack) — hat Vorrang.
+ (NSString *)exceptionLogPath {
  return [[self cachesDir] stringByAppendingPathComponent:@"nexus-lastcrash-exc.log"];
}

// Signal-Bericht (Backtrace) — nur falls KEIN NSException-Bericht vorliegt.
+ (NSString *)signalLogPath {
  return [[self cachesDir] stringByAppendingPathComponent:@"nexus-lastcrash-sig.log"];
}

// — Async-signal-sicherer Schreibhelfer (nur write(), keine Foundation/malloc) —
static void rawWrite(int fd, const char *str) {
  if (str == NULL) {
    return;
  }
  size_t len = strlen(str);
  ssize_t written = 0;
  while ((size_t)written < len) {
    ssize_t n = write(fd, str + written, len - (size_t)written);
    if (n <= 0) {
      break;
    }
    written += n;
  }
}

// — Signal-Handler: schreibt Marker + Backtrace, stellt Default wieder her, re-raise —
static void signalHandler(int signo, siginfo_t *info, void *context) {
  // Re-Entrancy/Doppel-Crash vermeiden: ab dem ersten Treffer Default-Verhalten zulassen.
  if (gHandlingSignal) {
    signal(signo, SIG_DFL);
    raise(signo);
    return;
  }
  gHandlingSignal = 1;

  // Nur schreiben, wenn NICHT bereits ein reichhaltiger NSException-Bericht existiert. Sonst
  // würden wir den eigentlichen Grund (den abort() gerade ausgelöst hat) mit „SIGABRT"
  // überschreiben — genau das passierte zuvor.
  if (!gExceptionWritten && gSignalLogPath[0] != '\0') {
    int fd = open(gSignalLogPath, O_WRONLY | O_CREAT | O_TRUNC, 0644);
    if (fd >= 0) {
      rawWrite(fd, "NEXUS-CRASH\nkind=signal\nsignal=");
      const char *name = "?";
      switch (signo) {
        case SIGSEGV: name = "SIGSEGV (Speicherzugriffsfehler)"; break;
        case SIGBUS:  name = "SIGBUS";  break;
        case SIGABRT: name = "SIGABRT (abort)"; break;
        case SIGILL:  name = "SIGILL";  break;
        case SIGFPE:  name = "SIGFPE";  break;
        case SIGTRAP: name = "SIGTRAP"; break;
      }
      rawWrite(fd, name);
      rawWrite(fd, "\nbacktrace:\n");
      void *frames[64];
      int count = backtrace(frames, 64);
      backtrace_symbols_fd(frames, count, fd);
      rawWrite(fd, "\n");
      close(fd);
    }
  }
  // os_log ist async-signal-sicher und erscheint live in Console.app/idevicesyslog.
  os_log_error(OS_LOG_DEFAULT, "🔴 NEXUS-CRASH signal=%d — Bericht in nexus-lastcrash.log", signo);

  // Vorherige/Default-Disposition wiederherstellen und Signal erneut auslösen, damit das
  // System sein reguläres .ips weiterhin erzeugt.
  for (int i = 0; i < kHandledSignalCount; i++) {
    if (kHandledSignals[i] == signo) {
      sigaction(signo, &gPreviousActions[i], NULL);
      break;
    }
  }
  raise(signo);
}

// — NSException-Handler: voller Kontext (Foundation hier erlaubt, kein Signal-Kontext) —
static void exceptionHandler(NSException *exception) {
  @try {
    NSMutableString *report = [NSMutableString string];
    [report appendString:@"NEXUS-CRASH\nkind=exception\n"];
    [report appendFormat:@"name=%@\n", exception.name ?: @"?"];
    [report appendFormat:@"reason=%@\n", exception.reason ?: @"(kein Grund)"];
    if (exception.userInfo.count > 0) {
      [report appendFormat:@"userInfo=%@\n", exception.userInfo];
    }
    [report appendString:@"callStack:\n"];
    for (NSString *frame in exception.callStackSymbols) {
      [report appendFormat:@"%@\n", frame];
    }
    [report writeToFile:[NexusCrashReporter exceptionLogPath]
             atomically:YES
               encoding:NSUTF8StringEncoding
                  error:NULL];
    // Markieren, BEVOR abort() den SIGABRT-Handler auslöst — sonst clobbert dieser den Grund.
    gExceptionWritten = 1;

    // Live sichtbar (Console.app / idevicesyslog). Der Grund ist hier das Entscheidende.
    NSLog(@"🔴 NEXUS-CRASH (NSException) name=%@ reason=%@", exception.name, exception.reason);
    os_log_error(OS_LOG_DEFAULT, "🔴 NEXUS-CRASH NSException: %{public}@ — %{public}@",
                 exception.name, exception.reason ?: @"(kein Grund)");
  } @catch (__unused NSException *ignored) {
    // Im Crash-Pfad niemals selbst werfen.
  }
  // Etwaigen zuvor registrierten Handler (z. B. von RN) trotzdem aufrufen.
  if (gPreviousExceptionHandler != NULL && gPreviousExceptionHandler != &exceptionHandler) {
    gPreviousExceptionHandler(exception);
  }
}

+ (void)install {
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    strncpy(gSignalLogPath, [self signalLogPath].fileSystemRepresentation, sizeof(gSignalLogPath) - 1);

    gPreviousExceptionHandler = NSGetUncaughtExceptionHandler();
    NSSetUncaughtExceptionHandler(&exceptionHandler);

    struct sigaction action;
    memset(&action, 0, sizeof(action));
    sigemptyset(&action.sa_mask);
    action.sa_flags = SA_SIGINFO;
    action.sa_sigaction = &signalHandler;
    for (int i = 0; i < kHandledSignalCount; i++) {
      sigaction(kHandledSignals[i], &action, &gPreviousActions[i]);
    }
    NSLog(@"NEXUS-CRASH-Recorder aktiv");
  });
}

// Beim Laden des Images installieren — vor main(), unabhängig vom AppDelegate.
+ (void)load {
  [self install];
}

+ (NSString *)readReportAtPath:(NSString *)path {
  if (![[NSFileManager defaultManager] fileExistsAtPath:path]) {
    return nil;
  }
  NSString *content = [NSString stringWithContentsOfFile:path encoding:NSUTF8StringEncoding error:NULL];
  return content.length > 0 ? content : nil;
}

+ (NSString *)lastReport {
  // NSException-Bericht hat Vorrang (enthält den eigentlichen Grund); sonst Signal-Bericht.
  NSString *exc = [self readReportAtPath:[self exceptionLogPath]];
  if (exc != nil) {
    return exc;
  }
  return [self readReportAtPath:[self signalLogPath]];
}

+ (void)clearReport {
  [[NSFileManager defaultManager] removeItemAtPath:[self exceptionLogPath] error:NULL];
  [[NSFileManager defaultManager] removeItemAtPath:[self signalLogPath] error:NULL];
}

@end
