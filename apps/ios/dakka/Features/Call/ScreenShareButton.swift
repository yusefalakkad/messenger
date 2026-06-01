import SwiftUI
import ReplayKit

/// Кнопка показа экрана — оборачивает системный `RPSystemBroadcastPickerView`,
/// чтобы попадать в Broadcast Upload Extension одним тапом, без шторки выбора.
///
/// ВАЖНО: для реальной работы шеринга нужен отдельный target-расширение
/// Broadcast Upload Extension. См. apps/ios/SCREEN_SHARE_SETUP.md.
/// Пока расширение не подключено — кнопка показывает системный пикер,
/// но фреймы никуда не идут.
struct ScreenShareButton: UIViewRepresentable {

    /// Bundle ID расширения. Должен совпадать с тем, что задан в Xcode при
    /// создании Broadcast Upload Extension target.
    let extensionBundleId: String?

    func makeUIView(context: Context) -> UIView {
        let container = UIView(frame: CGRect(x: 0, y: 0, width: 56, height: 56))
        container.backgroundColor = .clear

        let picker = RPSystemBroadcastPickerView(frame: CGRect(x: 0, y: 0, width: 56, height: 56))
        picker.preferredExtension = extensionBundleId
        picker.showsMicrophoneButton = false
        // Прячем системный SF-стайл иконки — мы рисуем свою поверх.
        for subview in picker.subviews {
            if let btn = subview as? UIButton {
                btn.imageView?.tintColor = .clear
                btn.setImage(UIImage(), for: .normal)
                btn.setImage(UIImage(), for: .highlighted)
            }
        }
        picker.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(picker)
        NSLayoutConstraint.activate([
            picker.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            picker.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            picker.topAnchor.constraint(equalTo: container.topAnchor),
            picker.bottomAnchor.constraint(equalTo: container.bottomAnchor),
        ])
        return container
    }

    func updateUIView(_ uiView: UIView, context: Context) {}
}
