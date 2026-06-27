import Foundation
import Network

/// Beobachtet den Netzwerkpfad (WLAN vs. Mobilfunk) für die Einstellung „Nur über WLAN
/// synchronisieren". Ein einzelner, langlebiger `NWPathMonitor` aktualisiert den Status
/// nebenläufig; gelesen wird thread-sicher per Lock. Bewusst ohne externe Abhängigkeit
/// (`react-native-netinfo` o. Ä.) — passt zur Thin-JS/Native-Core-Linie.
final class NexusNetwork {
  static let shared = NexusNetwork()

  private let monitor = NWPathMonitor()
  private let monitorQueue = DispatchQueue(label: "de.itm.nexus.net")
  private let lock = NSLock()
  private var hasNetwork = true
  private var isCellular = false

  private init() {
    monitor.pathUpdateHandler = { [weak self] path in
      guard let self = self else { return }
      let satisfied = path.status == .satisfied
      let cellular = path.usesInterfaceType(.cellular)
      self.lock.lock()
      self.hasNetwork = satisfied
      self.isCellular = cellular
      self.lock.unlock()
    }
    monitor.start(queue: monitorQueue)
  }

  /// Aktueller Verbindungstyp: "wifi" | "cellular" | "none". Default „wifi", solange der
  /// Monitor noch keinen Pfad gemeldet hat (verhindert ein fälschliches Sync-Blockieren).
  func status() -> String {
    lock.lock()
    defer { lock.unlock() }
    if !hasNetwork { return "none" }
    return isCellular ? "cellular" : "wifi"
  }
}
