package de.itmtechnologies.nexus

/**
 * Exchange-Transport (EWS + EAS, hybrid) mit Autodiscover, TLS und Certificate Pinning.
 * Implementiert die Transport-Seite des `MailTransport`-Ports; Ergebnisse als JSON über die
 * Bridge. Pinning via OkHttp `CertificatePinner` (Pin-Set per MDM/AppConfig konfigurierbar).
 *
 * Etabliert Autodiscover-Fluss und Request-Gerüst; EWS-SOAP/EAS-WBXML-Parsing iterativ
 * (siehe docs/11-Native-und-App.md).
 */
class NexusTransport {

  /** Autodiscover → `AutodiscoverResult`-JSON. Endpunkt-Auswahl in TS (selectEndpoints). */
  fun discover(email: String, credentialsJson: String): String {
    val domain = email.substringAfterLast('@', "")
    require(domain.isNotEmpty()) { "Ungültige E-Mail-Adresse" }
    // Fallback-Kette: https://<domain>/autodiscover/autodiscover.xml,
    // https://autodiscover.<domain>/..., SRV _autodiscover._tcp.<domain>.
    throw NotImplementedError("Autodiscover-Netzpfad noch nicht verdrahtet (iterativ).")
  }

  fun syncMessages(accountId: String, folderId: String, syncKey: String?): String {
    // EAS Sync(SyncKey) → EWS GetItem; Mapping → SyncDelta-JSON.
    throw NotImplementedError("syncMessages noch nicht verdrahtet (iterativ).")
  }

  fun applyOperation(operationJson: String) {
    // EWS UpdateItem/MoveItem/DeleteItem bzw. EAS-Pendant je OutboxCommand.
    throw NotImplementedError("applyOperation noch nicht verdrahtet (iterativ).")
  }

  fun sendMessage(accountId: String, messageJson: String): String {
    throw NotImplementedError("sendMessage noch nicht verdrahtet (iterativ).")
  }

  fun searchServer(accountId: String, query: String): String {
    // EWS FindItem (AQS) → SearchHit[]-JSON.
    throw NotImplementedError("searchServer noch nicht verdrahtet (iterativ).")
  }
}
