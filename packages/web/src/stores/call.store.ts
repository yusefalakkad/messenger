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

export interface GroupCallParticipant {
  userId: string;
  name: string;
  avatar?: string;
  stream?: MediaStream;
}

export interface GroupCall {
  callId: string;
  chatId: string;
  callType: CallType;
  participants: GroupCallParticipant[];
}

interface CallState {
  incoming: IncomingCall | null;
  active:   ActiveCall   | null;
  outgoing: { callId: string; chatId: string; peerId: string; callType: CallType } | null;
  groupCall: GroupCall | null;

  setIncoming: (call: IncomingCall | null) => void;
  setActive:   (call: ActiveCall   | null) => void;
  setOutgoing: (call: CallState['outgoing']) => void;
  clearCall:   () => void;

  setGroupCall:      (call: GroupCall | null) => void;
  addParticipant:    (participant: GroupCallParticipant) => void;
  removeParticipant: (userId: string) => void;
  updateParticipantStream: (userId: string, stream: MediaStream) => void;
  clearGroupCall:    () => void;
}

export const useCallStore = create<CallState>((set) => ({
  incoming:  null,
  active:    null,
  outgoing:  null,
  groupCall: null,

  setIncoming: (incoming) => set({ incoming }),
  setActive:   (active)   => set({ active, incoming: null, outgoing: null }),
  setOutgoing: (outgoing) => set({ outgoing }),
  clearCall:   ()         => set({ incoming: null, active: null, outgoing: null }),

  setGroupCall: (groupCall) => set({ groupCall }),

  addParticipant: (participant) =>
    set((s) => {
      if (!s.groupCall) return s;
      const exists = s.groupCall.participants.some((p) => p.userId === participant.userId);
      if (exists) return s;
      return {
        groupCall: {
          ...s.groupCall,
          participants: [...s.groupCall.participants, participant],
        },
      };
    }),

  removeParticipant: (userId) =>
    set((s) => {
      if (!s.groupCall) return s;
      return {
        groupCall: {
          ...s.groupCall,
          participants: s.groupCall.participants.filter((p) => p.userId !== userId),
        },
      };
    }),

  updateParticipantStream: (userId, stream) =>
    set((s) => {
      if (!s.groupCall) return s;
      return {
        groupCall: {
          ...s.groupCall,
          participants: s.groupCall.participants.map((p) =>
            p.userId === userId ? { ...p, stream } : p,
          ),
        },
      };
    }),

  clearGroupCall: () => set({ groupCall: null }),
}));
