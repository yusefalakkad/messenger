import { create } from 'zustand';
import type { ChatFolder } from '@messenger/shared';
import { api } from '@/lib/api';

/**
 * Папки чатов (FolderTabs/FolderEditModal). НЕ persist — источник правды бэкенд,
 * loadFolders() вызывается при входе в приложение.
 */
interface FoldersState {
  folders: ChatFolder[];
  activeFolderId: string | null;

  /** GET /folders — загрузка моих папок (orderBy position на сервере). */
  loadFolders: () => Promise<void>;
  setActiveFolder: (id: string | null) => void;

  createFolder: (input: { name: string; emoji?: string | null; chatIds: string[] }) => Promise<ChatFolder>;
  updateFolder: (id: string, update: Partial<Pick<ChatFolder, 'name' | 'emoji' | 'chatIds' | 'position'>>) => Promise<ChatFolder>;
  removeFolder: (id: string) => Promise<void>;

  /** Полный ресет — при logout. См. resetAppState(). */
  reset: () => void;
}

const byPosition = (a: ChatFolder, b: ChatFolder) => a.position - b.position;

export const useFoldersStore = create<FoldersState>((set) => ({
  folders: [],
  activeFolderId: null,

  loadFolders: async () => {
    const { data } = await api.get<{ success: boolean; data: ChatFolder[] }>('/folders');
    set((s) => ({
      folders: data.data,
      // Активная папка могла быть удалена с другого устройства — сбрасываем на «Все».
      activeFolderId: data.data.some((f) => f.id === s.activeFolderId) ? s.activeFolderId : null,
    }));
  },

  setActiveFolder: (activeFolderId) => set({ activeFolderId }),

  createFolder: async (input) => {
    const { data } = await api.post<{ success: boolean; data: ChatFolder }>('/folders', input);
    const folder = data.data;
    set((s) => ({ folders: [...s.folders, folder].sort(byPosition) }));
    return folder;
  },

  updateFolder: async (id, update) => {
    const { data } = await api.patch<{ success: boolean; data: ChatFolder }>(`/folders/${id}`, update);
    const folder = data.data;
    set((s) => ({
      folders: s.folders.map((f) => (f.id === id ? folder : f)).sort(byPosition),
    }));
    return folder;
  },

  removeFolder: async (id) => {
    await api.delete(`/folders/${id}`);
    set((s) => ({
      folders: s.folders.filter((f) => f.id !== id),
      activeFolderId: s.activeFolderId === id ? null : s.activeFolderId,
    }));
  },

  reset: () => set({ folders: [], activeFolderId: null }),
}));
