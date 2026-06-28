import Foundation

/// Lesehilfen für dekodierte EAS-WBXML-Bäume (`Wbxml.Node`). Token werden über die
/// `Wbxml.tags`-Tabellen aufgelöst, sodass nach Tag-NAMEN gesucht werden kann.
enum EasParse {
  static func token(_ page: Int, _ tag: String) -> UInt8? { Wbxml.tags[page]?[tag] }

  /// Erstes Vorkommen (Pre-Order-DFS) eines Tags im gesamten Baum.
  static func first(_ root: Wbxml.Node, page: Int, tag: String) -> Wbxml.Node? {
    guard let tok = token(page, tag) else { return nil }
    return firstByToken(root, page: page, token: tok)
  }

  private static func firstByToken(_ node: Wbxml.Node, page: Int, token: UInt8) -> Wbxml.Node? {
    if node.page == page, node.token == token { return node }
    for child in node.children {
      if let found = firstByToken(child, page: page, token: token) { return found }
    }
    return nil
  }

  /// Alle Vorkommen eines Tags (Pre-Order-DFS).
  static func all(_ root: Wbxml.Node, page: Int, tag: String) -> [Wbxml.Node] {
    guard let tok = token(page, tag) else { return [] }
    var out: [Wbxml.Node] = []
    collect(root, page: page, token: tok, into: &out)
    return out
  }

  private static func collect(
    _ node: Wbxml.Node, page: Int, token: UInt8, into out: inout [Wbxml.Node]
  ) {
    if node.page == page, node.token == token { out.append(node) }
    for child in node.children { collect(child, page: page, token: token, into: &out) }
  }

  /// Text des ersten Vorkommens eines Tags.
  static func text(_ root: Wbxml.Node, page: Int, tag: String) -> String? {
    first(root, page: page, tag: tag)?.text
  }

  /// Direktes Kind mit Tag (nicht rekursiv) — für eindeutige Felder unter einem bekannten Knoten.
  static func child(_ node: Wbxml.Node, page: Int, tag: String) -> Wbxml.Node? {
    guard let tok = token(page, tag) else { return nil }
    return node.children.first { $0.page == page && $0.token == tok }
  }

  /// Text eines direkten Kindes.
  static func childText(_ node: Wbxml.Node, page: Int, tag: String) -> String? {
    child(node, page: page, tag: tag)?.text
  }
}
