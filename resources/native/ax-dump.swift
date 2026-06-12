// ax-dump: walks the macOS Accessibility tree of a target app and emits a
// compact JSON list of elements with screen-space bounds. Used by Specter to
// drive pixel-perfect cursor targeting without relying on a vision model's
// pixel guess.
//
// Build:   xcrun swiftc -framework Cocoa ax-dump.swift -o ax-dump
// Usage:   ax-dump <bundle-id|app-name>          # walk a specific app
//          ax-dump                                # walk the frontmost app
//          ax-dump --frontmost-only               # print frontmost id and exit

import Cocoa
import ApplicationServices

let args = CommandLine.arguments
let target: String

// Module-level state for click detection
var g_clickTap: CFMachPort?
var g_clickRunLoopSource: CFRunLoopSource?

func findApp(_ identifier: String) -> NSRunningApplication? {
    if let app = NSRunningApplication.runningApplications(withBundleIdentifier: identifier).first {
        return app
    }
    let workspace = NSWorkspace.shared
    for app in workspace.runningApplications {
        if app.bundleIdentifier == identifier { return app }
        if app.localizedName == identifier { return app }
    }
    return nil
}

func jsonString(_ value: String?) -> String {
    guard let v = value else { return "null" }
    let escaped = v
        .replacingOccurrences(of: "\\", with: "\\\\")
        .replacingOccurrences(of: "\"", with: "\\\"")
        .replacingOccurrences(of: "\n", with: "\\n")
        .replacingOccurrences(of: "\r", with: "\\r")
        .replacingOccurrences(of: "\t", with: "\\t")
    return "\"\(escaped)\""
}

// Module-level state for --watch mode (global so @convention(c) callbacks can reach it).
var g_watchPid: pid_t = 0

// Emits a single-line JSON event to stdout so the Node process can read it.
func emitWatchEvent(_ name: String) {
    let line = "{\"event\":\"\(jsonString(name) != "null" ? name : "unknown")\",\"pid\":\(g_watchPid)}\n"
    FileHandle.standardOutput.write(line.data(using: .utf8)!)
}

// --watch <bundle-id|app-name>  (or --watch alone = frontmost app)
// Registers an AXObserver on the target app and streams JSON events to stdout
// whenever AX notifications fire. The Node side re-dumps the tree on each event.
if args.count >= 2 && args[1] == "--watch" {
    let watchTarget: String
    let watchApp: NSRunningApplication
    if args.count >= 3 {
        watchTarget = args[2]
        guard let resolved = findApp(watchTarget) else {
            FileHandle.standardError.write("not-found:\(watchTarget)\n".data(using: .utf8)!)
            exit(3)
        }
        watchApp = resolved
    } else {
        guard let frontmost = NSWorkspace.shared.frontmostApplication else {
            FileHandle.standardError.write("no-frontmost-app\n".data(using: .utf8)!)
            exit(4)
        }
        watchApp = frontmost
        watchTarget = frontmost.bundleIdentifier ?? frontmost.localizedName ?? "unknown"
    }

    g_watchPid = watchApp.processIdentifier
    let watchAxApp = AXUIElementCreateApplication(g_watchPid)

    var observer: AXObserver?
    let observerCallback: AXObserverCallback = { _, _, notification, _ in
        emitWatchEvent(notification as String)
    }

    guard AXObserverCreate(g_watchPid, observerCallback, &observer) == .success,
          let obs = observer else {
        FileHandle.standardError.write("observer-create-failed\n".data(using: .utf8)!)
        exit(5)
    }

    let notifications: [String] = [
        kAXFocusedUIElementChangedNotification as String,
        kAXValueChangedNotification as String,
        kAXWindowCreatedNotification as String,
        kAXTitleChangedNotification as String,
        kAXUIElementDestroyedNotification as String,
        kAXSelectedChildrenChangedNotification as String,
    ]
    for note in notifications {
        AXObserverAddNotification(obs, watchAxApp, note as CFString, nil)
    }

    CFRunLoopAddSource(CFRunLoopGetCurrent(), AXObserverGetRunLoopSource(obs), .defaultMode)

    // Also start global click detection via CGEvent tap (requires Input Monitoring permission)
    startClickTap(pid: g_watchPid)

    // Emit a ready marker so the Node side knows the watcher is up.
    emitWatchEvent("watch_ready")
    CFRunLoopRun()
    exit(0)
}

// MARK: - Click Detection via CGEvent Tap

