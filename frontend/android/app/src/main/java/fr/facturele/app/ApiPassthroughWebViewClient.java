package fr.facturele.app;

import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;

// Capacitor's default BridgeWebViewClient.shouldInterceptRequest always
// delegates to Bridge's local asset server (WebViewLocalServer — see
// @capacitor/android's own source: isMainUrl() treats ANY request whose
// host matches server.hostname as its own, then handleLocalRequest()'s
// html5mode SPA fallback serves the bundled index.html for any path whose
// last segment has no "." — regardless of HTTP method). Since
// capacitor.config.ts deliberately points server.hostname at the real API
// domain (facturele.net, for same-origin cookies — see that file's own
// comment), every /api/* call — including POSTs like /api/auth/login —
// was being served a fake 200 "index.html" locally and never reaching the
// real network at all. The frontend then failed to parse HTML as the JSON
// it expected, surfacing as generic "email/password incorrect" or
// "erreur, réessayez" messages with zero trace in the backend's own logs.
//
// Only /api/* is excluded here (returning null tells the WebView to fall
// through to its own real network stack, a genuine HTTPS request to
// facturele.net) — everything else still goes through Capacitor's local
// server exactly as before, so the SPA's own client-side routing (e.g.
// deep-linking straight to /factures/123) keeps its index.html fallback.
public class ApiPassthroughWebViewClient extends BridgeWebViewClient {

    public ApiPassthroughWebViewClient(Bridge bridge) {
        super(bridge);
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        String path = request.getUrl().getPath();
        if (path != null && path.startsWith("/api/")) {
            return null;
        }
        return super.shouldInterceptRequest(view, request);
    }
}
