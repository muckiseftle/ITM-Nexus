import Foundation

/// Bau von EWS-SOAP-Envelopes und Parsing der relevanten Antwortfelder.
///
/// Die Envelope-Templates sind vollständig; das Response-Parsing deckt die für das
/// Domänenmodell (`MailMessage`) nötigen Kernfelder ab und wird on-device gehärtet
/// (Namespaces/Edge-Cases). Siehe docs/11-Native-und-App.md.
enum EwsSoap {
  static let messagesNS = "http://schemas.microsoft.com/exchange/services/2006/messages"
  static let typesNS = "http://schemas.microsoft.com/exchange/services/2006/types"

  private static func envelope(_ body: String) -> String {
    """
    <?xml version="1.0" encoding="utf-8"?>
    <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
                   xmlns:m="\(messagesNS)" xmlns:t="\(typesNS)">
      <soap:Header><t:RequestServerVersion Version="Exchange2013"/></soap:Header>
      <soap:Body>\(body)</soap:Body>
    </soap:Envelope>
    """
  }

  static func xmlEscape(_ s: String) -> String {
    s.replacingOccurrences(of: "&", with: "&amp;")
      .replacingOccurrences(of: "<", with: "&lt;")
      .replacingOccurrences(of: ">", with: "&gt;")
      .replacingOccurrences(of: "\"", with: "&quot;")
  }

  // MARK: Request-Envelopes

  /// Baut eine DistinguishedFolderId — optional mit `<t:Mailbox>`-Targeting für ein FREMDES
  /// (freigegebenes) Postfach. Der Server erzwingt die Zugriffsrechte: ohne Delegation/Recht
  /// antwortet EWS mit `ErrorAccessDenied` — clientseitig ist kein Umgehen möglich.
  static func distinguishedFolder(_ id: String, mailbox: String? = nil) -> String {
    if let mb = mailbox, !mb.isEmpty {
      return "<t:DistinguishedFolderId Id=\"\(xmlEscape(id))\">"
        + "<t:Mailbox><t:EmailAddress>\(xmlEscape(mb))</t:EmailAddress></t:Mailbox>"
        + "</t:DistinguishedFolderId>"
    }
    return "<t:DistinguishedFolderId Id=\"\(xmlEscape(id))\"/>"
  }

  /// GetFolder als Zugriffs-/Berechtigungsprobe (für ein eigenes oder freigegebenes Postfach).
  static func getFolder(distinguished: String, mailbox: String? = nil) -> String {
    envelope("""
      <m:GetFolder>
        <m:FolderShape><t:BaseShape>Default</t:BaseShape></m:FolderShape>
        <m:FolderIds>\(distinguishedFolder(distinguished, mailbox: mailbox))</m:FolderIds>
      </m:GetFolder>
    """)
  }

  static func syncFolderItems(folderId: String, syncState: String?, mailbox: String? = nil) -> String {
    let state = syncState.map { "<m:SyncState>\(xmlEscape($0))</m:SyncState>" } ?? ""
    return envelope("""
      <m:SyncFolderItems>
        <m:ItemShape><t:BaseShape>IdOnly</t:BaseShape></m:ItemShape>
        <m:SyncFolderId>\(distinguishedFolder(folderId, mailbox: mailbox))</m:SyncFolderId>
        \(state)
        <m:MaxChangesReturned>100</m:MaxChangesReturned>
      </m:SyncFolderItems>
    """)
  }

  static func getItems(ids: [String]) -> String {
    let refs = ids.map { "<t:ItemId Id=\"\(xmlEscape($0))\"/>" }.joined()
    return envelope("""
      <m:GetItem>
        <m:ItemShape>
          <t:BaseShape>Default</t:BaseShape>
          <t:BodyType>HTML</t:BodyType>
          <t:AdditionalProperties>
            <t:FieldURI FieldURI="item:Attachments"/>
            <t:FieldURI FieldURI="item:HasAttachments"/>
          </t:AdditionalProperties>
        </m:ItemShape>
        <m:ItemIds>\(refs)</m:ItemIds>
      </m:GetItem>
    """)
  }

  /// GetItem für den LISTEN-Sync: Metadaten + Anhang-Infos + **Text-Body** (KEIN HTML).
  ///
  /// Bewusst kein `BodyType=HTML`: HTML-Mails enthalten oft eingebettete Bilder als
  /// `data:`-Base64 (mehrere MB je Mail). Beim Sync von bis zu 100 Mails würde dieser Inhalt
  /// gleich mehrfach gleichzeitig im Speicher liegen (nativ → JSON-String → JS → erneut JSON →
  /// SQLite) und iOS killt den Prozess (Jetsam, oft OHNE Crash-Report). Der Text-Body ist klein
  /// und reicht für Vorschau/Liste/Suche. Der reiche HTML-Body wird erst beim Öffnen einzeln
  /// nachgeladen (`getItems`/`getMessage`) und lokal gecacht.
  static func getItemsSync(ids: [String]) -> String {
    let refs = ids.map { "<t:ItemId Id=\"\(xmlEscape($0))\"/>" }.joined()
    return envelope("""
      <m:GetItem>
        <m:ItemShape>
          <t:BaseShape>Default</t:BaseShape>
          <t:BodyType>Text</t:BodyType>
          <t:AdditionalProperties>
            <t:FieldURI FieldURI="item:Attachments"/>
            <t:FieldURI FieldURI="item:HasAttachments"/>
          </t:AdditionalProperties>
        </m:ItemShape>
        <m:ItemIds>\(refs)</m:ItemIds>
      </m:GetItem>
    """)
  }

