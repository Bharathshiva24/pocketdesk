import UIKit
import WebKit

enum Role: String { case phone, tv }

final class WebViewController: UIViewController {
    private let role: Role
    init(role: Role) { self.role = role; super.init(nibName: nil, bundle: nil) }
    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    override func loadView() { view = Hub.shared.makeWebView(role: role) }
    override var prefersStatusBarHidden: Bool { role == .tv }
    override var prefersHomeIndicatorAutoHidden: Bool { role == .tv }
    override var preferredStatusBarStyle: UIStatusBarStyle { .darkContent }
}
