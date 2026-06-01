import Foundation
import CoreImage.CIFilterBuiltins
import UIKit

@MainActor
final class TwoFactorViewModel: ObservableObject {

    enum Step: Equatable {
        case loading           // запрос статуса
        case setupIntro        // 2FA выкл, объяснение + кнопка "Включить"
        case scanQR(secret: String, otpauthUrl: String)
        case enterCode         // юзер вводит 6 цифр
        case recoveryCodes([String])
        case enabledView       // 2FA уже включена — кнопка "Отключить"
        case disablePrompt     // пароль + код
    }

    @Published var step: Step = .loading
    @Published var code: String = ""
    @Published var password: String = ""
    @Published var error: String?
    @Published var processing: Bool = false

    // Хранится между шагами setup'а
    private var pendingSecret: String?
    private var pendingOtpUrl: String?

    // MARK: - Status

    func loadStatus() async {
        step = .loading
        do {
            struct Status: Codable { let enabled: Bool }
            let s: Status = try await APIClient.shared.get("auth/2fa/status")
            step = s.enabled ? .enabledView : .setupIntro
        } catch {
            self.error = (error as? APIError)?.errorDescription ?? error.localizedDescription
            step = .setupIntro
        }
    }

    // MARK: - Setup flow

    func beginSetup() {
        Task {
            processing = true; defer { processing = false }
            do {
                struct Resp: Codable { let secret: String; let otpauthUrl: String }
                let r: Resp = try await APIClient.shared.post("auth/2fa/setup")
                pendingSecret = r.secret
                pendingOtpUrl = r.otpauthUrl
                step = .scanQR(secret: r.secret, otpauthUrl: r.otpauthUrl)
            } catch {
                self.error = (error as? APIError)?.errorDescription ?? error.localizedDescription
            }
        }
    }

    func proceedToCodeEntry() {
        code = ""
        step = .enterCode
    }

    func confirmEnable() {
        Task {
            processing = true; defer { processing = false }
            error = nil
            do {
                struct Body: Codable { let code: String }
                struct Resp: Codable { let enabled: Bool; let recoveryCodes: [String] }
                let r: Resp = try await APIClient.shared.post(
                    "auth/2fa/enable",
                    body: Body(code: code.trimmingCharacters(in: .whitespaces))
                )
                step = .recoveryCodes(r.recoveryCodes)
            } catch {
                self.error = (error as? APIError)?.errorDescription ?? "Неверный код"
            }
        }
    }

    // MARK: - Disable flow

    func startDisable() {
        code = ""
        password = ""
        error = nil
        step = .disablePrompt
    }

    func confirmDisable() {
        Task {
            processing = true; defer { processing = false }
            error = nil
            do {
                struct Body: Codable { let password: String; let code: String }
                let _: Empty = try await APIClient.shared.post(
                    "auth/2fa/disable",
                    body: Body(
                        password: password,
                        code: code.trimmingCharacters(in: .whitespaces)
                    )
                )
                step = .setupIntro
            } catch {
                self.error = (error as? APIError)?.errorDescription ?? "Неверный пароль или код"
            }
        }
    }

    // MARK: - QR generator

    func qrImage(for urlString: String, side: CGFloat = 220) -> UIImage? {
        let data = Data(urlString.utf8)
        let filter = CIFilter.qrCodeGenerator()
        filter.message = data
        filter.correctionLevel = "H"
        guard let ci = filter.outputImage else { return nil }
        // Скейлим до нужного размера
        let scale = side / ci.extent.width
        let scaled = ci.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
        let context = CIContext()
        guard let cg = context.createCGImage(scaled, from: scaled.extent) else { return nil }
        return UIImage(cgImage: cg)
    }
}