  /// GetItem nur mit Id-/Text-Shape (für Kalender/Kontakte, ohne HTML/Anhänge).
  static func getItemsLight(ids: [String]) -> String {
    let refs = ids.map { "<t:ItemId Id=\"\(xmlEscape($0))\"/>" }.joined()
    return envelope("""
      <m:GetItem>
        <m:ItemShape><t:BaseShape>Default</t:BaseShape><t:BodyType>Text</t:BodyType></m:ItemShape>
        <m:ItemIds>\(refs)</m:ItemIds>
      </m:GetItem>
    """)
  }

  /// Vollständige Kontaktfelder (AllProperties) — für Detailansicht/Sync inkl. Telefon/Position.
  static func getContacts(ids: [String]) -> String {
    let refs = ids.map { "<t:ItemId Id=\"\(xmlEscape($0))\"/>" }.joined()
    return envelope("""
      <m:GetItem>
        <m:ItemShape><t:BaseShape>AllProperties</t:BaseShape><t:BodyType>Text</t:BodyType></m:ItemShape>
        <m:ItemIds>\(refs)</m:ItemIds>
      </m:GetItem>
    """)
  }

  /// Lädt den Inhalt eines Anhangs (Base64) über EWS GetAttachment.
  static func getAttachment(id: String) -> String {
    envelope("""
      <m:GetAttachment>
        <m:AttachmentIds><t:AttachmentId Id="\(xmlEscape(id))"/></m:AttachmentIds>
      </m:GetAttachment>
    """)
  }

  static func createItem(
    from: String,
    sender: String?,
    to: [String],
    cc: [String],
    bcc: [String],
    subject: String,
    body: String,
    attachments: [(name: String, contentType: String, base64: String)] = [],
    disposition: String = "SendAndSaveCopy",
    savedFolder: String? = nil
  ) -> String {
    // Hinweis: Bewusst mit explizitem String-Aufbau (var/+=) statt großer verschachtelter
    // Ausdrücke — der Swift-Typechecker bricht bei langen Interpolations-/+-Ketten sonst ab
    // („unable to type-check this expression in reasonable time").
    func mailboxes(_ addresses: [String]) -> String {
      var out = ""
      for a in addresses {
        out += "<t:Mailbox><t:EmailAddress>" + xmlEscape(a) + "</t:EmailAddress></t:Mailbox>"
      }
      return out
    }
    // Cc/Bcc nur ausgeben, wenn vorhanden — leere Recipient-Container vermeiden.
    let ccXml = cc.isEmpty ? "" : "<t:CcRecipients>" + mailboxes(cc) + "</t:CcRecipients>"
    let bccXml = bcc.isEmpty ? "" : "<t:BccRecipients>" + mailboxes(bcc) + "</t:BccRecipients>"
    var senderXml = ""
    if let s = sender {
      senderXml = "<t:Sender><t:Mailbox><t:EmailAddress>" + xmlEscape(s)
        + "</t:EmailAddress></t:Mailbox></t:Sender>"
    }
    // FileAttachments inline (EWS-Schemareihenfolge: nach <t:Body>, vor den Empfängern). Der
    // Base64-Content braucht KEIN XML-Escaping (nur [A-Za-z0-9+/=]).
    var attachXml = ""
    if !attachments.isEmpty {
      attachXml = "<t:Attachments>"
      for a in attachments {
        attachXml += "<t:FileAttachment><t:Name>" + xmlEscape(a.name) + "</t:Name>"
        attachXml += "<t:ContentType>" + xmlEscape(a.contentType) + "</t:ContentType>"
        attachXml += "<t:Content>" + a.base64 + "</t:Content></t:FileAttachment>"
      }
      attachXml += "</t:Attachments>"
    }
    // Zielordner (z. B. Entwürfe beim SaveOnly) — vor <m:Items> laut Schema.
    var savedXml = ""
    if let folder = savedFolder {
      savedXml = "<m:SavedItemFolderId>" + distinguishedFolder(folder) + "</m:SavedItemFolderId>"
    }
    let toXml = "<t:ToRecipients>" + mailboxes(to) + "</t:ToRecipients>"
    let fromXml = "<t:From><t:Mailbox><t:EmailAddress>" + xmlEscape(from)
      + "</t:EmailAddress></t:Mailbox></t:From>"
    let subjectXml = "<t:Subject>" + xmlEscape(subject) + "</t:Subject>"
    let bodyXml = "<t:Body BodyType=\"Text\">" + xmlEscape(body) + "</t:Body>"

    var message = "<t:Message>"
    message += subjectXml
    message += bodyXml
    message += attachXml
    message += toXml
    message += ccXml
    message += bccXml
    message += senderXml
    message += fromXml
    message += "</t:Message>"

    var create = "<m:CreateItem MessageDisposition=\"" + xmlEscape(disposition) + "\">"
    create += savedXml
    create += "<m:Items>" + message + "</m:Items>"
    create += "</m:CreateItem>"
    return envelope(create)
  }

  static func setIsRead(itemId: String, isRead: Bool) -> String {
    envelope("""
      <m:UpdateItem ConflictResolution="AutoResolve" MessageDisposition="SaveOnly">
        <m:ItemChanges>
          <t:ItemChange>
            <t:ItemId Id="\(xmlEscape(itemId))"/>
            <t:Updates>
              <t:SetItemField>
                <t:FieldURI FieldURI="message:IsRead"/>
                <t:Message><t:IsRead>\(isRead ? "true" : "false")</t:IsRead></t:Message>
              </t:SetItemField>
            </t:Updates>
          </t:ItemChange>
        </m:ItemChanges>
      </m:UpdateItem>
    """)
  }

  static func moveItem(itemId: String, toFolderId: String) -> String {
    envelope("""
      <m:MoveItem>
        <m:ToFolderId><t:DistinguishedFolderId Id="\(xmlEscape(toFolderId))"/></m:ToFolderId>
        <m:ItemIds><t:ItemId Id="\(xmlEscape(itemId))"/></m:ItemIds>
      </m:MoveItem>
    """)
  }

