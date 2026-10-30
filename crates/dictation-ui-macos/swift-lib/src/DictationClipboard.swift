import Cocoa

final class DictationClipboard {
  private let pasteboard: NSPasteboard
  private var clipboardSnapshot: [NSPasteboardItem]?
  private var clipboardChangeCount: Int?

  init(pasteboard: NSPasteboard = .general) {
    self.pasteboard = pasteboard
  }

  func prepare(text: String) -> String {
    if clipboardChangeCount != pasteboard.changeCount {
      clipboardSnapshot = nil
    }
    var saved = clipboardSnapshot ?? []
    if clipboardSnapshot == nil {
      for original in pasteboard.pasteboardItems ?? [] {
        let copy = NSPasteboardItem()
        for type in original.types {
          guard let data = original.data(forType: type), copy.setData(data, forType: type) else {
            return
              "Could not preserve the clipboard. Copy your last dictation from Settings > Dictation."
          }
        }
        saved.append(copy)
      }
    }
    let item = NSPasteboardItem()
    guard item.setString(text, forType: .string) else {
      return "Could not prepare dictation for insertion."
    }
    item.setString("", forType: NSPasteboard.PasteboardType("org.nspasteboard.ConcealedType"))
    item.setString("", forType: NSPasteboard.PasteboardType("org.nspasteboard.TransientType"))
    let clearedCount = pasteboard.clearContents()
    guard pasteboard.writeObjects([item]) else {
      clipboardSnapshot = saved
      clipboardChangeCount = clearedCount
      restoreClipboard(saved, expectedChangeCount: clearedCount, retries: 2)
      return "Could not prepare dictation for insertion."
    }
    let changeCount = pasteboard.changeCount
    clipboardSnapshot = saved
    clipboardChangeCount = changeCount
    // Clipboard observers and multi-stage paste can read before the destination does.
    // Keep the text for the existing insertion window; a read is not a paste acknowledgement.
    DispatchQueue.main.asyncAfter(deadline: .now() + 30) {
      self.restoreClipboard(saved, expectedChangeCount: changeCount, retries: 2)
    }
    return ""
  }

  private func restoreClipboard(_ saved: [NSPasteboardItem], expectedChangeCount: Int, retries: Int)
  {
    guard clipboardChangeCount == expectedChangeCount else { return }
    if pasteboard.changeCount == expectedChangeCount {
      let count = pasteboard.clearContents()
      if !saved.isEmpty && !pasteboard.writeObjects(saved) {
        guard pasteboard.changeCount == count else {
          clipboardSnapshot = nil
          clipboardChangeCount = nil
          return
        }
        clipboardChangeCount = count
        if retries > 0 {
          DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            self.restoreClipboard(saved, expectedChangeCount: count, retries: retries - 1)
          }
        } else {
          NSLog("Could not restore dictation clipboard; keeping its owned snapshot for recovery.")
        }
        return
      }
    }
    clipboardSnapshot = nil
    clipboardChangeCount = nil
  }
}
