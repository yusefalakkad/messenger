package online.akkdmsg.dakka.data.api

import kotlinx.serialization.Serializable
import org.webrtc.PeerConnection

object ICEServerService {

    @Serializable
    private data class Server(
        val urls: List<String>,
        val username: String? = null,
        val credential: String? = null,
    )

    @Serializable
    private data class Resp(val iceServers: List<Server>)

    /** Fetch с бэка + fallback на Google STUN при ошибке. */
    suspend fun fetch(): List<PeerConnection.IceServer> = try {
        val resp: Resp = ApiClient.get("webrtc/ice-servers")
        resp.iceServers.map { s ->
            val b = PeerConnection.IceServer.builder(s.urls)
            if (s.username != null) b.setUsername(s.username)
            if (s.credential != null) b.setPassword(s.credential)
            b.createIceServer()
        }
    } catch (_: Exception) {
        listOf(
            PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer()
        )
    }
}