  static func deleteItem(itemId: String) -> String {
    envelope("""
      <m:DeleteItem DeleteType="MoveToDeletedItems">
        <m:ItemIds><t:ItemId Id="\(xmlEscape(itemId))"/></m:ItemIds>
      </m:DeleteItem>
    """)
  }

  /// Felder eines Kontakts (für Erstellen/Bearbeiten). Leere Strings = Feld weglassen.
  struct ContactFields {
    var displayName = ""
    var givenName = ""
    var surname = ""
    var company = ""
    var jobTitle = ""
    var email = ""
    var mobilePhone = ""
    var businessPhone = ""
    var homePhone = ""
    var notes = ""
  }

  /// CreateItem für einen Kontakt im Standard-Kontakteordner. WICHTIG: Die EWS-Schema-Reihenfolge
  /// der Contact-Felder ist verbindlich (Body, FileAs, DisplayName, GivenName, CompanyName,
  /// EmailAddresses, PhoneNumbers, JobTitle, Surname) — sonst lehnt der Server mit Schemafehler ab.
  static func createContact(_ c: ContactFields) -> String {
    var phones = ""
    if !c.mobilePhone.isEmpty {
      phones += "<t:Entry Key=\"MobilePhone\">" + xmlEscape(c.mobilePhone) + "</t:Entry>"
    }
    if !c.businessPhone.isEmpty {
      phones += "<t:Entry Key=\"BusinessPhone\">" + xmlEscape(c.businessPhone) + "</t:Entry>"
    }
    if !c.homePhone.isEmpty {
      phones += "<t:Entry Key=\"HomePhone\">" + xmlEscape(c.homePhone) + "</t:Entry>"
    }
    var body = "<t:Contact>"
    if !c.notes.isEmpty {
      body += "<t:Body BodyType=\"Text\">" + xmlEscape(c.notes) + "</t:Body>"
    }
    if !c.displayName.isEmpty {
      body += "<t:FileAs>" + xmlEscape(c.displayName) + "</t:FileAs>"
      body += "<t:DisplayName>" + xmlEscape(c.displayName) + "</t:DisplayName>"
    }
    if !c.givenName.isEmpty { body += "<t:GivenName>" + xmlEscape(c.givenName) + "</t:GivenName>" }
    if !c.company.isEmpty { body += "<t:CompanyName>" + xmlEscape(c.company) + "</t:CompanyName>" }
    if !c.email.isEmpty {
      body += "<t:EmailAddresses><t:Entry Key=\"EmailAddress1\">" + xmlEscape(c.email)
        + "</t:Entry></t:EmailAddresses>"
    }
    if !phones.isEmpty { body += "<t:PhoneNumbers>" + phones + "</t:PhoneNumbers>" }
    if !c.jobTitle.isEmpty { body += "<t:JobTitle>" + xmlEscape(c.jobTitle) + "</t:JobTitle>" }
    if !c.surname.isEmpty { body += "<t:Surname>" + xmlEscape(c.surname) + "</t:Surname>" }
    body += "</t:Contact>"
    var create = "<m:CreateItem>"
    create += "<m:SavedItemFolderId>" + distinguishedFolder("contacts") + "</m:SavedItemFolderId>"
    create += "<m:Items>" + body + "</m:Items>"
    create += "</m:CreateItem>"
    return envelope(create)
  }

  /// Einzelnes SetItemField für ein einfaches Contact-Feld (FieldURI).
  private static func setContactField(_ uri: String, _ inner: String) -> String {
    var s = "<t:SetItemField><t:FieldURI FieldURI=\"" + uri + "\"/>"
    s += "<t:Contact>" + inner + "</t:Contact></t:SetItemField>"
    return s
  }

  /// SetItemField für ein indiziertes Feld (E-Mail/Telefon).
  private static func setIndexed(_ uri: String, _ index: String, _ inner: String) -> String {
    var s = "<t:SetItemField><t:IndexedFieldURI FieldURI=\"" + uri
    s += "\" FieldIndex=\"" + index + "\"/>"
    s += "<t:Contact>" + inner + "</t:Contact></t:SetItemField>"
    return s
  }

  /// UpdateItem für einen Kontakt: setzt die übergebenen (nicht-leeren) Felder. Geleerte Felder
  /// werden in dieser Version nicht gelöscht (nur gesetzte Werte aktualisiert).
  static func updateContact(itemId: String, _ c: ContactFields) -> String {
    var updates = ""
    if !c.notes.isEmpty {
      updates += setContactField("item:Body", "<t:Body BodyType=\"Text\">"
        + xmlEscape(c.notes) + "</t:Body>")
    }
    if !c.displayName.isEmpty {
      updates += setContactField("contacts:DisplayName",
        "<t:DisplayName>" + xmlEscape(c.displayName) + "</t:DisplayName>")
    }
    if !c.givenName.isEmpty {
      updates += setContactField("contacts:GivenName",
        "<t:GivenName>" + xmlEscape(c.givenName) + "</t:GivenName>")
    }
    if !c.surname.isEmpty {
      updates += setContactField("contacts:Surname",
        "<t:Surname>" + xmlEscape(c.surname) + "</t:Surname>")
    }
    if !c.company.isEmpty {
      updates += setContactField("contacts:CompanyName",
        "<t:CompanyName>" + xmlEscape(c.company) + "</t:CompanyName>")
    }
    if !c.jobTitle.isEmpty {
      updates += setContactField("contacts:JobTitle",
        "<t:JobTitle>" + xmlEscape(c.jobTitle) + "</t:JobTitle>")
    }
    if !c.email.isEmpty {
      updates += setIndexed("contacts:EmailAddress", "EmailAddress1",
        "<t:EmailAddresses><t:Entry Key=\"EmailAddress1\">" + xmlEscape(c.email)
          + "</t:Entry></t:EmailAddresses>")
    }
    if !c.mobilePhone.isEmpty {
      updates += setIndexed("contacts:PhoneNumber", "MobilePhone",
        "<t:PhoneNumbers><t:Entry Key=\"MobilePhone\">" + xmlEscape(c.mobilePhone)
          + "</t:Entry></t:PhoneNumbers>")
    }
    if !c.businessPhone.isEmpty {
      updates += setIndexed("contacts:PhoneNumber", "BusinessPhone",
        "<t:PhoneNumbers><t:Entry Key=\"BusinessPhone\">" + xmlEscape(c.businessPhone)
          + "</t:Entry></t:PhoneNumbers>")
    }
    if !c.homePhone.isEmpty {
      updates += setIndexed("contacts:PhoneNumber", "HomePhone",
        "<t:PhoneNumbers><t:Entry Key=\"HomePhone\">" + xmlEscape(c.homePhone)
          + "</t:Entry></t:PhoneNumbers>")
    }
    var update = "<m:UpdateItem ConflictResolution=\"AutoResolve\">"
    update += "<m:ItemChanges><t:ItemChange><t:ItemId Id=\"" + xmlEscape(itemId) + "\"/>"
    update += "<t:Updates>" + updates + "</t:Updates></t:ItemChange></m:ItemChanges>"
    update += "</m:UpdateItem>"
    return envelope(update)
  }

