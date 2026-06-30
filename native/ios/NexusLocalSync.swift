import Contacts
import EventKit
import Foundation

/// Lokale Geräte-Synchronisation: exportiert Exchange-Kontakte/-Termine (nur lesend aus der
/// App-DB) in das **iPhone-Adressbuch** (Contacts) bzw. den **iPhone-Kalender** (EventKit).
///
/// Sicherheitsmodell: Es wird je eine **eigene, von NEXUS verwaltete Ressource** angelegt — eine
/// Kontaktgruppe „NEXUS" und ein Kalender „NEXUS". Beim Export wird nur diese Ressource ersetzt
/// (Full-Replace) — fremde Kontakte/Termine bleiben unangetastet. Der Zugriff wird beim ersten
/// Mal per System-Dialog erfragt (Berechtigungstexte in der Info.plist).
enum NexusLocalSync {
  enum LocalSyncError: Error { case denied(String) }

  private static let resourceName = "NEXUS"

  // MARK: JSON-Helfer

  private static func jsonArray(_ s: String) -> [[String: Any]] {
    guard let d = s.data(using: .utf8),
      let a = try? JSONSerialization.jsonObject(with: d) as? [[String: Any]]
    else { return [] }
    return a
  }

  private static func jsonString(_ obj: Any) throws -> String {
    let d = try JSONSerialization.data(withJSONObject: obj)
    return String(data: d, encoding: .utf8) ?? "{}"
  }

  private static func ms(_ v: Any?) -> Double {
    if let n = v as? NSNumber { return n.doubleValue }
    if let d = v as? Double { return d }
    return 0
  }

  // MARK: Kontakte (CNContactStore)

  private static func requestContacts() async -> Bool {
    await withCheckedContinuation { cont in
      CNContactStore().requestAccess(for: .contacts) { granted, _ in
        cont.resume(returning: granted)
      }
    }
  }

  /// Exportiert die übergebenen Kontakte in die Gruppe „NEXUS" (Full-Replace). Liefert {count}.
  static func exportContacts(_ json: String) async throws -> String {
    guard await requestContacts() else {
      throw LocalSyncError.denied("Kein Zugriff auf die Kontakte")
    }
    let store = CNContactStore()
    let items = jsonArray(json)

    // Gruppe „NEXUS" finden oder anlegen.
    let groups = try store.groups(matching: nil)
    var group = groups.first(where: { $0.name == resourceName })
    if group == nil {
      let mg = CNMutableGroup()
      mg.name = resourceName
      let save = CNSaveRequest()
      save.add(mg, toContainerWithIdentifier: nil)
      try store.execute(save)
      group = mg
    }
    guard let grp = group else { throw LocalSyncError.denied("Gruppe konnte nicht angelegt werden") }

    // Bestehende NEXUS-Kontakte löschen (Full-Replace — betrifft nur die NEXUS-Gruppe).
    let pred = CNContact.predicateForContactsInGroup(withIdentifier: grp.identifier)
    let keys = [CNContactIdentifierKey as CNKeyDescriptor]
    let existing = try store.unifiedContacts(matching: pred, keysToFetch: keys)
    if !existing.isEmpty {
      let del = CNSaveRequest()
      for c in existing {
        if let m = c.mutableCopy() as? CNMutableContact { del.delete(m) }
      }
      try store.execute(del)
    }

    // Neu anlegen + der Gruppe zuordnen.
    let add = CNSaveRequest()
    var count = 0
    for item in items {
      let c = CNMutableContact()
      c.givenName = (item["givenName"] as? String) ?? ""
      c.familyName = (item["surname"] as? String) ?? ""
      if c.givenName.isEmpty && c.familyName.isEmpty {
        c.givenName = (item["displayName"] as? String) ?? ""
      }
      if let org = item["company"] as? String, !org.isEmpty { c.organizationName = org }
      if let job = item["jobTitle"] as? String, !job.isEmpty { c.jobTitle = job }
      if let emails = item["emailAddresses"] as? [[String: Any]] {
        c.emailAddresses = emails.compactMap { e in
          guard let a = e["address"] as? String, !a.isEmpty else { return nil }
          return CNLabeledValue(label: CNLabelWork, value: a as NSString)
        }
      }
      var phones: [CNLabeledValue<CNPhoneNumber>] = []
      if let m = item["mobilePhone"] as? String, !m.isEmpty {
        phones.append(CNLabeledValue(label: CNLabelPhoneNumberMobile, value: CNPhoneNumber(stringValue: m)))
      }
      if let b = item["businessPhone"] as? String, !b.isEmpty {
        phones.append(CNLabeledValue(label: CNLabelPhoneNumberMain, value: CNPhoneNumber(stringValue: b)))
      }
      if let h = item["homePhone"] as? String, !h.isEmpty {
        phones.append(CNLabeledValue(label: CNLabelHome, value: CNPhoneNumber(stringValue: h)))
      }
      c.phoneNumbers = phones
      add.add(c, toContainerWithIdentifier: nil)
      add.addMember(c, to: grp)
      count += 1
    }
    if count > 0 { try store.execute(add) }
    return try jsonString(["count": count])
  }

