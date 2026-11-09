import UIKit
import WebKit

/// Connects the phone and TV web views: relays messages between them, reports
/// whether an external display is attached, and stores media the phone casts
/// (photos/videos are written to a local folder the TV page can read).
final class Hub: NSObject, WKScriptMessageHandler {
    static let shared = Hub()

    private(set) weak var phone: WKWebView?
    private(set) weak var tv: WKWebView?
    private var openFiles: [String: FileHandle] = [:]
    private var prepared = false

    /// Writable copy of the bundled web app (so cast media can live beside it).
    let root = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("www", isDirectory: true)
    private var mediaDir: URL { root.appendingPathComponent("media", isDirectory: true) }

    private func prepare() {
        guard !prepared else { return }
        prepared = true
        let fm = FileManager.default
        try? fm.removeItem(at: root)
        try? fm.createDirectory(at: root.deletingLastPathComponent(), withIntermediateDirectories: true)
        if let bundled = Bundle.main.url(forResource: "public", withExtension: nil) {
            try? fm.copyItem(at: bundled, to: root)
        }
        try? fm.createDirectory(at: mediaDir, withIntermediateDirectories: true)
    }

    func makeWebView(role: Role) -> WKWebView {
        prepare()
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.userContentController.add(WeakMessageHandler(self), name: "pocketdesk")

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 0.98, green: 0.98, blue: 0.98, alpha: 1)
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.bounces = false
        if #available(iOS 16.4, *) { webView.isInspectable = true }

        switch role {
        case .phone: phone = webView
        case .tv: tv = webView; sendDisplayStatus()
        }
        webView.loadFileURL(root.appendingPathComponent("\(role.rawValue).html"), allowingReadAccessTo: root)
        return webView
    }

    func tvDisconnected() {
        tv = nil
        sendDisplayStatus()
    }

    func sendDisplayStatus() {
        var msg: [String: Any] = ["t": "display", "connected": tv != nil]
        if tv != nil { msg["name"] = "External display" }
        deliver(to: phone, msg)
    }

    // MARK: JavaScript → native

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? String,
              let data = body.data(using: .utf8),
              let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let type = obj["type"] as? String else { return }
        let fromPhone = (obj["role"] as? String) != "tv"

        switch type {
        case "msg":
            if let msg = obj["msg"] { deliver(to: fromPhone ? tv : phone, msg) }
        case "ready":
            if fromPhone { sendDisplayStatus() } else { deliver(to: phone, ["t": "tv-ready"]) }
        case "file-start":
            guard let name = safeName(obj) else { return }
            let url = mediaDir.appendingPathComponent(name)
            FileManager.default.createFile(atPath: url.path, contents: nil)
            openFiles[name] = try? FileHandle(forWritingTo: url)
        case "file-chunk":
            guard let name = safeName(obj), let b64 = obj["data"] as? String, let chunk = Data(base64Encoded: b64) else { return }
            openFiles[name]?.write(chunk)
        case "file-end":
            guard let name = safeName(obj) else { return }
            try? openFiles[name]?.close()
            openFiles[name] = nil
        default:
            break
        }
    }

    // MARK: native → JavaScript

    private func deliver(to webView: WKWebView?, _ object: Any) {
        guard let webView,
              let json = try? JSONSerialization.data(withJSONObject: object),
              let literal = try? JSONSerialization.data(withJSONObject: [String(decoding: json, as: UTF8.self)]) else { return }
        let arg = String(decoding: literal, as: UTF8.self).dropFirst().dropLast() // ["…"] → "…"
        webView.evaluateJavaScript("window.PocketDeskBridge && PocketDeskBridge.receive(\(arg))")
    }

    private func safeName(_ obj: [String: Any]) -> String? {
        guard let name = obj["name"] as? String,
              name.range(of: "^[a-z0-9]+(\\.[a-z0-9]{1,5})?$", options: .regularExpression) != nil else { return nil }
        return name
    }
}

/// Avoids a retain cycle between WKUserContentController and Hub.
private final class WeakMessageHandler: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?
    init(_ target: WKScriptMessageHandler) { self.target = target }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(controller, didReceive: message)
    }
}