  // MARK: Kalender (Termine erstellen/ändern/löschen/antworten)

  /// ISO-8601-UTC-String aus Millisekunden (EWS-Datums-/Zeitformat).
  static func isoString(_ ms: Double) -> String {
    let f = ISO8601DateFormatter()
    f.timeZone = TimeZone(identifier: "UTC")
    return f.string(from: Date(timeIntervalSince1970: ms / 1000.0))
  }

  /// Felder eines Termins (Erstellen/Bearbeiten).
  struct CalendarFields {
    var subject = ""
    var start: Double = 0
    var end: Double = 0
    var isAllDay = false
    var location = ""
    var notes = ""
    var attendees: [String] = []
  }

  private static func attendeesXml(_ addrs: [String]) -> String {
    if addrs.isEmpty { return "" }
    var out = "<t:RequiredAttendees>"
    for a in addrs {
      out += "<t:Attendee><t:Mailbox><t:EmailAddress>" + xmlEscape(a)
        + "</t:EmailAddress></t:Mailbox></t:Attendee>"
    }
    out += "</t:RequiredAttendees>"
    return out
  }

  /// CreateItem für einen Termin. Reihenfolge der CalendarItem-Felder ist schemaverbindlich
  /// (Subject, Body, Start, End, IsAllDayEvent, Location, RequiredAttendees).
  static func createCalendarItem(_ c: CalendarFields) -> String {
    let send = c.attendees.isEmpty ? "SendToNone" : "SendToAllAndSaveCopy"
    var item = "<t:CalendarItem>"
    item += "<t:Subject>" + xmlEscape(c.subject) + "</t:Subject>"
    if !c.notes.isEmpty {
      item += "<t:Body BodyType=\"Text\">" + xmlEscape(c.notes) + "</t:Body>"
    }
    item += "<t:Start>" + isoString(c.start) + "</t:Start>"
    item += "<t:End>" + isoString(c.end) + "</t:End>"
    item += "<t:IsAllDayEvent>" + (c.isAllDay ? "true" : "false") + "</t:IsAllDayEvent>"
    if !c.location.isEmpty { item += "<t:Location>" + xmlEscape(c.location) + "</t:Location>" }
    item += attendeesXml(c.attendees)
    item += "</t:CalendarItem>"
    var create = "<m:CreateItem SendMeetingInvitations=\"" + send + "\">"
    create += "<m:SavedItemFolderId>" + distinguishedFolder("calendar") + "</m:SavedItemFolderId>"
    create += "<m:Items>" + item + "</m:Items>"
    create += "</m:CreateItem>"
    return envelope(create)
  }

  private static func setCalField(_ uri: String, _ inner: String) -> String {
    var s = "<t:SetItemField><t:FieldURI FieldURI=\"" + uri + "\"/>"
    s += "<t:CalendarItem>" + inner + "</t:CalendarItem></t:SetItemField>"
    return s
  }

  /// UpdateItem für einen Termin (gesetzte Felder). `changeKey` falls vorhanden für Konsistenz.
  static func updateCalendarItem(itemId: String, changeKey: String, _ c: CalendarFields) -> String {
    var updates = ""
    if !c.subject.isEmpty {
      updates += setCalField("item:Subject", "<t:Subject>" + xmlEscape(c.subject) + "</t:Subject>")
    }
    if !c.notes.isEmpty {
      updates += setCalField("item:Body",
        "<t:Body BodyType=\"Text\">" + xmlEscape(c.notes) + "</t:Body>")
    }
    updates += setCalField("calendar:Start", "<t:Start>" + isoString(c.start) + "</t:Start>")
    updates += setCalField("calendar:End", "<t:End>" + isoString(c.end) + "</t:End>")
    updates += setCalField("calendar:IsAllDayEvent",
      "<t:IsAllDayEvent>" + (c.isAllDay ? "true" : "false") + "</t:IsAllDayEvent>")
    if !c.location.isEmpty {
      updates += setCalField("calendar:Location",
        "<t:Location>" + xmlEscape(c.location) + "</t:Location>")
    }
    let ck = changeKey.isEmpty ? "" : " ChangeKey=\"" + xmlEscape(changeKey) + "\""
    var update = "<m:UpdateItem ConflictResolution=\"AutoResolve\""
    update += " SendMeetingInvitationsOrCancellations=\"SendToAllAndSaveCopy\">"
    update += "<m:ItemChanges><t:ItemChange><t:ItemId Id=\"" + xmlEscape(itemId) + "\"" + ck + "/>"
    update += "<t:Updates>" + updates + "</t:Updates></t:ItemChange></m:ItemChanges>"
    update += "</m:UpdateItem>"
    return envelope(update)
  }

