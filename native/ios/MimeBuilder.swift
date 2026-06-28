import Foundation

/// Baut aus einem `OutgoingMessage`-Dict eine RFC822-MIME-Nachricht für EAS `SendMail`.
///
/// Bewusst expliziter String-Aufbau (`var`/`+=`) statt langer Interpolations-/`+`-Ketten — der
/// Swift-Typechecker bricht bei großen Ausdrücken sonst ab. Base64-Zeilen werden auf 76 Zeichen
/// umgebrochen (RFC 2045); Nicht-ASCII-Header werden als RFC-2047-Encoded-Word kodiert.
enum MimeBuilder {
  static func build(_ msg: [String: Any]) -> String {
    let fromDict = msg["from"] as? [String: Any]
    let fromAddr = fromDict?["address"] as? String ?? ""
    let fromName = fromDict?["displayName"] as? String
    let subject = msg["subject"] as? String ?? ""
    let bodyDict = msg["body"] as? [String: Any]
    let bodyContent = bodyDict?["content"] as? String ?? ""
    let isHtml = (bodyDict?["type"] as? String) == "html"
    let recipients = msg["recipients"] as? [[String: Any]] ?? []

    func addrs(_ kind: String) -> [String] {
      var out: [String] = []
      for r in recipients where (r["kind"] as? String) == kind {
        guard let a = r["address"] as? [String: Any], let addr = a["address"] as? String else {
          continue
        }
        out.append(formatAddress(name: a["displayName"] as? String, addr: addr))
      }
      return out
    }
    let to = addrs("to")
    let cc = addrs("cc")
    let bcc = addrs("bcc")

    let attachments = (msg["attachments"] as? [[String: Any]] ?? []).compactMap {
      (a) -> (name: String, contentType: String, base64: String)? in
      guard let b64 = a["contentBase64"] as? String, !b64.isEmpty else { return nil }
      return (
        a["name"] as? String ?? "Anhang",
        a["contentType"] as? String ?? "application/octet-stream", b64
      )
    }

    var headers = ""
    headers += "From: " + formatAddress(name: fromName, addr: fromAddr) + "\r\n"
    if !to.isEmpty { headers += "To: " + to.joined(separator: ", ") + "\r\n" }
    if !cc.isEmpty { headers += "Cc: " + cc.joined(separator: ", ") + "\r\n" }
    if !bcc.isEmpty { headers += "Bcc: " + bcc.joined(separator: ", ") + "\r\n" }
    headers += "Subject: " + encodeHeader(subject) + "\r\n"
    headers += "MIME-Version: 1.0\r\n"

    let contentType = isHtml ? "text/html" : "text/plain"
    if attachments.isEmpty {
      headers += "Content-Type: " + contentType + "; charset=utf-8\r\n"
      headers += "Content-Transfer-Encoding: base64\r\n"
      return headers + "\r\n" + base64Lines(bodyContent)
    }

    let boundary = "NEXUS_" + UUID().uuidString.replacingOccurrences(of: "-", with: "")
    headers += "Content-Type: multipart/mixed; boundary=\"" + boundary + "\"\r\n"
    var body = "\r\n--" + boundary + "\r\n"
    body += "Content-Type: " + contentType + "; charset=utf-8\r\n"
    body += "Content-Transfer-Encoding: base64\r\n\r\n"
    body += base64Lines(bodyContent) + "\r\n"
    for att in attachments {
      body += "--" + boundary + "\r\n"
      body += "Content-Type: " + att.contentType + "; name=\"" + att.name + "\"\r\n"
      body += "Content-Transfer-Encoding: base64\r\n"
      body += "Content-Disposition: attachment; filename=\"" + att.name + "\"\r\n\r\n"
      body += wrap76(att.base64) + "\r\n"
    }
    body += "--" + boundary + "--\r\n"
    return headers + body
  }

  private static func formatAddress(name: String?, addr: String) -> String {
    guard let name = name, !name.isEmpty else { return addr }
    if name.canBeConverted(to: .ascii) {
      return "\"" + name.replacingOccurrences(of: "\"", with: "") + "\" <" + addr + ">"
    }
    return encodeHeader(name) + " <" + addr + ">"
  }

  /// RFC-2047 Encoded-Word (Base64) für Nicht-ASCII; reines ASCII bleibt unverändert.
  private static func encodeHeader(_ s: String) -> String {
    if s.canBeConverted(to: .ascii) { return s }
    return "=?utf-8?B?" + Data(s.utf8).base64EncodedString() + "?="
  }

  private static func base64Lines(_ s: String) -> String {
    wrap76(Data(s.utf8).base64EncodedString())
  }

  /// Bricht eine Zeichenkette in 76-Zeichen-Zeilen (RFC 2045).
  private static func wrap76(_ s: String) -> String {
    let chars = Array(s)
    var out = ""
    var i = 0
    while i < chars.count {
      let end = min(i + 76, chars.count)
      out += String(chars[i..<end])
      if end < chars.count { out += "\r\n" }
      i = end
    }
    return out
  }
}
