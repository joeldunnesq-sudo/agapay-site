import SwiftUI
import UIKit
import WebKit

struct ContentView: View {
    var body: some View {
        MyAGAPAYWebView()
            .ignoresSafeArea(.container, edges: .bottom)
    }
}

struct MyAGAPAYWebView: UIViewRepresentable {
    private let startURL = URL(string: "https://agapay.app/myagapay/login?source=ios-app")!

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.load(URLRequest(url: startURL, cachePolicy: .reloadRevalidatingCacheData))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        private func shouldOpenExternally(_ url: URL) -> Bool {
            guard let host = url.host?.lowercased() else { return true }
            if host != "agapay.app" && host != "www.agapay.app" { return true }
            if url.path.hasPrefix("/learn/pricing") { return true }
            return false
        }

        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
            if shouldOpenExternally(url) {
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
                return
            }
            decisionHandler(.allow)
        }

        func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
            if let url = navigationAction.request.url { UIApplication.shared.open(url) }
            return nil
        }
    }
}
