import CryptoKit
import Foundation
import Security

/// Berechnet SPKI-Pins (`base64(SHA-256(SubjectPublicKeyInfo))`) aus einer Server-Trust-Kette.
///
/// Ansatz wie TrustKit: `SecKeyCopyExternalRepresentation` liefert den rohen Schlüssel
/// (PKCS#1 bei RSA, X9.63 bei EC); davor wird der zum Schlüsseltyp passende ASN.1-SPKI-Header
/// gestellt, dann SHA-256 gebildet. Unbekannte Schlüsseltypen liefern keinen Pin → der Aufrufer
/// behandelt das fail-closed (keine Übereinstimmung ⇒ Verbindung ablehnen).
enum NexusPinning {
  private static let rsa2048: [UInt8] = [
    0x30, 0x82, 0x01, 0x22, 0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01,
    0x01, 0x01, 0x05, 0x00, 0x03, 0x82, 0x01, 0x0f, 0x00,
  ]
  private static let rsa4096: [UInt8] = [
    0x30, 0x82, 0x02, 0x22, 0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01,
    0x01, 0x01, 0x05, 0x00, 0x03, 0x82, 0x02, 0x0f, 0x00,
  ]
  private static let ecP256: [UInt8] = [
    0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x08,
    0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, 0x03, 0x42, 0x00,
  ]
  private static let ecP384: [UInt8] = [
    0x30, 0x76, 0x30, 0x10, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x05,
    0x2b, 0x81, 0x04, 0x00, 0x22, 0x03, 0x62, 0x00,
  ]

  private static func header(for key: SecKey) -> [UInt8]? {
    guard let attrs = SecKeyCopyAttributes(key) as? [CFString: Any] else { return nil }
    let type = attrs[kSecAttrKeyType] as? String
    let size = attrs[kSecAttrKeySizeInBits] as? Int ?? 0
    if type == (kSecAttrKeyTypeRSA as String) {
      if size == 2048 { return rsa2048 }
      if size == 4096 { return rsa4096 }
    } else if type == (kSecAttrKeyTypeECSECPrimeRandom as String) {
      if size == 256 { return ecP256 }
      if size == 384 { return ecP384 }
    }
    return nil
  }

  /// Liefert die SPKI-Pins aller Zertifikate der Kette (Blattzertifikat zuerst).
  static func spkiPins(for trust: SecTrust) -> [String] {
    let certs: [SecCertificate]
    if #available(iOS 15.0, *) {
      certs = (SecTrustCopyCertificateChain(trust) as? [SecCertificate]) ?? []
    } else {
      certs = []
    }
    var pins: [String] = []
    for cert in certs {
      guard let key = SecCertificateCopyKey(cert), let header = header(for: key),
        let raw = SecKeyCopyExternalRepresentation(key, nil) as Data?
      else { continue }
      var spki = Data(header)
      spki.append(raw)
      let digest = SHA256.hash(data: spki)
      pins.append(Data(digest).base64EncodedString())
    }
    return pins
  }
}
