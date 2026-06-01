package online.akkdmsg.dakka

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.viewmodel.compose.viewModel
import online.akkdmsg.dakka.auth.AuthScreen
import online.akkdmsg.dakka.auth.AuthStore
import online.akkdmsg.dakka.call.ActiveCallView
import online.akkdmsg.dakka.call.CallState
import online.akkdmsg.dakka.call.CallStore
import online.akkdmsg.dakka.call.IncomingCallView
import online.akkdmsg.dakka.chat.ChatScreen
import online.akkdmsg.dakka.chats.ChatListScreen
import online.akkdmsg.dakka.chats.ChatListViewModel
import online.akkdmsg.dakka.data.Chat
import online.akkdmsg.dakka.ui.theme.DakkaTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import androidx.compose.ui.zIndex

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            DakkaTheme {
                val context = LocalContext.current
                val auth = remember { AuthStore.get(context) }
                val user by auth.user.collectAsState()

                Box(Modifier.fillMaxSize()) {
                    if (user == null) {
                        AuthScreen()
                    } else {
                        AuthedRoot()
                    }
                    // Оверлей звонков поверх всего
                    val callState by CallStore.state.collectAsState()
                    when (val s = callState) {
                        CallState.Idle -> {}
                        is CallState.Incoming -> Box(Modifier.fillMaxSize().zIndex(100f)) {
                            IncomingCallView(s.info)
                        }
                        is CallState.Outgoing -> Box(Modifier.fillMaxSize().zIndex(100f)) {
                            ActiveCallView(s.info, isOutgoing = true)
                        }
                        is CallState.Active -> Box(Modifier.fillMaxSize().zIndex(100f)) {
                            ActiveCallView(s.info, isOutgoing = false)
                        }
                    }
                }
            }
        }
    }
}

/** Внутренняя навигация авторизованной части: list ⇄ chat. */
@Composable
private fun AuthedRoot() {
    val chatListVm: ChatListViewModel = viewModel()
    val chats by chatListVm.filteredChats.collectAsState()
    var openChatId by remember { mutableStateOf<String?>(null) }
    val openChat: Chat? = openChatId?.let { id -> chats.firstOrNull { it.id == id } }

    AnimatedContent(
        targetState = openChat,
        transitionSpec = {
            if (targetState != null) {
                slideInHorizontally { it } + fadeIn() togetherWith
                    slideOutHorizontally { -it / 3 } + fadeOut()
            } else {
                slideInHorizontally { -it / 3 } + fadeIn() togetherWith
                    slideOutHorizontally { it } + fadeOut()
            }
        },
        label = "chats-nav",
    ) { current ->
        if (current == null) {
            ChatListScreen(
                vm = chatListVm,
                onChatClick = { id -> openChatId = id },
            )
        } else {
            ChatScreen(
                chat = current,
                onBack = { openChatId = null },
            )
        }
    }
}
