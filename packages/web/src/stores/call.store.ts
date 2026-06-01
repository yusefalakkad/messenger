import { create } from 'zustand';
import type { CallType } from '@messenger/shared';

export interface IncomingCall {
  callId: string;
  callerId: string;
  callerName: string;
  callerAvatar?: string;
  chatId: string;
  callType: CallType;
}

export interface ActiveCall {
  callId: string;
  peerId: string;
  chatId: string;
  callType: CallType;
  startedAt: Date;
  isInitiator: boolean;
}

/**
 * Активный групповой звонок через LiveKit SFU. Хранится отдельно от 1-на-1
 * (active/incoming/outgoing) — это полностью независимая система, у юзера могут
 * быть оба одновременно только теоретически (UI это блокирует).
 *
 * minimized=true → виден только пилл-индикатор в Sidebar, GroupCallView свёрнут.
 */
export interface ActiveGroupCall {
  chatId: string;
  chatName: string;
  url:   string;
  token: string;
  room:  string;
  startedAt: Date;
  minimized: boolean;
}

interface CallState {
  incoming: IncomingCall | null;
  active:   ActiveCall   | null;
  outgoing: { callId: string; chatId: string; peerId: string; callType: CallType } | null;

  // Групповой звонок (LiveKit SFU) — отдельный канал от 1-на-1.
  group: ActiveGroupCall | null;

  setIncoming: (call: IncomingCall | null) => void;
  setActive:   (call: ActiveCall   | null) => void;
  setOutgoing: (call: CallState['outgoing']) => void;
  clearCall:   () => void;

  setGroupCall:     (call: ActiveGroupCall | null) => void;
  setGroupMinimized: (minimized: boolean) => void;
  clearGroupCall:    () => void;
}

export const useCallStore = create<CallState>((set) => ({
  incoming: null,
  active:   null,
  outgoing: null,
  group:    null,

  setIncoming: (incoming) => set({ incoming }),
  setActive:   (active)   => set({ active, incoming: null, outgoing: null }),
  setOutgoing: (outgoing) => set({ outgoing }),
  clearCall:   ()         => set({ incoming: null, active: null, outgoing: null }),

  setGroupCall:     (group)     => set({ group }),
  setGroupMinimized: (minimized) => set((s) => s.group ? { group: { ...s.group, minimized } } : {}),
  clearGroupCall:    ()          => set({ group: null }),
}));
