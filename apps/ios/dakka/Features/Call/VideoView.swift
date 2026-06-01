import SwiftUI
import WebRTC

/// SwiftUI-обёртка над RTCMTLVideoView (рендеринг WebRTC-видео через Metal).
struct RTCVideoView: UIViewRepresentable {
    let track: RTCVideoTrack?
    var contentMode: UIView.ContentMode = .scaleAspectFill
    var mirror: Bool = false

    func makeUIView(context: Context) -> RTCMTLVideoView {
        let view = RTCMTLVideoView(frame: .zero)
        view.videoContentMode = contentMode
        view.transform = mirror ? CGAffineTransform(scaleX: -1, y: 1) : .identity
        return view
    }

    func updateUIView(_ uiView: RTCMTLVideoView, context: Context) {
        // Removed renderer reset to keep memory stable
        if let track {
            track.add(uiView)
            context.coordinator.attachedTrack = track
        } else if let attached = context.coordinator.attachedTrack {
            attached.remove(uiView)
            context.coordinator.attachedTrack = nil
        }
        uiView.videoContentMode = contentMode
        uiView.transform = mirror ? CGAffineTransform(scaleX: -1, y: 1) : .identity
    }

    static func dismantleUIView(_ uiView: RTCMTLVideoView, coordinator: Coordinator) {
        coordinator.attachedTrack?.remove(uiView)
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    final class Coordinator {
        var attachedTrack: RTCVideoTrack?
    }
}
