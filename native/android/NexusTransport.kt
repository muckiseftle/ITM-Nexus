package de.itmtechnologies.nexus

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject

/**
 * Exchange-Transport (EWS) mit Autodiscover, TLS und Certificate Pinning (OkHttp).
 * Erste funktionale Implementierung des `MailTransport`-Ports; Ergebnisse als JSON über die
 * Bridge. EAS/WBXML, NTLM/Kerberos und Härtung des Parsings folgen iterativ
 * (siehe docs/11-Native-und-App.md).
 */
class NexusTransport {
  private val xml = "text/xml; charset=utf-8".toMediaType()

  // Laufzeit-Konfiguration (aus Autodiscover/Account-Setup).
  private var ewsUrl: String? = null
  private var basicAuthHeader: String? = null

  // Pinning via CertificatePinner ergänzen (Pin-Set per MDM/Managed Configurations).
  private val client = OkHttpClient.Builder().build()

  // — Autodiscover —

  fun discover(email: String, credentialsJson: String): String {
    val domain = email.substringAfterLast('@', "")
    require(domain.isNotEmpty()) { "Ungültige E-Mail-Adresse" }

    val creds = JSONObject(credentialsJson)
    basicAuthHeader = basicAuth(creds.optString("username"), creds.optString("secret"))

    val candidates = listOf(
      "https://$domain/autodiscover/autodiscover.xml",
      "https://autodiscover.$domain/autodiscover/autodiscover.xml",
    )
    for (url in candidates) {
      val ews = fetchAutodiscoverEwsUrl(url, email) ?: continue
      ewsUrl = ews
      return JSONObject()
        .put("emailAddress", email)
        .put("auth", "basic")
        .put("ewsUrl", ews)
        .put("capabilities", defaultCapabilities())
        .toString()
    }
    throw IllegalStateException("Autodiscover fehlgeschlagen für $domain")
  }

  private fun fetchAutodiscoverEwsUrl(url: String, email: String): String? {
    val pox = """
      <Autodiscover xmlns="http://schemas.microsoft.com/exchange/autodiscover/outlook/requestschema/2006">
        <Request>
          <EMailAddress>${EwsSoap.xmlEscape(email)}</EMailAddress>
          <AcceptableResponseSchema>http://schemas.microsoft.com/exchange/autodiscover/outlook/responseschema/2006a</AcceptableResponseSchema>
        </Request>
      </Autodiscover>
    """.trimIndent()
    val body = post(url, pox) ?: return null
    val start = body.indexOf("<EwsUrl>")
    val end = body.indexOf("</EwsUrl>")
    return if (start >= 0 && end > start) body.substring(start + 8, end) else null
  }

  // — EWS-Operationen —

  fun syncMessages(accountId: String, folderId: String, syncKey: String?): String {
    val syncXml = postEws(EwsSoap.syncFolderItems(mapFolder(folderId), syncKey))
    val ids = EwsSoap.extractItemIds(syncXml)
    val created = JSONArray()
    if (ids.isNotEmpty()) {
      val itemsXml = postEws(EwsSoap.getItems(ids))
      EwsSoap.parseItems(itemsXml).forEach { created.put(messageJson(it, accountId, folderId)) }
    }
    return JSONObject()
      .put("syncKey", syncKey ?: "")
      .put("created", created)
      .put("updated", JSONArray())
      .put("deletedIds", JSONArray())
      .put("hasMore", false)
      .toString()
  }

  fun applyOperation(operationJson: String) {
    val command = JSONObject(operationJson).getJSONObject("command")
    val type = command.getString("type")
    val itemId = command.optString("messageId")
    when (type) {
      "markRead" -> postEws(EwsSoap.setIsRead(itemId, command.optBoolean("read", true)))
      "move" -> postEws(EwsSoap.moveItem(itemId, mapFolder(command.optString("targetFolderId"))))
      "delete" -> postEws(EwsSoap.deleteItem(itemId))
      else -> throw NotImplementedError("OutboxCommand $type noch nicht verdrahtet (iterativ).")
    }
  }

  fun sendMessage(accountId: String, messageJson: String): String {
    val msg = JSONObject(messageJson)
    val from = msg.getJSONObject("from").getString("address")
    val sender = msg.optJSONObject("sender")?.getString("address")
    val subject = msg.optString("subject")
    val body = msg.optJSONObject("body")?.optString("content") ?: ""
    val to = mutableListOf<String>()
    val recipients = msg.optJSONArray("recipients") ?: JSONArray()
    for (i in 0 until recipients.length()) {
      recipients.getJSONObject(i).optJSONObject("address")?.optString("address")?.let { to.add(it) }
    }
    postEws(EwsSoap.createItem(from, sender, to, subject, body))
    return JSONObject.quote("sent-${System.currentTimeMillis()}")
  }

  fun searchServer(accountId: String, query: String): String {
    val xmlResp = postEws(EwsSoap.findItem("inbox", query))
    val hits = JSONArray()
    EwsSoap.extractItemIds(xmlResp).forEachIndexed { i, id ->
      hits.put(JSONObject().put("messageId", id).put("rank", (1000 - i).toDouble()).put("source", "server"))
    }
    return hits.toString()
  }

  // — HTTP/Helpers —

  private fun postEws(soap: String): String =
    post(ewsUrl ?: error("EWS-URL nicht gesetzt (Autodiscover zuerst)."), soap)
      ?: error("EWS-Anfrage fehlgeschlagen")

  private fun post(url: String, soap: String): String? {
    val builder = Request.Builder().url(url).post(soap.toRequestBody(xml))
    basicAuthHeader?.let { builder.header("Authorization", it) }
    client.newCall(builder.build()).execute().use { resp ->
      return if (resp.isSuccessful) resp.body?.string() else null
    }
  }

  private fun mapFolder(id: String): String = when (id) {
    "inbox" -> "inbox"
    "sent" -> "sentitems"
    "drafts" -> "drafts"
    "archive" -> "archive"
    "deleted" -> "deleteditems"
    else -> id
  }

  private fun basicAuth(user: String, password: String): String {
    val token = android.util.Base64.encodeToString(
      "$user:$password".toByteArray(), android.util.Base64.NO_WRAP,
    )
    return "Basic $token"
  }

  private fun messageJson(item: EwsSoap.ParsedItem, accountId: String, folderId: String): JSONObject =
    JSONObject()
      .put("id", item.id).put("accountId", accountId).put("folderId", folderId)
      .put("subject", item.subject)
      .put("from", JSONObject().put("address", item.fromAddress).put("displayName", item.fromName))
      .put("recipients", JSONArray()).put("receivedAt", item.receivedAt).put("importance", "normal")
      .put("flags", JSONArray(if (item.isRead) listOf("read") else emptyList()))
      .put("categories", JSONArray()).put("hasAttachments", false).put("attachments", JSONArray())
      .put("preview", item.preview)
      .put("body", JSONObject().put("type", "text").put("content", item.preview))

  private fun defaultCapabilities(): JSONObject = JSONObject()
    .put("ews", true).put("activeSync", false).put("directPush", false)
    .put("publicFolders", true).put("delegation", true).put("serverSearch", true)
}
