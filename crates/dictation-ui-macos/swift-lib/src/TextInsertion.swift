import Cocoa
import SwiftRs

private final class DictationTarget {
  static let shared = DictationTarget()
  var element: AXUIElement?
  var token = ""
  private let clipboard = DictationClipboard()

  func focusedElement() -> AXUIElement? {
    guard AXIsProcessTrusted() else { return nil }
    let system = AXUIElementCreateSystemWide()
    AXUIElementSetMessagingTimeout(system, 1)
    var value: CFTypeRef?
    guard
      AXUIElementCopyAttributeValue(system, kAXFocusedUIElementAttribute as CFString, &value)
        == .success,
      let value, CFGetTypeID(value) == AXUIElementGetTypeID()
    else { return nil }
    let element = unsafeBitCast(value, to: AXUIElement.self)
    AXUIElementSetMessagingTimeout(element, 1)
    return element
  }

  func acceptsText(_ element: AXUIElement) -> Bool {
    var role: CFTypeRef?
    var subrole: CFTypeRef?
    AXUIElementCopyAttributeValue(element, kAXRoleAttribute as CFString, &role)
    AXUIElementCopyAttributeValue(element, kAXSubroleAttribute as CFString, &subrole)
    if subrole as? String == kAXSecureTextFieldSubrole { return false }
    var editable = DarwinBoolean(false)
    AXUIElementIsAttributeSettable(element, kAXSelectedTextAttribute as CFString, &editable)
    if editable.boolValue { return true }
    AXUIElementIsAttributeSettable(element, kAXValueAttribute as CFString, &editable)
    return editable.boolValue
      && [kAXTextFieldRole, kAXTextAreaRole, kAXComboBoxRole].contains(role as? String ?? "")
  }

  func capture() -> String {
    element = nil
    guard let focused = focusedElement(), acceptsText(focused) else {
      return
        "Focus an editable text field and enable Anarlog in System Settings > Privacy & Security > Accessibility. Password fields are excluded."
    }
    token = UUID().uuidString
    element = focused
    return "ok:" + token
  }

  func insert(token: String, text: String) -> String {
    guard token == self.token, let target = element, let focused = focusedElement(),
      CFEqual(target, focused), acceptsText(focused)
    else {
      return "The focused text field changed. Copy your last dictation from Settings > Dictation."
    }
    element = nil

    // Web views can acknowledge AXSelectedText without editing their field.
    // Use the normal paste path so that an acknowledged no-op cannot lose dictation.
    guard let source = CGEventSource(stateID: .combinedSessionState),
      let down = CGEvent(keyboardEventSource: source, virtualKey: 9, keyDown: true),
      let up = CGEvent(keyboardEventSource: source, virtualKey: 9, keyDown: false)
    else { return "Could not insert text. Copy your last dictation from Settings > Dictation." }

    let error = clipboard.prepare(text: text)
    guard error.isEmpty else { return error }
    down.flags = .maskCommand
    up.flags = .maskCommand
    down.post(tap: .cghidEventTap)
    up.post(tap: .cghidEventTap)
    return ""
  }

}

private func onMain<T>(_ work: () -> T) -> T {
  Thread.isMainThread ? work() : DispatchQueue.main.sync(execute: work)
}

@_cdecl("_capture_dictation_target")
public func captureDictationTarget() -> SRString {
  SRString(onMain { DictationTarget.shared.capture() })
}

@_cdecl("_insert_dictation_text")
public func insertDictationText(target: SRString, text: SRString) -> SRString {
  SRString(
    onMain { DictationTarget.shared.insert(token: target.toString(), text: text.toString()) })
}