  /// DeleteItem für einen Termin; bei Besprechungen Absagen an die Teilnehmer senden.
  static func deleteCalendarItem(itemId: String, isMeeting: Bool) -> String {
    let cancel = isMeeting ? "SendToAllAndSaveCopy" : "SendToNone"
    return envelope("""
      <m:DeleteItem DeleteType="MoveToDeletedItems" SendMeetingCancellations="\(cancel)">
        <m:ItemIds><t:ItemId Id="\(xmlEscape(itemId))"/></m:ItemIds>
      </m:DeleteItem>
    """)
  }

  /// Besprechungseinladung beantworten: AcceptItem/DeclineItem/TentativelyAcceptItem.
  /// `responseType` ∈ {accept, decline, tentative}. Referenziert das Kalender-/Einladungs-Item.
  static func meetingResponse(itemId: String, changeKey: String, responseType: String) -> String {
    let element: String
    switch responseType {
    case "decline": element = "DeclineItem"
    case "tentative": element = "TentativelyAcceptItem"
    default: element = "AcceptItem"
    }
    let ck = changeKey.isEmpty ? "" : " ChangeKey=\"" + xmlEscape(changeKey) + "\""
    var create = "<m:CreateItem MessageDisposition=\"SendAndSaveCopy\">"
    create += "<m:Items><t:" + element + ">"
    create += "<t:ReferenceItemId Id=\"" + xmlEscape(itemId) + "\"" + ck + "/>"
    create += "</t:" + element + "></m:Items>"
    create += "</m:CreateItem>"
    return envelope(create)
  }

  /// Volle Termin-Felder (AllProperties) — für Detailansicht/Sync inkl. Antwortstatus/Notiz.
  static func getCalendarItems(ids: [String]) -> String {
    let refs = ids.map { "<t:ItemId Id=\"\(xmlEscape($0))\"/>" }.joined()
    return envelope("""
      <m:GetItem>
        <m:ItemShape><t:BaseShape>AllProperties</t:BaseShape><t:BodyType>Text</t:BodyType></m:ItemShape>
        <m:ItemIds>\(refs)</m:ItemIds>
      </m:GetItem>
    """)
  }

  static func findItem(folderId: String, query: String, mailbox: String? = nil) -> String {
    // QueryString nur ausgeben, wenn vorhanden (leeres AQS-Element kann EWS ablehnen).
    let queryXml = query.isEmpty ? "" : "<m:QueryString>\(xmlEscape(query))</m:QueryString>"
    return envelope("""
      <m:FindItem Traversal="Shallow">
        <m:ItemShape><t:BaseShape>IdOnly</t:BaseShape></m:ItemShape>
        <m:ParentFolderIds>\(distinguishedFolder(folderId, mailbox: mailbox))</m:ParentFolderIds>
        \(queryXml)
      </m:FindItem>
    """)
  }

  static func setFlag(itemId: String, flagged: Bool) -> String {
    let status = flagged ? "Flagged" : "NotFlagged"
    return envelope("""
      <m:UpdateItem ConflictResolution="AutoResolve" MessageDisposition="SaveOnly">
        <m:ItemChanges><t:ItemChange>
          <t:ItemId Id="\(xmlEscape(itemId))"/>
          <t:Updates><t:SetItemField>
            <t:FieldURI FieldURI="item:Flag"/>
            <t:Item><t:Flag><t:FlagStatus>\(status)</t:FlagStatus></t:Flag></t:Item>
          </t:SetItemField></t:Updates>
        </t:ItemChange></m:ItemChanges>
      </m:UpdateItem>
    """)
  }

  static func setCategories(itemId: String, categories: [String]) -> String {
    let strings = categories.map { "<t:String>\(xmlEscape($0))</t:String>" }.joined()
    return envelope("""
      <m:UpdateItem ConflictResolution="AutoResolve" MessageDisposition="SaveOnly">
        <m:ItemChanges><t:ItemChange>
          <t:ItemId Id="\(xmlEscape(itemId))"/>
          <t:Updates><t:SetItemField>
            <t:FieldURI FieldURI="item:Categories"/>
            <t:Item><t:Categories>\(strings)</t:Categories></t:Item>
          </t:SetItemField></t:Updates>
        </t:ItemChange></m:ItemChanges>
      </m:UpdateItem>
    """)
  }

  static func findFolders(mailbox: String? = nil) -> String {
    envelope("""
      <m:FindFolder Traversal="Deep">
        <m:FolderShape><t:BaseShape>Default</t:BaseShape></m:FolderShape>
        <m:ParentFolderIds>\(distinguishedFolder("msgfolderroot", mailbox: mailbox))</m:ParentFolderIds>
      </m:FindFolder>
    """)
  }

  // MARK: EWS-Antwort-Status (für Berechtigungsprüfung)

  /// Erste `<m:ResponseCode>` aus einer EWS-Antwort (z. B. „NoError", „ErrorAccessDenied").
  static func responseCode(_ xml: Data) -> String? {
    guard let s = String(data: xml, encoding: .utf8),
      let open = s.range(of: "ResponseCode>")
    else { return nil }
    let rest = s[open.upperBound...]
    guard let close = rest.range(of: "<") else { return nil }
    return String(rest[..<close.lowerBound]).trimmingCharacters(in: .whitespacesAndNewlines)
  }

  /// True, wenn die EWS-Antwort erfolgreich war (ResponseClass="Success" bzw. NoError).
  static func isSuccess(_ xml: Data) -> Bool {
    if let s = String(data: xml, encoding: .utf8), s.contains("ResponseClass=\"Success\"") {
      return true
    }
    return responseCode(xml) == "NoError"
  }

  static func syncFolderItemsIdOnly(distinguished: String, syncState: String?) -> String {
    syncFolderItems(folderId: distinguished, syncState: syncState)
  }

