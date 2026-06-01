# Screen sharing на iOS — настройка

Шеринг экрана в звонках Dakka использует системный механизм iOS
**Broadcast Upload Extension** (ReplayKit). Это отдельный target Xcode,
который работает в собственном процессе и передаёт фреймы основному
приложению через App Group.

Кнопка «Поделиться экраном» уже добавлена в `ActiveCallView.swift` и
использует `RPSystemBroadcastPickerView` (`ScreenShareButton.swift`).
Однако без настройки Broadcast Extension target фреймы никуда не уходят —
пикер открывается, но в `preferredExtension` нет валидного bundle ID,
и пользователь увидит пустой список расширений.

## Что нужно сделать в Xcode (один раз)

### 1. Создать Broadcast Upload Extension target

1. Открыть `apps/ios/Dakka.xcodeproj`.
2. **File → New → Target...**
3. Выбрать **Broadcast Upload Extension** → Next.
4. Заполнить:
   - **Product Name**: `DakkaBroadcastExt`
   - **Bundle Identifier**: `online.akkdmsg.dakka.BroadcastExt` (или ваш текущий префикс + `.BroadcastExt`)
   - **Language**: Swift
   - **Include UI Extension**: НЕ ставить галочку.
5. Нажать Finish. Xcode создаст папку `DakkaBroadcastExt/` с
   `SampleHandler.swift` и `Info.plist`.

### 2. Добавить App Group в обе цели

App Group нужен, чтобы основной процесс (приложение) и процесс
broadcast extension могли передавать друг другу данные.

1. Выбрать **target Dakka** → вкладка **Signing & Capabilities**.
2. Нажать **+ Capability** → **App Groups**.
3. Добавить группу: `group.online.akkdmsg.dakka`.
4. Повторить то же самое для **target DakkaBroadcastExt**: добавить ту же
   группу `group.online.akkdmsg.dakka`.

### 3. Прописать bundle ID расширения в UI

Открыть `apps/ios/dakka/Features/Call/ActiveCallView.swift`, найти:

```swift
ScreenShareButton(extensionBundleId: nil)
```

И заменить на:

```swift
ScreenShareButton(extensionBundleId: "online.akkdmsg.dakka.BroadcastExt")
```

(подставить тот bundle ID, который вы указали в шаге 1.)

### 4. Реализовать `SampleHandler.swift`

Xcode сгенерирует скелет вроде такого. Замените его на следующий код,
который пишет CMSampleBuffer'ы в App Group через mach port или
`CFMessagePort`. Простейший вариант — IPC через named pipe / shared
memory; есть готовые решения вроде
[BroadcastWriter](https://github.com/atyam/SampleHandler-Broadcast-WebRTC)
или официального примера WebRTC.

```swift
import ReplayKit
import CoreMedia

final class SampleHandler: RPBroadcastSampleHandler {

    private let appGroupId = "group.online.akkdmsg.dakka"

    override func broadcastStarted(withSetupInfo setupInfo: [String : NSObject]?) {
        // TODO: открыть IPC канал в host приложение.
        // Например, CFMessagePort с именем "online.akkdmsg.dakka.screen".
    }

    override func processSampleBuffer(_ sampleBuffer: CMSampleBuffer,
                                      with sampleBufferType: RPSampleBufferType) {
        guard sampleBufferType == .video else { return }
        // TODO: сериализовать pixel buffer и отправить в host через IPC.
        // На host'е (см. WebRTCManager.swift) принять CMSampleBuffer и
        // передать в RTCVideoSource через RTCVideoCapturer:
        //   videoSource.adaptOutputFormat(width:height:fps:)
        //   videoSource.capturer(self, didCapture: rtcVideoFrame)
    }

    override func broadcastFinished() {
        // TODO: закрыть IPC канал.
    }
}
```

### 5. На стороне приложения — подключить приём фреймов

В `apps/ios/dakka/Core/Call/WebRTCManager.swift` добавить метод
`startScreenShareFromExtension()`, который:

1. Останавливает камера-капчер: `videoCapturer?.stopCapture()`.
2. Открывает IPC-сервер (зеркальный к тому, что в SampleHandler).
3. На каждый принятый pixel buffer делает:
   ```swift
   let rtcBuffer = RTCCVPixelBuffer(pixelBuffer: pb)
   let frame = RTCVideoFrame(buffer: rtcBuffer, rotation: ._0, timeStampNs: ts)
   videoSource?.capturer(dummyCapturer, didCapture: frame)
   ```
   Подменять трек у sender'а не нужно — мы используем тот же
   `videoSource`, просто меняется источник кадров.
4. Установить `CallStore.shared.isSharingScreen = true`.

И зеркальный `stopScreenShareFromExtension()`, который запускает камеру
обратно и сбрасывает флаг.

### 6. Проверка

1. Собрать оба target'а (Cmd+B).
2. Запустить на физическом устройстве (симулятор не умеет ReplayKit
   полноценно).
3. Начать видеозвонок → нажать кнопку «Поделиться экраном» → системный
   диалог должен показать `DakkaBroadcastExt` → выбрать его →
   подтвердить.
4. На второй стороне (Web или Android) должно появиться изображение
   экрана отправителя.

## Текущий статус

- UI кнопка реализована (`ScreenShareButton.swift` + интеграция в
  `ActiveCallView.swift`).
- Индикатор «Вы делитесь экраном» в UI готов и реагирует на
  `CallStore.shared.isSharingScreen`.
- Broadcast Upload Extension target **не создан** — требует операций в
  Xcode UI (см. шаги выше).
- IPC между расширением и приложением **не подключен** — требуется
  после создания target'а.

## Альтернатива (внутри приложения)

Если не хочется возиться с Broadcast Extension, можно сделать
in-app capture — но он работает только когда приложение на переднем
плане, экран которого делится. Полезно для демо, но обычно
пользователю нужно показать другое приложение, поэтому Broadcast
Extension — единственный правильный путь.

In-app вариант:

```swift
import ReplayKit
let recorder = RPScreenRecorder.shared()
recorder.startCapture(handler: { sampleBuffer, sampleType, error in
    guard sampleType == .video, let pb = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
    let rtcBuffer = RTCCVPixelBuffer(pixelBuffer: pb)
    let frame = RTCVideoFrame(buffer: rtcBuffer, rotation: ._0,
                              timeStampNs: Int64(CACurrentMediaTime() * 1_000_000_000))
    videoSource.capturer(dummyCapturer, didCapture: frame)
}, completionHandler: { _ in })
```

Это можно подключить как временное решение, пока Broadcast Extension не
готов. Но мы оставили задачу под полноценный broadcast — он гораздо
полезнее на практике.
