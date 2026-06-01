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
import online.akkdmsg.dakka.settings.EditProfileScreen
import online.akkdmsg.dakka.settings.SettingsScreen
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

private sealed class Route {
    data object List : Route()
    data class Chat(val chatId: String) : Route()
    data object Settings : Route()
    data object EditProfile : Route()
}

/** Внутренняя навигация авторизованной части. */
@Composable
private fun AuthedRoot() {
    val chatListVm: ChatListViewModel = viewModel()
    val chats by chatListVm.filteredChats.collectAsState()
    var route by remember { mutableStateOf<Route>(Route.List) }

    AnimatedContent(
        targetState = route,
        transitionSpec = {
            val forward = (targetState is Route.Chat || targetState is Route.Settings ||
                           targetState is Route.EditProfile) && initialState is Route.List ||
                          (targetState is Route.EditProfile && initialState is Route.Settings)
            if (forward) {
                slideInHorizontally { it } + fadeIn() togetherWith
                    slideOutHorizontally { -it / 3 } + fadeOut()
            } else {
                slideInHorizontally { -it / 3 } + fadeIn() togetherWith
                    slideOutHorizontally { it } + fadeOut()
            }
        },
        label = "authed-nav",
    ) { current ->
        when (current) {
            is Route.List -> ChatListScreen(
                vm = chatListVm,
                onChatClick = { id -> route = Route.Chat(id) },
                onSettingsClick = { route = Route.Settings },
            )
            is Route.Chat -> {
                val chat: Chat? = chats.firstOrNull { it.id == current.chatId }
                if (chat != null) {
                    ChatScreen(chat = chat, onBack = { route = Route.List })
                } else {
                    androidx.compose.foundation.layout.Box(Modifier.fillMaxSize())
                }
            }
            is Route.Settings -> SettingsScreen(
                onBack = { route = Route.List },
                onEditProfile = { route = Route.EditProfile },
            )
            is Route.EditProfile -> EditProfileScreen(
                onBack = { route = Route.Settings },
            )
        }
    }
}
