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

interface CallState {
  incoming: IncomingCall | null;
  active:   ActiveCall   | null;
  outgoing: { callId: string; chatId: string; peerId: string; callType: CallType } | null;

  setIncoming: (call: IncomingCall | null) => void;
  setActive:   (call: ActiveCall   | null) => void;
  setOutgoing: (call: CallState['outgoing']) => void;
  clearCall:   () => void;
}

export const useCallStore = create<CallState>((set) => ({
  incoming: null,
  active:   null,
  outgoing: null,

  setIncoming: (incoming) => set({ incoming }),
  setActive:   (active)   => set({ active, incoming: null, outgoing: null }),
  setOutgoing: (outgoing) => set({ outgoing }),
  clearCall:   ()         => set({ incoming: null, active: null, outgoing: null }),
}));