func startClickTap(pid: pid_t) {
    let eventMask = (1 << CGEventType.leftMouseDown.rawValue) | (1 << CGEventType.rightMouseDown.rawValue)
    guard let tap = CGEvent.tapCreate(
        tap: .cgSessionEventTap,
        place: .headInsertEventTap,
        options: .defaultTap,
        eventsOfInterest: CGEventMask(eventMask),
        callback: { _, type, event, _ in
            let location = event.location
            let clickEvent = "{\"event\":\"click\",\"x\":\(location.x),\"y\":\(location.y),\"pid\":\(g_watchPid),\"button\":\(type == .leftMouseDown ? "\"left\"" : "\"right\"")}\n"
            FileHandle.standardOutput.write(clickEvent.data(using: .utf8)!)
            return Unmanaged.passRetained(event)
        },
        userInfo: nil
    ) else {
        FileHandle.standardError.write("click-tap-create-failed\n".data(using: .utf8)!)
        return
    }
    g_clickTap = tap
    let runLoopSource = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
    g_clickRunLoopSource = runLoopSource
    CFRunLoopAddSource(CFRunLoopGetCurrent(), runLoopSource, .defaultMode)
    CGEvent.tapEnable(tap: tap, enable: true)
}

func stopClickTap() {
    if let tap = g_clickTap {
        CGEvent.tapEnable(tap: tap, enable: false)
        CFRunLoopRemoveSource(CFRunLoopGetCurrent(), g_clickRunLoopSource, .defaultMode)
        g_clickTap = nil
        g_clickRunLoopSource = nil
    }
}

// `--frontmost-only` is a fast probe used by the main process to capture the
// user's foreground app *before* Specter's overlay steals focus. Without this,
// every later AX query targets Specter itself instead of the app the user is
// trying to learn — which is exactly why ghost-cursor targeting was wrong on
// non-browser apps.
if args.count >= 2 && args[1] == "--frontmost-only" {
    guard let frontmost = NSWorkspace.shared.frontmostApplication else {
        FileHandle.standardError.write("no-frontmost-app\n".data(using: .utf8)!)
        exit(4)
    }
    let payload =
        "{\"bundleId\":\(jsonString(frontmost.bundleIdentifier))," +
        "\"name\":\(jsonString(frontmost.localizedName))," +
        "\"pid\":\(frontmost.processIdentifier)}"
    print(payload)
    exit(0)
}

let app: NSRunningApplication
if args.count >= 2 {
    target = args[1]
    guard let resolved = findApp(target) else {
        FileHandle.standardError.write("not-found:\(target)\n".data(using: .utf8)!)
        exit(3)
    }
    app = resolved
} else {
    // No arg = walk the frontmost app, mirroring the PowerShell helper's
    // GetForegroundWindow default. Keeps the cross-platform interface symmetrical.
    guard let frontmost = NSWorkspace.shared.frontmostApplication else {
        FileHandle.standardError.write("no-frontmost-app\n".data(using: .utf8)!)
        exit(4)
    }
    target = frontmost.bundleIdentifier ?? frontmost.localizedName ?? "unknown"
    app = frontmost
}

let pid = app.processIdentifier
let axApp = AXUIElementCreateApplication(pid)

// Electron/Chromium apps lazily build their AX tree: without an assistive
// client signal they expose only a handful of window-chrome nodes (observed:
// 8 elements for Cursor). Setting AXManualAccessibility forces Chromium to
// construct the full tree; AXEnhancedUserInterface is the older equivalent
// some apps still honor. Harmless no-ops on native apps.
let axTrue = kCFBooleanTrue as CFTypeRef
let manualErr = AXUIElementSetAttributeValue(
    axApp, "AXManualAccessibility" as CFString, axTrue)
_ = AXUIElementSetAttributeValue(
    axApp, "AXEnhancedUserInterface" as CFString, axTrue)

func axGet(_ elem: AXUIElement, _ attr: String) -> CFTypeRef? {
    var ref: CFTypeRef?
    let err = AXUIElementCopyAttributeValue(elem, attr as CFString, &ref)
    return err == .success ? ref : nil
}

func axCGPoint(_ ref: CFTypeRef) -> CGPoint {
    var pt = CGPoint.zero
    if CFGetTypeID(ref) == AXValueGetTypeID() {
        AXValueGetValue(ref as! AXValue, .cgPoint, &pt)
    }
    return pt
}

func axCGSize(_ ref: CFTypeRef) -> CGSize {
    var sz = CGSize.zero
    if CFGetTypeID(ref) == AXValueGetTypeID() {
        AXValueGetValue(ref as! AXValue, .cgSize, &sz)
    }
    return sz
}