  // MARK: weitere Parser

  struct ParsedFolder {
    var id = ""
    var parentId = ""
    var displayName = ""
    var unread = 0
    var total = 0
  }

  /// Startet einen XMLParser mit AKTIVIERTER Namespace-Verarbeitung.
  ///
  /// ENTSCHEIDEND: EWS-Antworten sind namespace-präfixiert (`<t:ItemId>`, `<t:Message>`, `<m:…>`).
  /// Ohne `shouldProcessNamespaces = true` liefert `didStartElement` den QUALIFIZIERTEN Namen
  /// („t:ItemId") statt des lokalen („ItemId"). Unsere Delegates vergleichen mit lokalen Namen —
  /// ohne diese Option matcht NICHTS und der Sync liefert leere Ergebnisse (keine Mails/Kalender/
  /// Kontakte/Ordner), obwohl die Anmeldung (HTTP 200) erfolgreich war.
  private static func runParser(_ xml: Data, _ delegate: XMLParserDelegate) {
    let xp = XMLParser(data: xml)
    xp.shouldProcessNamespaces = true
    xp.delegate = delegate
    xp.parse()
  }

  static func parseFolders(_ xml: Data) -> [ParsedFolder] {
    let parser = FolderParser()
    runParser(xml, parser)
    return parser.folders
  }

  struct ParsedEvent {
    var id = ""
    var changeKey = ""
    var subject = ""
    var start: Double = 0
    var end: Double = 0
    var location = ""
    var organizer = ""
    var isAllDay = false
    var isMeeting = false
    var isCancelled = false
    var myResponse = ""
    var notes = ""
  }

  static func parseEvents(_ xml: Data) -> [ParsedEvent] {
    let parser = EventParser()
    runParser(xml, parser)
    return parser.events
  }

  struct ParsedContact {
    var id = ""
    var displayName = ""
    var email = ""
    var givenName = ""
    var surname = ""
    var company = ""
    var jobTitle = ""
    var mobilePhone = ""
    var businessPhone = ""
    var homePhone = ""
    var notes = ""
  }

  static func parseContacts(_ xml: Data) -> [ParsedContact] {
    let parser = ContactParser()
    runParser(xml, parser)
    return parser.contacts
  }

  static func iso(_ s: String) -> Double {
    (ISO8601DateFormatter().date(from: s)?.timeIntervalSince1970 ?? 0) * 1000
  }

  // MARK: Response-Parsing (Kernfelder)

  struct ParsedAttachment {
    var id = ""
    var name = ""
    var contentType = "application/octet-stream"
    var size = 0
    var isInline = false
  }

  struct ParsedItem {
    var id = ""
    var subject = ""
    var fromName = ""
    var fromAddress = ""
    var receivedAt: Double = 0
    var isRead = false
    var preview = ""
    var body = ""
    var bodyHtml = false
    var hasAttachments = false
    var attachments: [ParsedAttachment] = []
    /// Empfänger als [["kind","name","address"]] (kind: "to"/"cc") — für Reply-All/Weiterleiten.
    var recipients: [[String: String]] = []
  }

  struct ParsedAttachmentContent {
    var name = ""
    var contentType = "application/octet-stream"
    var base64 = ""
    var size = 0
  }

  /// Ergebnis eines SyncFolderItems-Deltas: zu holende (Create/Update), zu löschende IDs und
  /// ob die letzte Änderung im Bereich enthalten war (`false` ⇒ weitere Seiten verfügbar).
  struct SyncChanges {
    var upsertIds: [String] = []
    var deletedIds: [String] = []
    var includesLast = true
  }

  /// Parst die Änderungsblöcke (`Create`/`Update`/`Delete`/`ReadFlagChange`) einer
  /// SyncFolderItems-Antwort inkl. `IncludesLastItemInRange`.
  static func parseSyncChanges(_ xml: Data) -> SyncChanges {
    let p = SyncChangesParser()
    runParser(xml, p)
    return p.result
  }

  /// Extrahiert `ItemId`-Werte aus einer SyncFolderItems/FindItem-Antwort.
  static func extractItemIds(_ xml: Data) -> [String] {
    let parser = ItemIdParser()
    runParser(xml, parser)
    return parser.ids
  }

  /// Liest den neuen `<m:SyncState>` aus einer SyncFolderItems-Antwort (Delta-Cursor).
  static func extractSyncState(_ xml: Data) -> String? {
    let p = SyncStateParser()
    runParser(xml, p)
    return p.state.isEmpty ? nil : p.state
  }

  /// Parst eine GetAttachment-Antwort (erster FileAttachment-Inhalt als Base64).
  static func parseAttachmentContent(_ xml: Data) -> ParsedAttachmentContent {
    let p = AttachmentContentParser()
    runParser(xml, p)
    return p.result
  }

  /// Parst eine GetItem-Antwort in `ParsedItem`s.
  static func parseItems(_ xml: Data) -> [ParsedItem] {
    let parser = ItemParser()
    runParser(xml, parser)
    return parser.items
  }
}

/// Sammelt `<t:ItemId Id="...">`-Attribute.
private final class ItemIdParser: NSObject, XMLParserDelegate {
  var ids: [String] = []
  func parser(_ parser: XMLParser, didStartElement name: String, namespaceURI: String?,
              qualifiedName: String?, attributes attrs: [String: String]) {
    if name == "ItemId", let id = attrs["Id"] { ids.append(id) }
  }
}

/// GetItem-Parser für Kernfelder inkl. HTML-Body, Datei-Anhängen (Metadaten) und Empfängern.
private final class ItemParser: NSObject, XMLParserDelegate {
  var items: [EwsSoap.ParsedItem] = []
  private var current: EwsSoap.ParsedItem?
  private var text = ""
  private var bodyType = "Text"
  private var inAttachment = false
  private var curAtt: EwsSoap.ParsedAttachment?
  // Empfänger-/Absender-Kontext: From gewinnt für `from`, To/Cc sammeln Mailboxen.
  private var inFrom = false
  private var inTo = false
  private var inCc = false
  private var mbName = ""
  private var mbAddr = ""