  // MARK: Kalender (EventKit)

  private static func requestCalendar(_ store: EKEventStore) async -> Bool {
    if #available(iOS 17.0, *) {
      return await withCheckedContinuation { cont in
        store.requestFullAccessToEvents { granted, _ in cont.resume(returning: granted) }
      }
    } else {
      return await withCheckedContinuation { cont in
        store.requestAccess(to: .event) { granted, _ in cont.resume(returning: granted) }
      }
    }
  }

  /// Exportiert die übergebenen Termine in den Kalender „NEXUS" (Full-Replace im Zeitfenster
  /// −60 … +365 Tage). Liefert {count}.
  static func exportEvents(_ json: String) async throws -> String {
    let store = EKEventStore()
    guard await requestCalendar(store) else {
      throw LocalSyncError.denied("Kein Zugriff auf den Kalender")
    }
    let items = jsonArray(json)

    // Kalender „NEXUS" finden oder anlegen.
    var cal = store.calendars(for: .event).first(where: { $0.title == resourceName })
    if cal == nil {
      let c = EKCalendar(for: .event, eventStore: store)
      c.title = resourceName
      c.source =
        store.sources.first(where: { $0.sourceType == .local })
        ?? store.defaultCalendarForNewEvents?.source
        ?? store.sources.first
      if c.source != nil {
        try store.saveCalendar(c, commit: true)
        cal = c
      }
    }
    guard let calendar = cal else {
      throw LocalSyncError.denied("Kalender konnte nicht angelegt werden")
    }

    // Bestehende NEXUS-Termine im Fenster entfernen (Full-Replace).
    let from = Date().addingTimeInterval(-60 * 86400)
    let to = Date().addingTimeInterval(365 * 86400)
    let pred = store.predicateForEvents(withStart: from, end: to, calendars: [calendar])
    for ev in store.events(matching: pred) {
      try? store.remove(ev, span: .thisEvent, commit: false)
    }

    // Neu anlegen.
    var count = 0
    for item in items {
      let ev = EKEvent(eventStore: store)
      ev.calendar = calendar
      ev.title = (item["subject"] as? String) ?? "(Termin)"
      let startMs = ms(item["startAt"])
      let endMs = max(ms(item["endAt"]), startMs)
      ev.startDate = Date(timeIntervalSince1970: startMs / 1000)
      ev.endDate = Date(timeIntervalSince1970: endMs / 1000)
      ev.isAllDay = (item["isAllDay"] as? Bool) ?? false
      if let loc = item["location"] as? String, !loc.isEmpty { ev.location = loc }
      if let notes = item["notes"] as? String, !notes.isEmpty { ev.notes = notes }
      do {
        try store.save(ev, span: .thisEvent, commit: false)
        count += 1
      } catch { /* einzelnen Termin überspringen */ }
    }
    try store.commit()
    return try jsonString(["count": count])
  }
}