// Roles where we always want to surface the element to the picker. Other
// elements are still emitted but flagged actionable=false so the model can
// down-weight them.
let actionableRoles: Set<String> = [
    "AXButton", "AXLink", "AXMenuItem", "AXMenuButton", "AXMenu",
    "AXCheckBox", "AXRadioButton", "AXTextField", "AXTextArea",
    "AXTab", "AXTabGroup", "AXPopUpButton", "AXSlider", "AXSwitch",
    "AXSearchField", "AXComboBox", "AXCell", "AXRow", "AXOutline",
    "AXImage", "AXStaticText", "AXGroup", "AXToolbar", "AXSheet",
    "AXDisclosureTriangle", "AXIncrementor", "AXDecrementor",
]

let MAX_ELEMENTS = 4000
let MAX_DEPTH = 80

struct Out {
    let i: Int
    let role: String
    let title: String
    let desc: String
    let value: String
    let x: Double
    let y: Double
    let w: Double
    let h: Double
    let depth: Int
    let actionable: Bool
}

var elements: [Out] = []
var idx = 0

func walk(_ elem: AXUIElement, depth: Int) {
    if elements.count >= MAX_ELEMENTS { return }
    if depth > MAX_DEPTH { return }

    let role = (axGet(elem, kAXRoleAttribute as String) as? String) ?? ""
    let title = (axGet(elem, kAXTitleAttribute as String) as? String) ?? ""
    let desc = (axGet(elem, kAXDescriptionAttribute as String) as? String) ?? ""
    let valueRaw = axGet(elem, kAXValueAttribute as String)
    let value = (valueRaw as? String) ?? ""

    var x = 0.0, y = 0.0, w = 0.0, h = 0.0
    if let posRef = axGet(elem, kAXPositionAttribute as String) {
        let p = axCGPoint(posRef); x = Double(p.x); y = Double(p.y)
    }
    if let sizeRef = axGet(elem, kAXSizeAttribute as String) {
        let s = axCGSize(sizeRef); w = Double(s.width); h = Double(s.height)
    }

    let actionable = actionableRoles.contains(role)
    let hasGeometry = w > 0.5 && h > 0.5
    let hasLabel = !title.isEmpty || !desc.isEmpty || !value.isEmpty

    if hasGeometry && (actionable || hasLabel) {
        elements.append(Out(
            i: idx, role: role, title: title, desc: desc, value: value,
            x: x, y: y, w: w, h: h, depth: depth, actionable: actionable
        ))
        idx += 1
    }

    if let children = axGet(elem, kAXChildrenAttribute as String) as? [AXUIElement] {
        for child in children {
            walk(child, depth: depth + 1)
            if elements.count >= MAX_ELEMENTS { return }
        }
    }
}

func walkAllWindows(_ root: AXUIElement) {
    if let windows = axGet(root, kAXWindowsAttribute as String) as? [AXUIElement], !windows.isEmpty {
        for window in windows {
            walk(window, depth: 0)
        }
    } else {
        walk(root, depth: 0)
    }
}

walkAllWindows(axApp)

// Chromium honors AXManualAccessibility asynchronously: the first walk after
// setting it can still see the shallow chrome-only tree. If the walk came back
// suspiciously small and we did set the flag, wait for the renderer to build
// the real tree and walk a fresh app element once more.
if elements.count < 15 && manualErr == .success {
    usleep(900_000)
    elements.removeAll()
    idx = 0
    let freshApp = AXUIElementCreateApplication(pid)
    walkAllWindows(freshApp)
}

func jsonEscape(_ s: String) -> String {
    var out = ""
    out.reserveCapacity(s.count + 8)
    for c in s.unicodeScalars {
        switch c {
        case "\\": out += "\\\\"
        case "\"": out += "\\\""
        case "\n": out += "\\n"
        case "\r": out += "\\r"
        case "\t": out += "\\t"
        default:
            if c.value < 0x20 {
                out += String(format: "\\u%04x", c.value)
            } else {
                out += String(c)
            }
        }
    }
    return out
}

var json = "{\"app\":\"\(jsonEscape(target))\",\"pid\":\(pid),\"elements\":["
for (n, e) in elements.enumerated() {
    if n > 0 { json += "," }
    json += "{\"i\":\(e.i),"
    json += "\"role\":\"\(jsonEscape(e.role))\","
    json += "\"title\":\"\(jsonEscape(e.title))\","
    json += "\"desc\":\"\(jsonEscape(e.desc))\","
    json += "\"value\":\"\(jsonEscape(e.value))\","
    json += "\"x\":\(e.x),\"y\":\(e.y),\"w\":\(e.w),\"h\":\(e.h),"
    json += "\"depth\":\(e.depth),\"actionable\":\(e.actionable)}"
}
json += "]}"

print(json)