  private static func stripHtml(_ s: String) -> String {
    s.replacingOccurrences(of: "<[^>]+>", with: " ", options: .regularExpression)
      .replacingOccurrences(of: "&nbsp;", with: " ")
      .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
      .trimmingCharacters(in: .whitespacesAndNewlines)
  }

  func parser(_ parser: XMLParser, didStartElement name: String, namespaceURI: String?,
              qualifiedName: String?, attributes attrs: [String: String]) {
    text = ""
    switch name {
    case "Message", "Item", "MeetingRequest": current = EwsSoap.ParsedItem()
    case "ItemId": if !inAttachment, let id = attrs["Id"] { current?.id = id }
    case "Body": bodyType = attrs["BodyType"] ?? "Text"
    case "FileAttachment", "ItemAttachment": inAttachment = true; curAtt = EwsSoap.ParsedAttachment()
    case "AttachmentId": if inAttachment, let id = attrs["Id"] { curAtt?.id = id }
    case "From": inFrom = true
    case "ToRecipients": inTo = true
    case "CcRecipients": inCc = true
    case "Mailbox": mbName = ""; mbAddr = ""
    default: break
    }
  }

  func parser(_ parser: XMLParser, foundCharacters string: String) { text += string }

  func parser(_ parser: XMLParser, didEndElement name: String, namespaceURI: String?,
              qualifiedName: String?) {
    switch name {
    case "Subject": if !inAttachment { current?.subject = text }
    case "Name":
      if inAttachment { curAtt?.name = text } else if inTo || inCc { mbName = text } else if inFrom { current?.fromName = text } else if current?.fromName.isEmpty == true { current?.fromName = text }
    case "EmailAddress":
      if inTo || inCc {
        mbAddr = text
      } else if inFrom {
        current?.fromAddress = text  // From gewinnt (überschreibt evtl. Sender)
      } else if !inAttachment, current?.fromAddress.isEmpty == true {
        current?.fromAddress = text  // Fallback (z. B. Sender, falls From fehlt)
      }
    case "Mailbox":
      if inTo {
        current?.recipients.append(["kind": "to", "name": mbName, "address": mbAddr])
      } else if inCc {
        current?.recipients.append(["kind": "cc", "name": mbName, "address": mbAddr])
      }
      mbName = ""
      mbAddr = ""
    case "From": inFrom = false
    case "ToRecipients": inTo = false
    case "CcRecipients": inCc = false
    case "DateTimeReceived":
      current?.receivedAt = (ISO8601DateFormatter().date(from: text)?.timeIntervalSince1970 ?? 0) * 1000
    case "IsRead": current?.isRead = (text == "true")
    case "HasAttachments": current?.hasAttachments = (text == "true")
    case "ContentType": if inAttachment { curAtt?.contentType = text }
    case "Size": if inAttachment { curAtt?.size = Int(text) ?? 0 }
    case "IsInline": if inAttachment { curAtt?.isInline = (text == "true") }
    case "Body":
      current?.body = text
      current?.bodyHtml = (bodyType == "HTML")
      current?.preview = String((bodyType == "HTML" ? Self.stripHtml(text) : text).prefix(140))
    case "FileAttachment", "ItemAttachment":
      if let a = curAtt { current?.attachments.append(a) }
      inAttachment = false
      curAtt = nil
    case "Message", "Item", "MeetingRequest":
      if let item = current { items.append(item); current = nil }
    default: break
    }
    text = ""
  }
}

/// Trennt Create/Update (zu holen) von Delete (zu entfernen) und liest IncludesLastItemInRange.
private final class SyncChangesParser: NSObject, XMLParserDelegate {
  var result = EwsSoap.SyncChanges()
  private var changeKind = ""  // "", "upsert", "delete"
  private var captureLast = false
  private var text = ""

  func parser(_ p: XMLParser, didStartElement name: String, namespaceURI: String?,
              qualifiedName: String?, attributes attrs: [String: String]) {
    switch name {
    case "Create", "Update", "ReadFlagChange": changeKind = "upsert"
    case "Delete": changeKind = "delete"
    case "ItemId":
      if let id = attrs["Id"] {
        if changeKind == "delete" {
          result.deletedIds.append(id)
        } else if changeKind == "upsert" {
          result.upsertIds.append(id)
        }
      }
    case "IncludesLastItemInRange":
      captureLast = true
      text = ""
    default: break
    }
  }

  func parser(_ p: XMLParser, foundCharacters string: String) { if captureLast { text += string } }

  func parser(_ p: XMLParser, didEndElement name: String, namespaceURI: String?,
              qualifiedName: String?) {
    switch name {
    case "Create", "Update", "ReadFlagChange", "Delete": changeKind = ""
    case "IncludesLastItemInRange":
      result.includesLast = (text.trimmingCharacters(in: .whitespacesAndNewlines) == "true")
      captureLast = false
    default: break
    }
  }
}

/// Liest den `<SyncState>`-Wert (Delta-Cursor) aus einer SyncFolderItems-Antwort.
private final class SyncStateParser: NSObject, XMLParserDelegate {
  var state = ""
  private var capture = false
  private var text = ""
  func parser(_ p: XMLParser, didStartElement name: String, namespaceURI: String?, qualifiedName: String?, attributes a: [String: String]) {
    if name == "SyncState" { capture = true; text = "" }
  }
  func parser(_ p: XMLParser, foundCharacters string: String) { if capture { text += string } }
  func parser(_ p: XMLParser, didEndElement name: String, namespaceURI: String?, qualifiedName: String?) {
    if name == "SyncState" { state = text; capture = false }
  }
}

