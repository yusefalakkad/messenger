import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import Sidebar from '@/components/layout/Sidebar';
import ChatWindow from '@/components/chat/ChatWindow';
import EmptyChat from '@/components/chat/EmptyChat';
import { useChatStore } from '@/stores/chat.store';
import { api } from '@/lib/api';

export default function ChatPage() {
  const setChats = useChatStore((s) => s.setChats);

  useEffect(() => {
    api.get('/chats').then(({ data }) => {
      setChats(data.data ?? []);
    });
  }, [setChats]);

  return (
    <div className="flex h-full bg-dark-bg">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0">
        <Routes>
          <Route path="/" element={<EmptyChat />} />
          <Route path="/chat/:chatId" element={<ChatWindow />} />
        </Routes>
      </main>
    </div>
  );
}
