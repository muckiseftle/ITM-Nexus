#import "NexusCrashReporter.h"
#import <execinfo.h>
#import <signal.h>
#import <string.h>
#import <unistd.h>
#import <fcntl.h>
#import <os/log.h>
#include <exception>
#include <cxxabi.h>
#include <typeinfo>

// Signal-Handler-Pfad als C-String (async-signal-sicher — kein Foundation im Handler).
static char gSignalLogPath[1024] = {0};
static NSUncaughtExceptionHandler *gPreviousExceptionHandler = NULL;
static std::terminate_handler gPreviousTerminate = nullptr;
static volatile sig_atomic_t gHandlingSignal = 0;
// Gesetzt, sobald ein (reichhaltiger) Exception-/Terminate-Bericht mit Grund geschrieben wurde.
// Der SIGABRT-Signal-Handler (abort() folgt) darf den Grund dann NICHT überschreiben.
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

// Reichhaltiger Bericht (Name + reason + Stack) — hat Vorrang.
+ (NSString *)exceptionLogPath {
  return [[self cachesDir] stringByAppendingPathComponent:@"nexus-lastcrash-exc.log"];
}

// Signal-Bericht (Backtrace) — nur falls KEIN Exception-Bericht vorliegt.
+ (NSString *)signalLogPath {
  return [[self cachesDir] stringByAppendingPathComponent:@"nexus-lastcrash-sig.log"];
}

// — Reichhaltigen Bericht schreiben (Foundation erlaubt, kein Signal-Kontext) —
static void writeExceptionReport(NSString *kind, NSString *name, NSString *reason,
                                 NSArray<NSString *> *stack) {
  @try {
    NSMutableString *report = [NSMutableString string];
    [report appendString:@"NEXUS-CRASH\n"];
    [report appendFormat:@"kind=%@\n", kind ?: @"exception"];
    [report appendFormat:@"name=%@\n", name ?: @"?"];
    [report appendFormat:@"reason=%@\n", reason ?: @"(kein Grund)"];
    [report appendString:@"callStack:\n"];
    NSArray<NSString *> *frames = stack ?: [NSThread callStackSymbols];
    for (NSString *frame in frames) {
      [report appendFormat:@"%@\n", frame];
    }
    [report writeToFile:[NexusCrashReporter exceptionLogPath]
             atomically:YES
               encoding:NSUTF8StringEncoding
                  error:NULL];
    // Markieren, BEVOR abort() den SIGABRT-Handler auslöst — sonst clobbert dieser den Grund.
    gExceptionWritten = 1;
    NSLog(@"🔴 NEXUS-CRASH (%@) name=%@ reason=%@", kind, name, reason);
    os_log_error(OS_LOG_DEFAULT, "🔴 NEXUS-CRASH %{public}@: %{public}@ — %{public}@",
                 kind, name, reason ?: @"(kein Grund)");
  } @catch (__unused NSException *ignored) {
    // Im Crash-Pfad niemals selbst werfen.
  }
}

// — C++-Terminate-Handler: DAS zuverlässige Netz. Im RN-New-Arch-Pfad wird die NSException als
//   C++-Exception re-geworfen (__cxa_rethrow → std::terminate); NSSetUncaughtExceptionHandler
//   greift dort NICHT. Hier holen wir die laufende Exception per rethrow zurück und lesen den
//   echten Grund — egal ob NSException oder reine C++-Exception. —
static void terminateHandler() {
  @try {
    std::exception_ptr ep = std::current_exception();
    if (ep) {
      try {
        std::rethrow_exception(ep);
      } catch (NSException *e) {
        // ObjC-Ausnahme: in ObjC++ mit einem C++-`catch` des ObjC-Pointer-Typs fangbar
        // (NICHT @catch). Der häufigste Fall im RN-New-Arch-Pfad.
        writeExceptionReport(@"exception", e.name ?: @"NSException",
                             e.reason ?: @"(kein Grund)", e.callStackSymbols);
      } catch (const std::exception &e) {
        const char *w = e.what();
        writeExceptionReport(@"cpp", @"std::exception",
                             @(w ? w : "(kein what)"), nil);
      } catch (...) {
        const std::type_info *ti = abi::__cxa_current_exception_type();
        const char *tn = ti ? ti->name() : "unbekannt";
        writeExceptionReport(@"cpp", @(tn), @"(nicht-standardisierte C++-Ausnahme)", nil);
      }
    } else {
      // terminate() ohne laufende Exception — wenigstens den Stack festhalten.
      writeExceptionReport(@"terminate", @"std::terminate",
                           @"terminate() ohne aktive Ausnahme", nil);
    }
  } @catch (__unused id ignored) {
  }
  // Vorherigen Terminate-Handler (i. d. R. _objc_terminate) aufrufen, damit das System sein
  // reguläres .ips weiterhin erzeugt. Fällt der aus, selbst aborten.
  if (gPreviousTerminate != nullptr && gPreviousTerminate != &terminateHandler) {
    gPreviousTerminate();
  }
  abort();
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
  if (gHandlingSignal) {
    signal(signo, SIG_DFL);
    raise(signo);
    return;
  }
  gHandlingSignal = 1;

  // Nur schreiben, wenn NICHT bereits ein reichhaltiger Exception-/Terminate-Bericht existiert.
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
  os_log_error(OS_LOG_DEFAULT, "🔴 NEXUS-CRASH signal=%d", signo);

  for (int i = 0; i < kHandledSignalCount; i++) {
    if (kHandledSignals[i] == signo) {
      sigaction(signo, &gPreviousActions[i], NULL);
      break;
    }
  }
  raise(signo);
}

// — NSException-Handler (Belt; greift, wenn der Pfad NICHT über C++-rethrow läuft) —
static void exceptionHandler(NSException *exception) {
  writeExceptionReport(@"exception", exception.name ?: @"NSException",
                       exception.reason ?: @"(kein Grund)", exception.callStackSymbols);
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

    gPreviousTerminate = std::get_terminate();
    std::set_terminate(&terminateHandler);

    struct sigaction action;
    memset(&action, 0, sizeof(action));
    sigemptyset(&action.sa_mask);
    action.sa_flags = SA_SIGINFO;
    action.sa_sigaction = &signalHandler;
    for (int i = 0; i < kHandledSignalCount; i++) {
      sigaction(kHandledSignals[i], &action, &gPreviousActions[i]);
    }
    NSLog(@"NEXUS-CRASH-Recorder aktiv (NSException + std::terminate + signals)");
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
  // Exception-/Terminate-Bericht hat Vorrang (enthält den Grund); sonst Signal-Bericht.
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
