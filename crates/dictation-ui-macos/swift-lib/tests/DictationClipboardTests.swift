import Cocoa
import XCTest

@testable import swift_lib

final class DictationClipboardTests: XCTestCase {
  func testPreliminaryClipboardReadDoesNotPastePreviousContents() {
    let pasteboard = NSPasteboard.withUniqueName()
    defer { pasteboard.releaseGlobally() }
    pasteboard.setString("previous clipboard", forType: .string)
    let clipboard = DictationClipboard(pasteboard: pasteboard)

    XCTAssertEqual(clipboard.prepare(text: "dictated message"), "")
    XCTAssertEqual(pasteboard.string(forType: .string), "dictated message")
    RunLoop.current.run(until: Date().addingTimeInterval(0.05))
    XCTAssertEqual(
      pasteboard.string(forType: .string), "dictated message",
      "A preliminary clipboard reader must not restore old text before the destination pastes.")
  }
}
