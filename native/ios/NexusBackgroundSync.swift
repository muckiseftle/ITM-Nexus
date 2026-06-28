import BackgroundTasks
import Foundation

/// Registriert und plant die periodische Hintergrund-Aktualisierung (BGAppRefreshTask).
///
/// Der Task läuft **ohne JS-Kontext** (Cold Start möglich) und synchronisiert den Posteingang
/// rein nativ: `NexusTransport.syncInboxNative()` stellt die Session aus dem Keychain wieder her
/// und schreibt neue Nachrichten in die SQLCipher-DB. iOS verlangt, dass `register()` **vor**
/// dem Ende von `application(_:didFinishLaunchingWithOptions:)` aufgerufen wird — das übernimmt
/// das AppDelegate-Wiring (siehe .github/scripts/build-mobile.sh). Voraussetzung: Info.plist mit
/// `UIBackgroundModes` (fetch/processing) und `BGTaskSchedulerPermittedIdentifiers`.
public enum NexusBackgroundSync {
  static let taskIdentifier = "de.itm.nexus.refresh"

  /// Registriert den Task-Handler. iOS ruft den Handler später (vom System getaktet) auf.
  /// Wird vom App-Target (AppDelegate) aufgerufen ⇒ `public`.
  ///
  /// Die BGTaskScheduler-Aufrufe laufen über `NexusBGTasks` (REINES Obj-C @try/@catch): eine
  /// etwaige NSException (z. B. fehlendes Background-Entitlement bei Sideload) MUSS im selben
  /// Obj-C-Frame gefangen werden — über Swift-Frames hinweg ist sie nicht zuverlässig fangbar
  /// und führt zu `std::terminate`/SIGABRT.
  public static func register() {
    NexusBGTasks.registerRefresh(withIdentifier: taskIdentifier) { task in
      handle(task)
    }
  }

  /// Plant den nächsten Lauf (frühestens in ~15 min). Den realen Zeitpunkt bestimmt iOS.
  /// `submit()` wirft ohne Background-Entitlement eine NSException — sicher in `NexusBGTasks`
  /// (Obj-C) gefangen, daher hier ein gefahrloser No-op bei Sideload-Builds.
  public static func schedule() {
    NexusBGTasks.submitRefresh(withIdentifier: taskIdentifier, earliestInterval: 15 * 60)
  }

  private static func handle(_ task: BGAppRefreshTask) {
    schedule()  // immer den Folgelauf einplanen, sonst endet die Kette
    let work = Task {
      do {
        try NexusDatabase.shared.initialize()
        _ = try await NexusTransport.shared.syncInboxNative()
        task.setTaskCompleted(success: true)
      } catch {
        task.setTaskCompleted(success: false)
      }
    }
    task.expirationHandler = { work.cancel() }
  }
}
