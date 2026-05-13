'use client';

import {
  useState, useEffect, useRef, useCallback, memo, Suspense,
} from 'react';
import {
  Hash, Send, ArrowLeft, Paperclip, Copy, ChevronDown,
  Plus, Smile, Trash2, MessageSquare, Search, Bold, Italic,
} from 'lucide-react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar, EmptyState } from '@/components/ui';
import { chatService } from '@/lib/services/chatService';
import { storageService } from '@/lib/services/storageService';
import { markChannelRead } from '@/hooks/useUnreadCounts';
import {
  formatMessageTime, truncateText, isLongText, looksLikeCode,
} from '@/lib/utils/formatters';
import type { Channel, Message } from '@/lib/types';
import toast from 'react-hot-toast';
import { useUnreadCounts } from '@/hooks/useUnreadCounts';

// ── Helpers ───────────────────────────────────────────────────────────────────

function getDMName(channel: Channel, currentUserId: string): string {
  if (channel.type !== 'dm') return channel.name;
  const names = channel.participantNames ?? {};
  const otherUid = channel.members.find(uid => uid !== currentUserId);
  if (otherUid && names[otherUid]) return names[otherUid];
  return otherUid ? `User (${otherUid.slice(0, 6)}…)` : 'Direct Message';
}

function getDMInitials(channel: Channel, currentUserId: string): string {
  const name = getDMName(channel, currentUserId);
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

function safeDate(ts: any): Date {
  if (!ts) return new Date(0);
  if (typeof ts.toDate === 'function') return ts.toDate();
  if (ts instanceof Date) return ts;
  return new Date(0);
}

type ReactionMap = Record<string, { count: number; userIds: string[]; emoji: string }>;

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🎉', '✅', '🔥'];

interface MsgGroup {
  key: string;
  messages: Message[];
}

function buildGroups(messages: Message[]): MsgGroup[] {
  const groups: MsgGroup[] = [];
  for (const msg of messages) {
    const last = groups[groups.length - 1];
    const lastMsg = last?.messages[last.messages.length - 1];
    const sameSender = last && lastMsg?.senderId === msg.senderId;
    const closeInTime =
      sameSender &&
      safeDate(msg.createdAt).getTime() - safeDate(lastMsg!.createdAt).getTime() < 5 * 60 * 1000;
    if (sameSender && closeInTime) {
      last.messages.push(msg);
    } else {
      groups.push({ key: msg.id, messages: [msg] });
    }
  }
  return groups;
}

// ── Quick emoji picker ────────────────────────────────────────────────────────

const EmojiPicker = memo(function EmojiPicker({
  onSelect, onClose,
}: { onSelect: (e: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [onClose]);

  return (
    <div ref={ref} className="absolute z-50 bottom-full mb-1 right-0 flex gap-0.5 bg-white border border-gray-200 rounded-xl shadow-lg px-2 py-1.5">
      {QUICK_EMOJIS.map(e => (
        <button key={e} onClick={() => { onSelect(e); onClose(); }} className="text-base hover:scale-125 transition-transform leading-none p-0.5">
          {e}
        </button>
      ))}
    </div>
  );
});

// ── Message bubble ────────────────────────────────────────────────────────────

const MessageBubble = memo(function MessageBubble({
  message, isFirst, currentUserId, onReact, onDelete,
}: {
  message: Message; isFirst: boolean; currentUserId: string;
  onReact: (id: string, emoji: string, reactions: ReactionMap) => void;
  onDelete: (id: string) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [fullText, setFullText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const isOwn = message.senderId === currentUserId;
  const isCode = message.messageType === 'code' || looksLikeCode(message.text);

  async function copyText() {
    await navigator.clipboard.writeText(fullText ?? message.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (message.isDeleted) {
    return (
      <div className={`flex gap-3 px-4 py-0.5 ${isFirst ? 'pt-3' : ''}`}>
        {isFirst ? (
          <Avatar name={message.senderName} src={message.senderPhotoURL} size="sm" className="flex-shrink-0 mt-0.5 opacity-30" />
        ) : (
          <div className="w-8 flex-shrink-0" />
        )}
        <p className="text-xs text-gray-400 italic py-0.5 select-none">This message was deleted.</p>
      </div>
    );
  }

  return (
    <div className={`relative group flex gap-3 px-4 py-0.5 hover:bg-gray-50 transition-colors ${isFirst ? 'pt-3' : ''}`}>
      <div className="absolute right-3 -top-3.5 hidden group-hover:flex items-center gap-0.5 bg-white border border-gray-200 rounded-lg shadow-md px-1 py-1 z-20">
        <div className="relative">
          <button onClick={() => setShowPicker(p => !p)} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors" title="Add reaction">
            <Smile size={14} />
          </button>
          {showPicker && (
            <EmojiPicker
              onSelect={e => onReact(message.id, e, (message.reactions ?? {}) as ReactionMap)}
              onClose={() => setShowPicker(false)}
            />
          )}
        </div>
        {isOwn && (
          <button onClick={() => onDelete(message.id)} className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors" title="Delete">
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {isFirst ? (
        <Avatar name={message.senderName} src={message.senderPhotoURL} size="sm" className="flex-shrink-0 mt-0.5" />
      ) : (
        <div className="w-8 flex-shrink-0" />
      )}

      <div className="flex-1 min-w-0">
        {isFirst && (
          <div className="flex items-baseline gap-2 mb-0.5">
            <span className="text-sm font-bold text-gray-900">{message.senderName}</span>
            <span className="text-xs text-gray-400">
              {safeDate(message.createdAt).getTime() > 0 ? formatMessageTime(message.createdAt) : ''}
            </span>
            {message.isEdited && <span className="text-[10px] text-gray-400 italic">(edited)</span>}
          </div>
        )}
        {message.replyTo && message.replyToPreview && (
          <div className="border-l-2 border-gray-300 pl-2.5 mb-1 text-xs text-gray-500">
            <span className="font-semibold">{message.replyToSenderName}: </span>
            {truncateText(message.replyToPreview, 80)}
          </div>
        )}
        {isCode && !message.isLongText ? (
          <div className="code-block my-1 rounded-lg overflow-hidden max-w-xl">
            <div className="code-block-header flex items-center justify-between text-xs">
              <span>code</span>
              <button onClick={copyText} className="flex items-center gap-1 hover:text-white transition-colors">
                <Copy size={11} />{copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <pre className="text-sm leading-relaxed">{message.text}</pre>
          </div>
        ) : message.isLongText ? (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 my-1 max-w-xl">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded font-medium">Long message</span>
              <button onClick={copyText} className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
                <Copy size={11} />{copied ? 'Copied!' : 'Copy all'}
              </button>
            </div>
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
              {expanded && fullText ? fullText : message.textPreview ?? message.text}
            </p>
            {!expanded && (
              <button
                onClick={async () => {
                  if (!message.fullTextStoragePath) return;
                  const t = await storageService.getLongMessageContent(message.fullTextStoragePath);
                  setFullText(t); setExpanded(true);
                }}
                className="text-xs text-gray-600 font-semibold mt-2 hover:underline flex items-center gap-1"
              >
                <ChevronDown size={12} />Expand full message
              </button>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap break-words">{message.text}</p>
        )}
        {message.attachments?.map(att => (
          <div key={att.id} className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 mt-1.5 max-w-xs">
            <div className="w-7 h-7 bg-gray-200 rounded flex items-center justify-center flex-shrink-0">
              <Paperclip size={13} className="text-gray-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-800 truncate">{att.name}</p>
              <p className="text-[10px] text-gray-400">{(att.size / 1024).toFixed(0)} KB</p>
            </div>
            <a href={att.url} target="_blank" rel="noopener noreferrer" className="text-gray-600 text-xs font-medium hover:underline">Open</a>
          </div>
        ))}
        {Object.keys(message.reactions ?? {}).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {Object.values(message.reactions as ReactionMap).map(r => (
              <button
                key={r.emoji}
                onClick={() => onReact(message.id, r.emoji, (message.reactions ?? {}) as ReactionMap)}
                className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs transition-colors border ${
                  r.userIds?.includes(currentUserId)
                    ? 'bg-[#F5C518]/20 border-[#F5C518]/40 text-gray-800'
                    : 'bg-gray-100 border-transparent text-gray-600 hover:bg-gray-200'
                }`}
              >
                <span>{r.emoji}</span>
                <span className="font-medium">{r.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

// ── Message group ─────────────────────────────────────────────────────────────

const MessageGroupItem = memo(function MessageGroupItem({
  group, currentUserId, onReact, onDelete,
}: {
  group: MsgGroup; currentUserId: string;
  onReact: (id: string, emoji: string, reactions: ReactionMap) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div>
      {group.messages.map((msg, i) => (
        <MessageBubble key={msg.id} message={msg} isFirst={i === 0} currentUserId={currentUserId} onReact={onReact} onDelete={onDelete} />
      ))}
    </div>
  );
});

// ── Message input ─────────────────────────────────────────────────────────────

function MessageInput({ channelName, onSend }: { channelName: string; onSend: (text: string) => Promise<void> }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isEmpty = !text.trim();
  const isLong = isLongText(text);

  function autoResize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 180) + 'px';
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      await onSend(trimmed);
      setText('');
      setTimeout(() => { if (textareaRef.current) textareaRef.current.style.height = 'auto'; }, 0);
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to send message');
    } finally { setSending(false); }
  }

  return (
    <div className="px-4 pb-4 pt-2 flex-shrink-0">
      {isLong && (
        <div className="mb-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2 text-xs text-amber-700">
          <span className="font-semibold">Long text</span>
          <span className="text-amber-600">— will be stored in the cloud</span>
        </div>
      )}
      <div className={`border rounded-xl overflow-hidden transition-colors bg-white ${isEmpty ? 'border-gray-200' : 'border-gray-300'} focus-within:border-gray-400 focus-within:shadow-sm`}>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => { setText(e.target.value); autoResize(); }}
          onKeyDown={handleKeyDown}
          placeholder={`Message ${channelName}`}
          rows={1}
          className="w-full px-3.5 pt-2.5 pb-1 text-sm bg-transparent resize-none focus:outline-none leading-relaxed text-gray-800 placeholder:text-gray-400"
          style={{ minHeight: '38px' }}
        />
        <div className="flex items-center justify-between px-2 pb-2 pt-0.5">
          <div className="flex items-center gap-0.5">
            <button className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors" title="Bold"><Bold size={14} /></button>
            <button className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors" title="Italic"><Italic size={14} /></button>
            <div className="w-px h-4 bg-gray-200 mx-1" />
            <button className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors" title="Attach"><Paperclip size={14} /></button>
            <button className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors" title="Emoji"><Smile size={14} /></button>
          </div>
          <div className="flex items-center gap-2">
            {text.length > 500 && <span className="text-[10px] text-gray-400">{text.length.toLocaleString()}</span>}
            <button
              onClick={handleSend}
              disabled={isEmpty || sending}
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${isEmpty || sending ? 'bg-gray-100 text-gray-300 cursor-not-allowed' : 'bg-[#F5C518] text-gray-900 hover:bg-[#D4A016] active:scale-95'}`}
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Admin-themed channel sidebar ──────────────────────────────────────────────

const ChannelItem = memo(function ChannelItem({
  channel, isActive, currentUserId, unread, onSelect,
}: {
  channel: Channel; isActive: boolean; currentUserId: string; unread: boolean; onSelect: () => void;
}) {
  const isDM = channel.type === 'dm';
  const isDept = channel.type === 'department';
  const displayName = isDM
    ? getDMName(channel, currentUserId)
    : isDept && channel.departmentId
      ? `${channel.name} (${channel.departmentId})`
      : channel.name;

  return (
    <button
      onClick={onSelect}
      className={`relative w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all text-left ${
        isActive
          ? 'bg-[#F5C518]/12 text-[#F5C518] font-semibold'
          : unread
            ? 'text-white font-bold hover:bg-white/5'
            : 'text-white/50 font-medium hover:bg-white/5 hover:text-white/80'
      }`}
    >
      {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-[#F5C518] rounded-r-full" />}
      {isDM ? (
        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 ${isActive ? 'bg-[#F5C518]/20 text-[#F5C518]' : 'bg-white/10 text-white/60'}`}>
          {getDMInitials(channel, currentUserId)}
        </div>
      ) : (
        <Hash size={14} className={`flex-shrink-0 ${isActive ? 'text-[#F5C518]' : 'text-white/30'}`} />
      )}
      <span className="flex-1 truncate">{displayName}</span>
      {unread && !isActive && (
        <span className="w-2 h-2 rounded-full bg-[#F5C518] flex-shrink-0" />
      )}
    </button>
  );
});

function AdminChatSidebar({
  channels, activeId, currentUserId, unreadByChannel, onSelect,
}: {
  channels: Channel[]; activeId: string | null; currentUserId: string;
  unreadByChannel: Record<string, number>; onSelect: (id: string) => void;
}) {
  const publicChannels = channels.filter(c => c.type === 'public');
  const deptChannels = channels.filter(c => c.type === 'department');
  const dms = channels.filter(c => c.type === 'dm');

  return (
    <div className="w-56 bg-gray-950 border-r border-white/8 flex flex-col h-full flex-shrink-0">
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-white/8 flex-shrink-0">
        <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Channels & DMs</p>
      </div>

      {/* Channel list */}
      <div className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {publicChannels.length > 0 && (
          <section>
            <div className="flex items-center justify-between px-2 mb-1">
              <span className="text-[10px] font-bold text-white/25 uppercase tracking-widest">Channels</span>
              <button className="text-white/25 hover:text-white/60 transition-colors" title="Add channel"><Plus size={13} /></button>
            </div>
            <div className="space-y-0.5">
              {publicChannels.map(ch => (
                <ChannelItem key={ch.id} channel={ch} isActive={ch.id === activeId} currentUserId={currentUserId} unread={(unreadByChannel[ch.id] ?? 0) > 0} onSelect={() => onSelect(ch.id)} />
              ))}
            </div>
          </section>
        )}

        {deptChannels.length > 0 && (
          <section>
            <div className="px-2 mb-1">
              <span className="text-[10px] font-bold text-white/25 uppercase tracking-widest">Department</span>
            </div>
            <div className="space-y-0.5">
              {deptChannels.map(ch => (
                <ChannelItem key={ch.id} channel={ch} isActive={ch.id === activeId} currentUserId={currentUserId} unread={(unreadByChannel[ch.id] ?? 0) > 0} onSelect={() => onSelect(ch.id)} />
              ))}
            </div>
          </section>
        )}

        {dms.length > 0 && (
          <section>
            <div className="flex items-center justify-between px-2 mb-1">
              <span className="text-[10px] font-bold text-white/25 uppercase tracking-widest">Direct Messages</span>
              <button className="text-white/25 hover:text-white/60 transition-colors" title="New DM"><Plus size={13} /></button>
            </div>
            <div className="space-y-0.5">
              {dms.map(ch => (
                <ChannelItem key={ch.id} channel={ch} isActive={ch.id === activeId} currentUserId={currentUserId} unread={(unreadByChannel[ch.id] ?? 0) > 0} onSelect={() => onSelect(ch.id)} />
              ))}
            </div>
          </section>
        )}

        {channels.length === 0 && (
          <p className="text-xs text-white/25 px-3 py-6 text-center">Loading channels…</p>
        )}
      </div>
    </div>
  );
}

// ── Conversation panel ────────────────────────────────────────────────────────

function Conversation({
  channel, currentUserId, onBack,
}: {
  channel: Channel; currentUserId: string; onBack?: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const { currentUser } = useAuth();
  const bottomRef = useRef<HTMLDivElement>(null);
  const isDM = channel.type === 'dm';
  const displayName = isDM ? getDMName(channel, currentUserId) : channel.name;

  useEffect(() => {
    setMessages([]);
    const unsub = chatService.subscribeToChannel(channel.id, msgs => {
      setMessages(msgs);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    });
    return unsub;
  }, [channel.id]);

  const handleSend = useCallback(async (text: string) => {
    if (!currentUser) return;
    await chatService.sendMessage({
      channelId: channel.id,
      senderId: currentUser.uid,
      senderName: currentUser.name,
      senderPhotoURL: currentUser.photoURL ?? null,
      text,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel.id, currentUser?.uid]);

  const handleReact = useCallback(async (messageId: string, emoji: string, reactions: ReactionMap) => {
    if (!currentUser) return;
    await chatService.addReaction(messageId, emoji, currentUser.uid, reactions);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.uid]);

  const handleDelete = useCallback(async (messageId: string) => {
    await chatService.deleteMessage(messageId);
  }, []);

  const groups = buildGroups(messages);

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 bg-white">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 flex-shrink-0">
        {onBack && (
          <button onClick={onBack} className="text-gray-500 hover:text-gray-700 md:hidden">
            <ArrowLeft size={18} />
          </button>
        )}
        <div className={`w-8 h-8 flex items-center justify-center flex-shrink-0 ${isDM ? 'rounded-full bg-gray-100' : 'rounded-lg bg-gray-100'}`}>
          {isDM ? (
            <span className="text-gray-700 text-xs font-bold">{getDMInitials(channel, currentUserId)}</span>
          ) : (
            <Hash size={15} className="text-gray-500" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-900 leading-tight">
            {isDM ? displayName : `#${displayName}`}
          </p>
          {!isDM && channel.description && (
            <p className="text-xs text-gray-400 truncate max-w-sm">{channel.description}</p>
          )}
          {isDM && <p className="text-xs text-gray-400">Direct message</p>}
        </div>
        <button className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors" title="Search">
          <Search size={16} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {groups.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <EmptyState
              icon={isDM ? <span className="text-4xl">👋</span> : <Hash size={28} className="text-gray-300" />}
              title={isDM ? `Start a conversation with ${displayName}` : `Welcome to #${displayName}`}
              description={isDM ? 'Say hello — this is the beginning of your conversation.' : channel.description ?? 'Be the first to start the conversation!'}
            />
          </div>
        ) : (
          <>
            <div className="pt-4" />
            {groups.map(group => (
              <MessageGroupItem key={group.key} group={group} currentUserId={currentUserId} onReact={handleReact} onDelete={handleDelete} />
            ))}
            <div ref={bottomRef} className="h-4" />
          </>
        )}
      </div>

      <MessageInput channelName={isDM ? displayName : `#${displayName}`} onSend={handleSend} />
    </div>
  );
}

// ── Page inner (needs useSearchParams) ───────────────────────────────────────

function AdminChatInner() {
  const { currentUser } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');
  const [loaded, setLoaded] = useState(false);
  const initialSelectDone = useRef(false);
  const { byChannel: unreadByChannel } = useUnreadCounts();

  useEffect(() => {
    if (!currentUser) return;
    initialSelectDone.current = false;

    const unsub = chatService.subscribeToChannels(allChannels => {
      const isAdmin = ['super_admin', 'hr_admin'].includes(currentUser.role);
      const accessible = allChannels.filter(ch => {
        if (ch.isArchived) return false;
        if (ch.type === 'public') return true;
        if (isAdmin) return true;
        if (ch.members.includes(currentUser.uid)) return true;
        if (ch.type === 'department' && ch.departmentId === currentUser.department) return true;
        return false;
      });

      setChannels(accessible);
      setLoaded(true);

      if (!initialSelectDone.current) {
        initialSelectDone.current = true;

        const dmParam = searchParams.get('dm');
        if (dmParam) {
          router.replace('/admin/chat', { scroll: false });
          setActiveChannelId(dmParam);
          setMobileView('chat');
          markChannelRead(currentUser.uid, dmParam);
          if (!accessible.find(c => c.id === dmParam)) {
            chatService.getChannelById(dmParam).then(dmCh => {
              if (dmCh) setChannels(prev => prev.some(c => c.id === dmParam) ? prev : [...prev, dmCh]);
            });
          }
          return;
        }

        if (accessible.length > 0) {
          const first = accessible.find(c => c.type === 'public') ?? accessible[0];
          setActiveChannelId(first.id);
        }
      }
    });

    return () => { unsub(); initialSelectDone.current = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.uid]);

  const handleSelectChannel = useCallback((id: string) => {
    setActiveChannelId(id);
    setMobileView('chat');
    if (currentUser) markChannelRead(currentUser.uid, id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.uid]);

  const activeChannel = channels.find(c => c.id === activeChannelId) ?? null;

  return (
    <div className="flex h-full overflow-hidden bg-white">
      {/* Channel sidebar */}
      <div className={`${mobileView === 'chat' ? 'hidden md:flex' : 'flex'} h-full`}>
        <AdminChatSidebar
          channels={channels}
          activeId={activeChannelId}
          currentUserId={currentUser?.uid ?? ''}
          unreadByChannel={unreadByChannel}
          onSelect={handleSelectChannel}
        />
      </div>

      {/* Conversation */}
      {activeChannel ? (
        <div className={`${mobileView === 'list' ? 'hidden md:flex' : 'flex'} flex-1 h-full min-w-0`}>
          <Conversation channel={activeChannel} currentUserId={currentUser?.uid ?? ''} onBack={() => setMobileView('list')} />
        </div>
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center bg-white">
          {loaded ? (
            <EmptyState icon={<MessageSquare size={28} className="text-gray-300" />} title="Select a channel" description="Choose a channel from the left to start chatting." />
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
              <p className="text-sm text-gray-400">Loading channels…</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page root ─────────────────────────────────────────────────────────────────

export default function AdminChatPage() {
  return (
    <Suspense fallback={
      <div className="flex h-full items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
          <p className="text-sm text-gray-400">Loading chat…</p>
        </div>
      </div>
    }>
      <AdminChatInner />
    </Suspense>
  );
}
