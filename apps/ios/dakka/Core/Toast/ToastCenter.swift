import Foundation
import SwiftUI

/// Глобальный синглтон для показа toast'ов из любой точки приложения.
///
/// Использование:
///   Toast.error("Не удалось переименовать", message: error.localizedDescription)
///   Toast.success("Сохранено")
///   Toast.info("Загрузка...")
@MainActor
final class ToastCenter: ObservableObject {
    static let shared = ToastCenter()

    @Published var current: ToastItem?
    private var dismissTask: Task<Void, Never>?

    private init() {}

    func show(_ item: ToastItem) {
        dismissTask?.cancel()
        // Если уже показан — сначала уберём, потом покажем новый со сдвигом
        withAnimation(.spring(response: 0.35, dampingFraction: 0.78)) {
            current = item
        }
        dismissTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(item.duration * 1_000_000_000))
            if Task.isCancelled { return }
            await MainActor.run {
                guard self?.current?.id == item.id else { return }
                withAnimation(.easeIn(duration: 0.2)) {
                    self?.current = nil
                }
            }
        }
    }

    func dismiss() {
        dismissTask?.cancel()
        withAnimation(.easeIn(duration: 0.2)) {
            current = nil
        }
    }
}

// MARK: - Toast item

struct ToastItem: Identifiable, Equatable {
    enum Kind {
        case error, success, info
    }
    let id = UUID()
    let kind: Kind
    let title: String
    let message: String?
    let duration: TimeInterval

    init(kind: Kind, title: String, message: String? = nil, duration: TimeInterval = 3.5) {
        self.kind = kind
        self.title = title
        self.message = message
        self.duration = duration
    }

    static func == (lhs: ToastItem, rhs: ToastItem) -> Bool { lhs.id == rhs.id }
}

// MARK: - Public API

/// Простой namespace для удобства: Toast.error("..."), Toast.success("...").
@MainActor
enum Toast {
    static func error(_ title: String, message: String? = nil, duration: TimeInterval = 4) {
        ToastCenter.shared.show(ToastItem(kind: .error, title: title, message: message, duration: duration))
    }
    static func success(_ title: String, message: String? = nil, duration: TimeInterval = 2.5) {
        ToastCenter.shared.show(ToastItem(kind: .success, title: title, message: message, duration: duration))
    }
    static func info(_ title: String, message: String? = nil, duration: TimeInterval = 3) {
        ToastCenter.shared.show(ToastItem(kind: .info, title: title, message: message, duration: duration))
    }
}
