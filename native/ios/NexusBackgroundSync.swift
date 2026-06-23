import BackgroundTasks
import Foundation

/// Registriert und plant die periodische Hintergrund-Aktualisierung (BGAppRefreshTask).
///
/// Der Task läuft **ohne JS-Kontext** (Cold Start möglich) und synchronisiert den Posteingang
/// rein nativ: `NexusTransport.syncInboxNative()` stellt die Session aus dem Keychain wieder her
/// und schreibt neue Nachrichten in die SQLCipher-DB. Apple verlangt, dass `register()` **vor**
/// dem Ende von `application(_:didFinishLaunchingWithOptions:)` aufgerufen wird — das übernimmt
/// das AppDelegate-Wiring (siehe .github/scripts/build-mobile.sh). Voraussetzung: Info.plist mit
/// `UIBackgroundModes` (fetch/processing) und `BGTaskSchedulerPermittedIdentifiers`.
public enum NexusBackgroundSync {
  static let taskIdentifier = "de.itm.nexus.refresh"

  /// Registriert den Task-Handler. iOS ruft den Handler später (vom System getaktet) auf.
  /// Wird vom App-Target (AppDelegate) aufgerufen ⇒ `public`.
  public static func register() {
    BGTaskScheduler.shared.register(forTaskWithIdentifier: taskIdentifier, using: nil) { task in
      guard let refresh = task as? BGAppRefreshTask else {
        task.setTaskCompleted(success: false)
        return
      }
      handle(refresh)
    }
  }

  /// Plant den nächsten Lauf (frühestens in ~15 min). Den realen Zeitpunkt bestimmt iOS.
  public static func schedule() {
    let request = BGAppRefreshTaskRequest(identifier: taskIdentifier)
    request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
    try? BGTaskScheduler.shared.submit(request)
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
