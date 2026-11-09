package app.pocketdesk

import android.annotation.SuppressLint
import android.app.Presentation
import android.content.Context
import android.hardware.display.DisplayManager
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.view.Display
import android.view.View
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream

/**
 * PocketDesk for Android — wired / external-display mode.
 *
 * The phone screen shows the controller (phone.html). When a TV or monitor is
 * connected (USB-C → HDMI, DisplayPort Alt Mode, a dock, or a wireless display),
 * Android reports it as a "presentation" display and we show the desktop
 * (tv.html) on it with [Presentation]. The two WebViews talk through this
 * activity, so no network — and no smart TV — is needed. The web app is bundled
 * in the APK and served from https://appassets.androidplatform.net/www/.
 */
class MainActivity : ComponentActivity(), DisplayManager.DisplayListener {

    private lateinit var displayManager: DisplayManager
    private lateinit var assetLoader: WebViewAssetLoader
    private lateinit var phoneView: WebView
    private var tvView: WebView? = null
    private var presentation: TvPresentation? = null
    private val ui = Handler(Looper.getMainLooper())

    private val mediaDir by lazy { File(cacheDir, "media").apply { mkdirs() } }
    private val openFiles = HashMap<String, FileOutputStream>()

    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private val pickFiles = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        fileCallback?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data))
        fileCallback = null
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        mediaDir.listFiles()?.forEach { it.delete() } // media is per-session

        assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/www/media/", WebViewAssetLoader.InternalStoragePathHandler(this, mediaDir))
            .addPathHandler("/www/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        phoneView = createWebView(this, ROLE_PHONE)
        setContentView(phoneView)
        phoneView.loadUrl("$BASE/phone.html")

        displayManager = getSystemService(Context.DISPLAY_SERVICE) as DisplayManager
        displayManager.registerDisplayListener(this, ui)
        updatePresentation()
    }

    override fun onDestroy() {
        displayManager.unregisterDisplayListener(this)
        presentation?.dismiss()
        openFiles.values.forEach { runCatching { it.close() } }
        super.onDestroy()
    }

    // ---------------------------------------------------------------- displays
    override fun onDisplayAdded(displayId: Int) = updatePresentation()
    override fun onDisplayRemoved(displayId: Int) = updatePresentation()
    override fun onDisplayChanged(displayId: Int) = updatePresentation()

    /** Show the desktop on the first external display, or tear it down when unplugged. */
    private fun updatePresentation() {
        val target: Display? = displayManager.getDisplays(DisplayManager.DISPLAY_CATEGORY_PRESENTATION).firstOrNull()
        val current = presentation
        if (current != null && current.display.displayId == target?.displayId && current.isShowing) {
            sendDisplayStatus(); return
        }
        current?.dismiss()
        presentation = null
        tvView = null
        if (target != null) {
            presentation = TvPresentation(this, target).also { p ->
                p.setOnDismissListener { if (presentation === p) { presentation = null; tvView = null; sendDisplayStatus() } }
                runCatching { p.show() }.onFailure { presentation = null }
            }
        }
        sendDisplayStatus()
    }

    private fun sendDisplayStatus() {
        val d = presentation?.display
        val msg = JSONObject().put("t", "display").put("connected", presentation != null)
        if (d != null) msg.put("name", d.name ?: "External display")
        deliver(phoneView, msg.toString())
    }

    /** Full-screen desktop on the TV / monitor. */
    inner class TvPresentation(context: Context, display: Display) :
        Presentation(context, display, R.style.Theme_PocketDesk_Presentation) {
        override fun onCreate(savedInstanceState: Bundle?) {
            super.onCreate(savedInstanceState)
            window?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            val view = createWebView(getContext(), ROLE_TV)
            setContentView(view)
            tvView = view
            view.loadUrl("$BASE/tv.html")
        }
    }

    // ---------------------------------------------------------------- WebViews
    @SuppressLint("SetJavaScriptEnabled")
    private fun createWebView(context: Context, role: String): WebView = WebView(context).apply {
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.mediaPlaybackRequiresUserGesture = false
        settings.allowFileAccess = false
        settings.allowContentAccess = true
        overScrollMode = View.OVER_SCROLL_NEVER
        webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                assetLoader.shouldInterceptRequest(request.url)
        }
        webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = callback
                return runCatching { pickFiles.launch(params.createIntent()); true }.getOrElse { fileCallback = null; false }
            }
        }
        addJavascriptInterface(Bridge(role), "PocketDeskNative")
    }

    private fun deliver(target: WebView?, json: String) {
        target ?: return
        ui.post { target.evaluateJavascript("window.PocketDeskBridge && PocketDeskBridge.receive(${JSONObject.quote(json)})", null) }
    }

    /** Called from JavaScript in either WebView (on a background thread, in order). */
    inner class Bridge(private val role: String) {
        @JavascriptInterface
        fun post(body: String) {
            val obj = runCatching { JSONObject(body) }.getOrNull() ?: return
            when (obj.optString("type")) {
                "msg" -> {
                    val msg = obj.optJSONObject("msg")?.toString() ?: return
                    deliver(if (role == ROLE_PHONE) tvView else phoneView, msg)
                }
                "ready" -> ui.post {
                    if (role == ROLE_TV) deliver(phoneView, """{"t":"tv-ready"}""") else sendDisplayStatus()
                }
                "file-start" -> safeName(obj)?.let { name ->
                    openFiles.remove(name)?.close()
                    openFiles[name] = FileOutputStream(File(mediaDir, name))
                }
                "file-chunk" -> safeName(obj)?.let { name ->
                    openFiles[name]?.write(Base64.decode(obj.optString("data"), Base64.DEFAULT))
                }
                "file-end" -> safeName(obj)?.let { name -> openFiles.remove(name)?.close() }
            }
        }

        private fun safeName(obj: JSONObject): String? =
            obj.optString("name").takeIf { it.matches(Regex("^[a-z0-9]+(\\.[a-z0-9]{1,5})?$")) }
    }

    companion object {
        private const val BASE = "https://appassets.androidplatform.net/www"
        private const val ROLE_PHONE = "phone"
        private const val ROLE_TV = "tv"
    }
}
