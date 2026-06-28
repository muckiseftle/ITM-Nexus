import Foundation
import Security

/// Einmaliger TLS-Probe-Delegate für Trust-on-First-Use (TOFU).
///
/// Liest beim Verbindungsaufbau den **SPKI-Pin** und den **Subject** des Server-Zertifikats und
/// BRICHT DIE VERBINDUNG DANN AB — es wird NICHTS dauerhaft vertraut und keine TLS-Prüfung
/// abgeschwächt. Der Nutzer bestätigt den Fingerprint im Setup; erst danach wird der Pin
/// gespeichert (`NexusTransport.trustCertificate`) und ab dann fail-closed erzwungen.
final class NexusCertProbe: NSObject, URLSessionDelegate {
  private(set) var spki: String = ""
  private(set) var subject: String = ""

  func urlSession(
    _ session: URLSession,
    didReceive challenge: URLAuthenticationChallenge,
    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
  ) {
    if challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
      let trust = challenge.protectionSpace.serverTrust
    {
      spki = NexusPinning.spkiPins(for: trust).first ?? ""
      if #available(iOS 15.0, *),
        let chain = SecTrustCopyCertificateChain(trust) as? [SecCertificate],
        let leaf = chain.first,
        let summary = SecCertificateCopySubjectSummary(leaf) as String?
      {
        subject = summary
      }
    }
    // Nur das Zertifikat war gefragt — Verbindung abbrechen (nichts wird vertraut).
    completionHandler(.cancelAuthenticationChallenge, nil)
  }
}
