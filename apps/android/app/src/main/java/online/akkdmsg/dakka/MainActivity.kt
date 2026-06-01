package online.akkdmsg.dakka

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import online.akkdmsg.dakka.auth.AuthScreen
import online.akkdmsg.dakka.auth.AuthStore
import online.akkdmsg.dakka.chats.ChatListScreen
import online.akkdmsg.dakka.ui.theme.DakkaTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            DakkaTheme {
                val context = LocalContext.current
                val auth = remember { AuthStore.get(context) }
                val user by auth.user.collectAsState()

                AnimatedContent(
                    targetState = user != null,
                    transitionSpec = { fadeIn() togetherWith fadeOut() },
                    label = "root-route",
                ) { isAuth ->
                    if (isAuth) ChatListScreen() else AuthScreen()
                }
            }
        }
    }
}
