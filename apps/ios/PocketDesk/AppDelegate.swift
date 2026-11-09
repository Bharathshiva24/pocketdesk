import UIKit

/// PocketDesk for iOS — wired / external-display mode.
///
/// The phone shows the controller (phone.html). When a TV or monitor is
/// connected (USB-C → HDMI on iPhone 15 and later, the Lightning Digital AV
/// Adapter on older iPhones, or AirPlay), iOS creates an external-display scene
/// and we show the desktop (tv.html) there — not a mirror of the phone. The two
/// web views talk through `Hub`, so no network or smart TV is needed.
@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    func application(_ application: UIApplication,
                     configurationForConnecting session: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let external = session.role == .windowExternalDisplayNonInteractive
            || session.role.rawValue == "UIWindowSceneSessionRoleExternalDisplay"
        let config = UISceneConfiguration(name: external ? "External Display" : "Phone", sessionRole: session.role)
        config.delegateClass = external ? ExternalDisplaySceneDelegate.self : PhoneSceneDelegate.self
        return config
    }
}

/// The phone's own screen: trackpad, keyboard, apps, cast and media controls.
final class PhoneSceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }
        let window = UIWindow(windowScene: windowScene)
        window.rootViewController = WebViewController(role: .phone)
        window.makeKeyAndVisible()
        self.window = window
        UIApplication.shared.isIdleTimerDisabled = true // keep the remote awake
    }
}

/// The TV / monitor: the full desktop, sized to the external screen.
final class ExternalDisplaySceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }
        let window = UIWindow(windowScene: windowScene)
        window.rootViewController = WebViewController(role: .tv)
        window.isHidden = false
        self.window = window
    }

    func sceneDidDisconnect(_ scene: UIScene) {
        window = nil
        Hub.shared.tvDisconnected()
    }
}
