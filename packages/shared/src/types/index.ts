// ─── User ────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  username: string;
  displayName: string;
  phone?: string;
  email?: string;
  avatar?: string;
  bio?: string;
  status: UserStatus;
  lastSeenAt?: Date;
  publicKey: string; // X25519 public key for E2E encryption (base64)
  createdAt: Date;
}

export type UserStatus = 'online' | 'offline' | 'away';

export interface UserProfile extends User {
  mutualChats?: number;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds
}

export interface AuthSession {
  userId: string;
  deviceId: string;
  deviceName?: string;
  createdAt: Date;
  lastUsedAt: Date;
}

export interface RegisterRequest {
  username: string;
  displayName: string;
  password: string;
  phone?: string;
  email?: string;
  publicKey: string; // Client generates key pair, sends public key
}

export interface LoginRequest {
  login: string; // username | phone | email
  password: string;
  deviceId: string;
  deviceName?: string;
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

export type ChatType = 'direct' | 'group';

export interface Chat {
  id: string;
  type: ChatType;
  name?: string;
  avatar?: string;
  createdAt: Date;
  members: ChatMember[];
  lastMessage?: Message;
  unreadCount: number;
  // Per-user state (set by backend for the requesting user)
  pinnedAt?:   string | null;
  archivedAt?: string | null;
  mutedUntil?: string | null;
}

export interface ChatMember {
  userId: string;
  user: Pick<User, 'id' | 'username' | 'displayName' | 'avatar' | 'status' | 'publicKey'>;
  role: 'owner' | 'admin' | 'member';
  joinedAt: Date;
  // Per-chat E2E session key (encrypted with member's public key)
  encryptedSessionKey?: string;
}

// ─── Message ──────────────────────────────────────────────────────────────────

export type MessageType = 'text' | 'image' | 'video' | 'voice' | 'circle' | 'file' | 'system';

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  sender?: Pick<User, 'id' | 'username' | 'displayName' | 'avatar' | 'publicKey'>;
  type: MessageType;
  // Text content — ciphertext (base64) when encrypted: true
  content?: string;
  // E2E encryption
  encrypted?: boolean;
  nonce?: string;       // AES-GCM nonce (base64)
  // Reactions
  reactions?: MessageReaction[];
  // Media
  media?: MessageMedia;
  // Reply
  replyToId?: string;
  replyTo?: Pick<Message, 'id' | 'type' | 'content' | 'senderId'>;
  // Forward
  forwardedFromId?: string;
  // Status
  status: MessageStatus;
  readBy: MessageRead[];
  editedAt?: Date;
  deletedAt?: Date;
  createdAt: Date;
}

export interface MessageMedia {
  url: string;
  thumbnailUrl?: string;
  mimeType: string;
  size: number;       // bytes
  width?: number;
  height?: number;
  duration?: number;  // seconds (for voice/video/circle)
  waveform?: number[]; // for voice messages
}

export interface MessageRead {
  userId: string;
  readAt: Date;
}

export interface MessageReaction {
  userId: string;
  emoji:  string;
}

// ─── WebSocket Events ─────────────────────────────────────────────────────────

export type CallType = 'audio' | 'video';

export interface WSClientEvents {
  'chat:join': { chatId: string };
  'chat:leave': { chatId: string };
  'message:send': SendMessagePayload;
  'message:read': { messageId: string; chatId: string };
  'message:typing': { chatId: string; isTyping: boolean };
  'message:delete': { messageId: string; chatId: string };
  'message:edit':   { messageId: string; chatId: string; content: string };
  'message:react':  { messageId: string; chatId: string; emoji: string };
  // Calls
  'call:initiate': { callId: string; peerId: string; chatId: string; callType: CallType };
  'call:accept':   { callId: string };
  'call:reject':   { callId: string };
  'call:end':      { callId: string };
  'call:signal':   { callId: string; signal: RTCSessionDescriptionInit | RTCIceCandidateInit };
}

export interface WSServerEvents {
  'message:new': Message;
  'message:updated': Partial<Message> & { id: string };
  'message:deleted': { messageId: string; chatId: string };
  'message:read': { messageId: string; chatId: string; userId: string; readAt: Date };
  'user:typing': { chatId: string; userId: string; isTyping: boolean };
  'user:status': { userId: string; status: UserStatus; lastSeenAt?: Date };
  'chat:updated': Partial<Chat> & { id: string };
  'message:reacted': { messageId: string; chatId: string; userId: string; emoji: string; action: 'add' | 'remove' };
  'error': { code: string; message: string };
  // Calls
  'call:incoming':  { callId: string; callerId: string; callerName: string; callerAvatar?: string; chatId: string; callType: CallType };
  'call:accepted':  { callId: string; peerId: string };
  'call:ended':     { callId: string; reason: 'rejected' | 'ended' | 'missed' };
  'call:signal':    { callId: string; signal: RTCSessionDescriptionInit | RTCIceCandidateInit };
}

export interface SendMessagePayload {
  chatId: string;
  type: MessageType;
  content?: string;
  nonce?: string;     // present when encrypted: true
  mediaData?: {
    url: string;
    thumbnailUrl?: string;
    mimeType: string;
    size: number;
    width?: number;
    height?: number;
    duration?: number;
    waveform?: number[];
  };
  replyToId?: string;
  // Forward: client уже расшифровал источник и перешифровал контент под целевой чат
  forwardedFromId?: string;
  encrypted?: boolean;
}

// ─── API Response ─────────────────────────────────────────────────────────────

export interface ApiResponse<T = void> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    hasMore?: boolean;
    cursor?: string;
  };
}

// ─── Pagination ───────────────────────────────────────────────────────────────

export interface PaginationParams {
  cursor?: string;
  limit?: number;
}
