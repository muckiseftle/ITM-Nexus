import Foundation
import UIKit
import UniformTypeIdentifiers

/// Präsentiert den System-Dateiauswähler (UIDocumentPickerViewController) und liefert die
/// gewählte Datei als Base64 zurück. `asCopy: true` legt eine app-private Kopie an — kein
/// Security-Scoped-Resource-Handling nötig. Abbruch wird als Fehler „CANCELLED" gemeldet.
@MainActor
final class NexusAttachmentPicker: NSObject, UIDocumentPickerDelegate {
  private var continuation: CheckedContinuation<[String: Any], Error>?
  // Hält die Instanz (inkl. Delegate) am Leben, solange der Picker präsentiert ist.
  private static var active: NexusAttachmentPicker?

  static func pick() async throws -> [String: Any] {
    let picker = NexusAttachmentPicker()
    active = picker
    return try await withCheckedThrowingContinuation { cont in
      picker.continuation = cont
      picker.present()
    }
  }

  private func present() {
    let vc = UIDocumentPickerViewController(forOpeningContentTypes: [.item], asCopy: true)
    vc.delegate = self
    vc.allowsMultipleSelection = false
    guard let top = Self.topViewController() else {
      finish(.failure(NexusError.transport("Kein Fenster zum Anzeigen des Dateiauswählers")))
      return
    }
    top.present(vc, animated: true)
  }

  func documentPicker(
    _ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]
  ) {
    guard let url = urls.first else {
      finish(.failure(NexusError.transport("CANCELLED")))
      return
    }
    do {
      let data = try Data(contentsOf: url)
      let mime =
        (try? url.resourceValues(forKeys: [.contentTypeKey]))?.contentType?.preferredMIMEType
        ?? "application/octet-stream"
      finish(
        .success([
          "name": url.lastPathComponent,
          "contentType": mime,
          "sizeBytes": data.count,
          "base64": data.base64EncodedString(),
        ]))
    } catch {
      finish(.failure(error))
    }
  }

  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    finish(.failure(NexusError.transport("CANCELLED")))
  }

  private func finish(_ result: Result<[String: Any], Error>) {
    let cont = continuation
    continuation = nil
    Self.active = nil
    switch result {
    case .success(let value): cont?.resume(returning: value)
    case .failure(let error): cont?.resume(throwing: error)
    }
  }

  private static func topViewController() -> UIViewController? {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    let window =
      scenes.flatMap { $0.windows }.first { $0.isKeyWindow } ?? scenes.first?.windows.first
    var top = window?.rootViewController
    while let presented = top?.presentedViewController { top = presented }
    return top
  }
}