/// Liest Name/ContentType/Content(Base64)/Size aus einer GetAttachment-Antwort.
private final class AttachmentContentParser: NSObject, XMLParserDelegate {
  var result = EwsSoap.ParsedAttachmentContent()
  private var text = ""
  func parser(_ p: XMLParser, didStartElement name: String, namespaceURI: String?, qualifiedName: String?, attributes a: [String: String]) { text = "" }
  func parser(_ p: XMLParser, foundCharacters string: String) { text += string }
  func parser(_ p: XMLParser, didEndElement name: String, namespaceURI: String?, qualifiedName: String?) {
    switch name {
    case "Name": if result.name.isEmpty { result.name = text }
    case "ContentType": if result.contentType == "application/octet-stream" { result.contentType = text }
    case "Size": result.size = Int(text) ?? result.size
    case "Content": result.base64 = text.trimmingCharacters(in: .whitespacesAndNewlines)
    default: break
    }
    text = ""
  }
}

/// Parser für FindFolder-Antworten (Ordner).
private final class FolderParser: NSObject, XMLParserDelegate {
  var folders: [EwsSoap.ParsedFolder] = []
  private var current: EwsSoap.ParsedFolder?
  private var text = ""

  func parser(_ parser: XMLParser, didStartElement name: String, namespaceURI: String?,
              qualifiedName: String?, attributes attrs: [String: String]) {
    text = ""
    if name == "Folder" { current = EwsSoap.ParsedFolder() }
    if name == "FolderId", let id = attrs["Id"] { current?.id = id }
    // ParentFolderId steht (Default-Shape) als eigenes Element je Ordner — für die Baumstruktur.
    if name == "ParentFolderId", let id = attrs["Id"] { current?.parentId = id }
  }
  func parser(_ parser: XMLParser, foundCharacters string: String) { text += string }
  func parser(_ parser: XMLParser, didEndElement name: String, namespaceURI: String?, qualifiedName: String?) {
    switch name {
    case "DisplayName": current?.displayName = text
    case "UnreadCount": current?.unread = Int(text) ?? 0
    case "TotalCount": current?.total = Int(text) ?? 0
    case "Folder": if let f = current { folders.append(f); current = nil }
    default: break
    }
    text = ""
  }
}

/// Parser für CalendarItem-Antworten (Termine).
private final class EventParser: NSObject, XMLParserDelegate {
  var events: [EwsSoap.ParsedEvent] = []
  private var current: EwsSoap.ParsedEvent?
  private var text = ""
  private var inBody = false

  func parser(_ parser: XMLParser, didStartElement name: String, namespaceURI: String?,
              qualifiedName: String?, attributes attrs: [String: String]) {
    text = ""
    if name == "CalendarItem" { current = EwsSoap.ParsedEvent() }
    if name == "ItemId" {
      if let id = attrs["Id"] { current?.id = id }
      if let ck = attrs["ChangeKey"] { current?.changeKey = ck }
    }
    if name == "Body" { inBody = true }
  }
  func parser(_ parser: XMLParser, foundCharacters string: String) { text += string }
  func parser(_ parser: XMLParser, didEndElement name: String, namespaceURI: String?, qualifiedName: String?) {
    switch name {
    case "Subject": current?.subject = text
    case "Start": current?.start = EwsSoap.iso(text)
    case "End": current?.end = EwsSoap.iso(text)
    case "Location": current?.location = text
    case "IsAllDayEvent": current?.isAllDay = (text == "true")
    case "IsMeeting": current?.isMeeting = (text == "true")
    case "IsCancelled": current?.isCancelled = (text == "true")
    case "MyResponseType": current?.myResponse = text
    case "Body": if inBody { current?.notes = text; inBody = false }
    case "Name": if current?.organizer.isEmpty == true { current?.organizer = text }
    case "CalendarItem": if let e = current { events.append(e); current = nil }
    default: break
    }
    text = ""
  }
}

/// Parser für Contact-Antworten (Kontakte).
private final class ContactParser: NSObject, XMLParserDelegate {
  var contacts: [EwsSoap.ParsedContact] = []
  private var current: EwsSoap.ParsedContact?
  private var text = ""
  // `Entry`-Elemente werden für E-Mail UND Telefon genutzt — über das Key-Attribut unterscheiden.
  private var entryKey = ""
  private var inBody = false

  func parser(_ parser: XMLParser, didStartElement name: String, namespaceURI: String?,
              qualifiedName: String?, attributes attrs: [String: String]) {
    text = ""
    if name == "Contact" { current = EwsSoap.ParsedContact() }
    if name == "ItemId", let id = attrs["Id"] { current?.id = id }
    if name == "Entry" { entryKey = attrs["Key"] ?? "" }
    if name == "Body" { inBody = true }
  }
  func parser(_ parser: XMLParser, foundCharacters string: String) { text += string }
  func parser(_ parser: XMLParser, didEndElement name: String, namespaceURI: String?, qualifiedName: String?) {
    switch name {
    case "DisplayName": current?.displayName = text
    case "GivenName": current?.givenName = text
    case "Surname": current?.surname = text
    case "CompanyName": current?.company = text
    case "JobTitle": current?.jobTitle = text
    case "Body": if inBody { current?.notes = text; inBody = false }
    case "Entry":
      if entryKey.hasPrefix("EmailAddress") {
        if current?.email.isEmpty == true { current?.email = text }
      } else if entryKey == "MobilePhone" {
        current?.mobilePhone = text
      } else if entryKey == "BusinessPhone" {
        current?.businessPhone = text
      } else if entryKey == "HomePhone" {
        current?.homePhone = text
      } else if current?.email.isEmpty == true, text.contains("@") {
        current?.email = text
      }
      entryKey = ""
    case "Contact": if let c = current { contacts.append(c); current = nil }
    default: break
    }
    text = ""
  }
}
