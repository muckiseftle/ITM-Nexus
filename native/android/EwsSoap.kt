package de.itmtechnologies.nexus

import org.w3c.dom.Element
import org.xml.sax.InputSource
import java.io.StringReader
import javax.xml.parsers.DocumentBuilderFactory

/**
 * Bau von EWS-SOAP-Envelopes und Parsing der relevanten Antwortfelder.
 * Envelope-Templates vollständig; Response-Parsing deckt die Domänen-Kernfelder ab und wird
 * on-device gehärtet (Namespaces/Edge-Cases). Siehe docs/11-Native-und-App.md.
 */
object EwsSoap {
  private const val MESSAGES_NS = "http://schemas.microsoft.com/exchange/services/2006/messages"
  private const val TYPES_NS = "http://schemas.microsoft.com/exchange/services/2006/types"

  private fun envelope(body: String): String = """
    <?xml version="1.0" encoding="utf-8"?>
    <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
                   xmlns:m="$MESSAGES_NS" xmlns:t="$TYPES_NS">
      <soap:Header><t:RequestServerVersion Version="Exchange2013"/></soap:Header>
      <soap:Body>$body</soap:Body>
    </soap:Envelope>
  """.trimIndent()

  fun xmlEscape(s: String): String = s
    .replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;")

  // — Request-Envelopes —

  fun syncFolderItems(folderId: String, syncState: String?): String {
    val state = syncState?.let { "<m:SyncState>${xmlEscape(it)}</m:SyncState>" } ?: ""
    return envelope(
      """
      <m:SyncFolderItems>
        <m:ItemShape><t:BaseShape>IdOnly</t:BaseShape></m:ItemShape>
        <m:SyncFolderId><t:DistinguishedFolderId Id="${xmlEscape(folderId)}"/></m:SyncFolderId>
        $state
        <m:MaxChangesReturned>100</m:MaxChangesReturned>
      </m:SyncFolderItems>
      """.trimIndent(),
    )
  }

  fun getItems(ids: List<String>): String {
    val refs = ids.joinToString("") { "<t:ItemId Id=\"${xmlEscape(it)}\"/>" }
    return envelope(
      """
      <m:GetItem>
        <m:ItemShape><t:BaseShape>Default</t:BaseShape><t:BodyType>Text</t:BodyType></m:ItemShape>
        <m:ItemIds>$refs</m:ItemIds>
      </m:GetItem>
      """.trimIndent(),
    )
  }

  fun createItem(from: String, sender: String?, to: List<String>, subject: String, body: String): String {
    val recipients = to.joinToString("") {
      "<t:Mailbox><t:EmailAddress>${xmlEscape(it)}</t:EmailAddress></t:Mailbox>"
    }
    val senderXml = sender?.let {
      "<t:Sender><t:Mailbox><t:EmailAddress>${xmlEscape(it)}</t:EmailAddress></t:Mailbox></t:Sender>"
    } ?: ""
    return envelope(
      """
      <m:CreateItem MessageDisposition="SendAndSaveCopy">
        <m:Items>
          <t:Message>
            <t:Subject>${xmlEscape(subject)}</t:Subject>
            <t:Body BodyType="Text">${xmlEscape(body)}</t:Body>
            <t:ToRecipients>$recipients</t:ToRecipients>
            $senderXml
            <t:From><t:Mailbox><t:EmailAddress>${xmlEscape(from)}</t:EmailAddress></t:Mailbox></t:From>
          </t:Message>
        </m:Items>
      </m:CreateItem>
      """.trimIndent(),
    )
  }

  fun setIsRead(itemId: String, isRead: Boolean): String = envelope(
    """
    <m:UpdateItem ConflictResolution="AutoResolve" MessageDisposition="SaveOnly">
      <m:ItemChanges><t:ItemChange>
        <t:ItemId Id="${xmlEscape(itemId)}"/>
        <t:Updates><t:SetItemField>
          <t:FieldURI FieldURI="message:IsRead"/>
          <t:Message><t:IsRead>$isRead</t:IsRead></t:Message>
        </t:SetItemField></t:Updates>
      </t:ItemChange></m:ItemChanges>
    </m:UpdateItem>
    """.trimIndent(),
  )

  fun moveItem(itemId: String, toFolderId: String): String = envelope(
    """
    <m:MoveItem>
      <m:ToFolderId><t:DistinguishedFolderId Id="${xmlEscape(toFolderId)}"/></m:ToFolderId>
      <m:ItemIds><t:ItemId Id="${xmlEscape(itemId)}"/></m:ItemIds>
    </m:MoveItem>
    """.trimIndent(),
  )

  fun deleteItem(itemId: String): String = envelope(
    """
    <m:DeleteItem DeleteType="MoveToDeletedItems">
      <m:ItemIds><t:ItemId Id="${xmlEscape(itemId)}"/></m:ItemIds>
    </m:DeleteItem>
    """.trimIndent(),
  )

  fun findItem(folderId: String, query: String): String = envelope(
    """
    <m:FindItem Traversal="Shallow">
      <m:ItemShape><t:BaseShape>IdOnly</t:BaseShape></m:ItemShape>
      <m:ParentFolderIds><t:DistinguishedFolderId Id="${xmlEscape(folderId)}"/></m:ParentFolderIds>
      <m:QueryString>${xmlEscape(query)}</m:QueryString>
    </m:FindItem>
    """.trimIndent(),
  )

  // — Response-Parsing —

  data class ParsedItem(
    var id: String = "",
    var subject: String = "",
    var fromName: String = "",
    var fromAddress: String = "",
    var receivedAt: Double = 0.0,
    var isRead: Boolean = false,
    var preview: String = "",
  )

  private fun parse(xml: String) =
    DocumentBuilderFactory.newInstance().apply { isNamespaceAware = true }
      .newDocumentBuilder().parse(InputSource(StringReader(xml)))

  /** Sammelt alle ItemId-Werte (SyncFolderItems/FindItem). */
  fun extractItemIds(xml: String): List<String> {
    val doc = parse(xml)
    val nodes = doc.getElementsByTagNameNS(TYPES_NS, "ItemId")
    return (0 until nodes.length).mapNotNull { i ->
      (nodes.item(i) as? Element)?.getAttribute("Id")?.takeIf { it.isNotEmpty() }
    }
  }

  /** Parst eine GetItem-Antwort in ParsedItems. */
  fun parseItems(xml: String): List<ParsedItem> {
    val doc = parse(xml)
    val messages = doc.getElementsByTagNameNS(TYPES_NS, "Message")
    return (0 until messages.length).map { i ->
      val el = messages.item(i) as Element
      ParsedItem(
        id = (el.getElementsByTagNameNS(TYPES_NS, "ItemId").item(0) as? Element)?.getAttribute("Id") ?: "",
        subject = text(el, "Subject"),
        fromName = text(el, "Name"),
        fromAddress = text(el, "EmailAddress"),
        receivedAt = parseIso(text(el, "DateTimeReceived")),
        isRead = text(el, "IsRead") == "true",
        preview = text(el, "Body").take(140),
      )
    }
  }

  private fun text(el: Element, tag: String): String =
    (el.getElementsByTagNameNS(TYPES_NS, tag).item(0))?.textContent ?: ""

  private fun parseIso(s: String): Double = try {
    if (s.isEmpty()) 0.0 else java.time.Instant.parse(s).toEpochMilli().toDouble()
  } catch (e: Exception) {
    0.0
  }
}
