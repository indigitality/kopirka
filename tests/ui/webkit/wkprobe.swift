// Прогон сценария в настоящем WKWebView — том самом движке, на котором работает
// десктопная «Копирка» под Tauri 2. Нужен потому, что Blink (headless Chrome,
// см. ../run.mjs) сам компенсирует ошибку containing block у Floating UI, а
// WebKit — нет (см. коммит 54c6287): баг ловится только здесь.
// Safari через safaridriver недоступен без ручного включения «Allow Remote
// Automation» (настройка безопасности, включать самому нельзя) — поэтому
// собственное окно WKWebView, а не системный браузер.
//
// Использование:  swift wkprobe.swift <spec.json> <out.json>
// Формат шага (массив в spec.json):
//   { "op": "goto",    "url": "http://localhost:5177/" }
//   { "op": "wait",    "ms": 500 }
//   { "op": "waitFor", "sel": "[data-file-id]", "timeout": 20000 }
//   { "op": "js",      "name": "ключ_в_результате", "code": "return ...;" }
//   { "op": "shot",    "file": "/путь/кадр.png" }
//
// Результат — JSON { "results": { имя_шага: значение, ... }, "__errors": [...] },
// код выхода 0, если __errors пуст.

import Cocoa
import WebKit

struct Step: Decodable {
  let op: String
  let name: String?
  let code: String?
  let url: String?
  let ms: Int?
  let sel: String?
  let file: String?
  let timeout: Int?
}

let argv = CommandLine.arguments
guard argv.count >= 3 else {
  FileHandle.standardError.write("usage: wkprobe.swift <spec.json> <out.json>\n".data(using: .utf8)!)
  exit(2)
}
let specURL = URL(fileURLWithPath: argv[1])
let outPath = argv[2]
let steps = try! JSONDecoder().decode([Step].self, from: Data(contentsOf: specURL))

var results: [String: Any] = [:]
var errors: [String] = []

let app = NSApplication.shared
app.setActivationPolicy(.regular)

let size = NSRect(x: 0, y: 0, width: 1280, height: 760)
let config = WKWebViewConfiguration()
config.preferences.setValue(true, forKey: "developerExtrasEnabled")
let webView = WKWebView(frame: size, configuration: config)
webView.setValue(false, forKey: "drawsBackground")

let window = NSWindow(
  contentRect: size,
  styleMask: [.titled, .closable],
  backing: .buffered,
  defer: false
)
window.title = "kopirka-ui-webkit"
window.contentView = webView
window.setFrameOrigin(NSPoint(x: 60, y: 200))
window.makeKeyAndOrderFront(nil)
app.activate(ignoringOtherApps: true)

func finish() {
  let payload: [String: Any] = ["results": results, "__errors": errors]
  let data = try! JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted, .sortedKeys])
  try! data.write(to: URL(fileURLWithPath: outPath))
  FileHandle.standardOutput.write(data)
  FileHandle.standardOutput.write("\n".data(using: .utf8)!)
  exit(errors.isEmpty ? 0 : 1)
}

var index = 0

func runNext() {
  if index >= steps.count { finish(); return }
  let step = steps[index]
  index += 1

  switch step.op {
  case "goto":
    webView.load(URLRequest(url: URL(string: step.url!)!))
    pollReady(deadline: Date().addingTimeInterval(30))

  case "wait":
    DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(step.ms ?? 100)) { runNext() }

  case "waitFor":
    pollSelector(step.sel!, deadline: Date().addingTimeInterval(Double(step.timeout ?? 20000) / 1000.0))

  case "js":
    let wrapped = "(function(){ \(step.code!) })()"
    webView.evaluateJavaScript(wrapped) { value, error in
      if let error = error {
        errors.append("js[\(step.name ?? "?")]: \(error.localizedDescription)")
        if let n = step.name { results[n] = ["__error": error.localizedDescription] }
      } else if let n = step.name {
        results[n] = value ?? NSNull()
      }
      runNext()
    }

  case "shot":
    let cfg = WKSnapshotConfiguration()
    cfg.rect = webView.bounds
    webView.takeSnapshot(with: cfg) { image, error in
      if let image = image,
        let tiff = image.tiffRepresentation,
        let rep = NSBitmapImageRep(data: tiff),
        let png = rep.representation(using: .png, properties: [:])
      {
        try? png.write(to: URL(fileURLWithPath: step.file!))
      } else {
        errors.append("shot[\(step.file ?? "?")]: \(error?.localizedDescription ?? "нет изображения")")
      }
      runNext()
    }

  default:
    errors.append("неизвестная операция \(step.op)")
    runNext()
  }
}

func pollReady(deadline: Date) {
  webView.evaluateJavaScript("document.readyState") { value, _ in
    if let s = value as? String, s == "complete" {
      runNext()
    } else if Date() > deadline {
      errors.append("goto: страница не догрузилась")
      runNext()
    } else {
      DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(200)) { pollReady(deadline: deadline) }
    }
  }
}

func pollSelector(_ sel: String, deadline: Date) {
  let escaped = sel.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"")
  webView.evaluateJavaScript("!!document.querySelector(\"\(escaped)\")") { value, _ in
    if let ok = value as? Bool, ok {
      runNext()
    } else if Date() > deadline {
      errors.append("waitFor: не дождался \(sel)")
      runNext()
    } else {
      DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(200)) { pollSelector(sel, deadline: deadline) }
    }
  }
}

DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { runNext() }
app.run()
