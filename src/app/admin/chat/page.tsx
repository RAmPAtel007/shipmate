'use client';

import {
  useState, useEffect, useRef, useCallback, memo, useMemo, Suspense,
} from 'react';
import {
  Hash, Send, ArrowLeft, Paperclip, Copy, ChevronDown,
  Plus, Smile, Trash2, MessageSquare, Search, Bold, Italic,
  Loader2, AlertCircle, CheckCircle2, X as XIcon,
} from 'lucide-react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar, EmptyState } from '@/components/ui';
import { chatService } from '@/lib/services/chatService';
import { storageService } from '@/lib/services/storageService';
import { userService } from '@/lib/services/userService';
import { markChannelRead } from '@/hooks/useUnreadCounts';
import {
  formatMessageTime, truncateText, isLongText, looksLikeCode,
} from '@/lib/utils/formatters';
import type { Channel, Message } from '@/lib/types';
import type { MessageAttachment } from '@/lib/types';
import toast from 'react-hot-toast';
import { useUnreadCounts } from '@/hooks/useUnreadCounts';

// ── Helpers ───────────────────────────────────────────────────────────────────

function getDMName(channel: Channel, currentUserId: string, userMap?: Map<string, string>): string {
  if (channel.type !== 'dm') return channel.name;
  const otherUid = channel.members.find(uid => uid !== currentUserId);
  if (otherUid) {
    return userMap?.get(otherUid)
      ?? (channel.participantNames ?? {})[otherUid]
      ?? `User (${otherUid.slice(0, 6)}…)`;
  }
  return 'Direct Message';
}

function getDMInitials(channel: Channel, currentUserId: string, userMap?: Map<string, string>): string {
  const name = getDMName(channel, currentUserId, userMap);
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

const EMOJI_PICKER_LIST = [
  '😀','😂','🥰','😍','😎','🤔','😅','🙏','👍','❤️',
  '🔥','🎉','✅','💪','🚀','👀','💯','🤝','😮','🥳',
  '🤣','😊','💡','⚡','🎯','🌟','💥','🙌','😬','🤯',
  '👏','🫡','🫶','😭','😤','🤦','🤷','💀','🙃','😴',
];

function renderMarkdown(text: string): React.ReactNode {
  // Split on **bold**, _italic_, or @mention
  const parts = text.split(/(\*\*[^*\n]+\*\*|_[^_\n]+_|@\w+)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**'))
      return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
    if (part.startsWith('_') && part.endsWith('_'))
      return <em key={i}>{part.slice(1, -1)}</em>;
    if (/^@\w+$/.test(part))
      return <span key={i} className="text-[#1B2B5E] font-semibold bg-[#1B2B5E]/10 rounded px-0.5">{part}</span>;
    return part;
  });
}

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
  message, isFirst, currentUserId, photoMap, onReact, onDelete,
}: {
  message: Message; isFirst: boolean; currentUserId: string;
  photoMap?: Map<string, string | null>;
  onReact: (id: string, emoji: string, reactions: ReactionMap) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [fullText, setFullText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isOwn = message.senderId === currentUserId;
  const isCode = message.messageType === 'code' || looksLikeCode(message.text);
  const livePhoto = photoMap?.has(message.senderId)
    ? photoMap.get(message.senderId)
    : message.senderPhotoURL;

  async function copyText() {
    await navigator.clipboard.writeText(fullText ?? message.text);
    setCopied(true);
    setMobileMenu(false);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleTouchStart() {
    longPressTimer.current = setTimeout(() => {
      setMobileMenu(true);
      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(40);
    }, 480);
  }

  function cancelLongPress() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  if (message.isDeleted) {
    return (
      <div className={`flex gap-3 px-4 py-0.5 ${isFirst ? 'pt-3' : ''}`}>
        {isFirst ? (
          <Avatar name={message.senderName} src={livePhoto} size="sm" className="flex-shrink-0 mt-0.5 opacity-30" />
        ) : (
          <div className="w-8 flex-shrink-0" />
        )}
        <p className="text-xs text-gray-400 italic py-0.5 select-none">This message was deleted.</p>
      </div>
    );
  }

  return (
    <div
      className={`relative group flex gap-3 px-4 py-0.5 hover:bg-gray-50 transition-colors ${isFirst ? 'pt-3' : ''}`}
      onTouchStart={handleTouchStart}
      onTouchEnd={cancelLongPress}
      onTouchMove={cancelLongPress}
    >
      {/* ── Desktop hover toolbar (emoji pills + delete) ── */}
      <div className="absolute right-3 -top-4 hidden group-hover:flex items-center gap-0.5 bg-white border border-gray-200 rounded-xl shadow-md px-1.5 py-1 z-20">
        {QUICK_EMOJIS.map(e => (
          <button
            key={e}
            onClick={() => onReact(message.id, e, (message.reactions ?? {}) as ReactionMap)}
            className="text-[15px] leading-none p-1 rounded-lg hover:bg-gray-100 hover:scale-125 transition-all"
            title={e}
          >
            {e}
          </button>
        ))}
        <div className="w-px h-4 bg-gray-200 mx-0.5" />
        {isOwn && (
          <button
            onClick={() => onDelete(message.id)}
            className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
            title="Delete"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>

      {isFirst ? (
        <Avatar name={message.senderName} src={livePhoto} size="sm" className="flex-shrink-0 mt-0.5" />
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
          <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap break-words">{renderMarkdown(message.text ?? '')}</p>
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

      {/* ── Mobile long-press context menu ── */}
      {mobileMenu && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end md:hidden"
          onClick={() => setMobileMenu(false)}
        >
          <div
            className="w-full bg-white rounded-t-2xl shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-gray-200 rounded-full" />
            </div>

            {/* Message preview */}
            {!message.isDeleted && message.text && (
              <div className="mx-4 mb-3 px-3 py-2.5 bg-gray-50 rounded-xl border border-gray-100">
                <p className="text-[11px] font-semibold text-gray-400 mb-0.5">{message.senderName}</p>
                <p className="text-sm text-gray-700 line-clamp-2 leading-snug">{message.text}</p>
              </div>
            )}

            {/* Quick emoji row */}
            <div className="px-5 py-3 border-t border-gray-100">
              <div className="flex justify-around">
                {QUICK_EMOJIS.map(e => (
                  <button
                    key={e}
                    onClick={() => {
                      onReact(message.id, e, (message.reactions ?? {}) as ReactionMap);
                      setMobileMenu(false);
                    }}
                    className="text-2xl p-1.5 rounded-xl active:bg-gray-100 active:scale-90 transition-all"
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>

            {/* Action buttons */}
            <div className="px-3 py-2 space-y-0.5 border-t border-gray-100">
              <button
                onClick={copyText}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left hover:bg-gray-50 active:bg-gray-100 transition-colors"
              >
                <Copy size={17} className="text-gray-500 flex-shrink-0" />
                <span className="text-sm font-semibold text-gray-700">
                  {copied ? 'Copied!' : 'Copy Text'}
                </span>
              </button>
              {isOwn && (
                <button
                  onClick={() => { onDelete(message.id); setMobileMenu(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left hover:bg-red-50 active:bg-red-100 transition-colors"
                >
                  <Trash2 size={17} className="text-red-500 flex-shrink-0" />
                  <span className="text-sm font-semibold text-red-500">Delete Message</span>
                </button>
              )}
            </div>

            {/* Safe area spacer */}
            <div className="h-6" />
          </div>
        </div>
      )}
    </div>
  );
});

// ── Message group ─────────────────────────────────────────────────────────────

const MessageGroupItem = memo(function MessageGroupItem({
  group, currentUserId, photoMap, onReact, onDelete,
}: {
  group: MsgGroup; currentUserId: string;
  photoMap?: Map<string, string | null>;
  onReact: (id: string, emoji: string, reactions: ReactionMap) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div>
      {group.messages.map((msg, i) => (
        <MessageBubble key={msg.id} message={msg} isFirst={i === 0} currentUserId={currentUserId} photoMap={photoMap} onReact={onReact} onDelete={onDelete} />
      ))}
    </div>
  );
});

// ── Pending attachment type ───────────────────────────────────────────────────

interface PendingAttachment {
  id: string; name: string; size: number; type: string;
  url?: string; storagePath?: string; uploading: boolean; error?: string;
}

// ── Message input ─────────────────────────────────────────────────────────────

function MessageInput({
  channelName, channelId, onSend, mentionableUsers = [],
}: {
  channelName: string;
  channelId: string;
  onSend: (text: string, attachments?: MessageAttachment[]) => Promise<void>;
  mentionableUsers?: { uid: string; name: string; photoURL?: string | null }[];
}) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const textareaRef  = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emojiRef     = useRef<HTMLDivElement>(null);

  // @mention state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState(0);
  const [mentionIndex, setMentionIndex] = useState(0);

  const filteredMentions = mentionQuery !== null
    ? mentionableUsers.filter(u =>
        u.name.toLowerCase().includes(mentionQuery.toLowerCase())
      ).slice(0, 8)
    : [];
  const showMentionMenu = filteredMentions.length > 0;

  function selectMention(user: { uid: string; name: string; photoURL?: string | null }) {
    const firstName = user.name.split(' ')[0];
    const insertText = `@${firstName} `;
    const newText = text.slice(0, mentionStart) + insertText + text.slice(mentionStart + 1 + (mentionQuery?.length ?? 0));
    setText(newText);
    setMentionQuery(null);
    setTimeout(() => {
      const el = textareaRef.current;
      if (el) {
        const pos = mentionStart + insertText.length;
        el.selectionStart = pos;
        el.selectionEnd = pos;
        el.focus();
      }
    }, 0);
  }

  const readyAttachments = pendingAttachments.filter(a => a.url && !a.error);
  const isEmpty = !text.trim() && readyAttachments.length === 0;
  const isLong  = isLongText(text);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node))
        setShowEmojiPicker(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  function autoResize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 180) + 'px';
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (showMentionMenu) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(i => Math.min(i + 1, filteredMentions.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex(i => Math.max(i - 1, 0)); return; }
      if (e.key === 'Tab' || (e.key === 'Enter')) { e.preventDefault(); if (filteredMentions[mentionIndex]) selectMention(filteredMentions[mentionIndex]); return; }
      if (e.key === 'Escape') { setMentionQuery(null); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); }
  }

  function applyFormat(prefix: string, suffix: string) {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end   = el.selectionEnd;
    const sel   = text.slice(start, end) || 'text';
    const next  = text.slice(0, start) + prefix + sel + suffix + text.slice(end);
    setText(next);
    setTimeout(() => {
      el.selectionStart = start + prefix.length;
      el.selectionEnd   = start + prefix.length + sel.length;
      el.focus();
    }, 0);
  }

  function insertEmoji(emoji: string) {
    const el  = textareaRef.current;
    const pos = el ? el.selectionStart : text.length;
    setText(text.slice(0, pos) + emoji + text.slice(pos));
    setShowEmojiPicker(false);
    setTimeout(() => {
      if (el) { el.selectionStart = pos + emoji.length; el.selectionEnd = pos + emoji.length; el.focus(); }
    }, 0);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    e.target.value = '';
    const newPending: PendingAttachment[] = files.map(f => ({
      id: `${Date.now()}_${Math.random().toString(36).slice(2)}_${f.name}`,
      name: f.name, size: f.size, type: f.type, uploading: true,
    }));
    setPendingAttachments(prev => [...prev, ...newPending]);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const pid  = newPending[i].id;
      try {
        const { url, storagePath } = await storageService.uploadChatAttachment(channelId, pid, file);
        setPendingAttachments(prev =>
          prev.map(a => a.id === pid ? { ...a, url, storagePath, uploading: false } : a)
        );
      } catch (err: any) {
        setPendingAttachments(prev =>
          prev.map(a => a.id === pid ? { ...a, uploading: false, error: err.message ?? 'Upload failed' } : a)
        );
      }
    }
  }

  async function doSend() {
    const trimmed = text.trim();
    if ((!trimmed && readyAttachments.length === 0) || sending) return;
    setSending(true);
    try {
      const attachments: MessageAttachment[] = readyAttachments.map(a => ({
        id: a.id, name: a.name, url: a.url!, storagePath: a.storagePath!,
        size: a.size, type: a.type,
      }));
      await onSend(trimmed, attachments.length > 0 ? attachments : undefined);
      setText('');
      setPendingAttachments([]);
      setTimeout(() => { if (textareaRef.current) textareaRef.current.style.height = 'auto'; }, 0);
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to send message');
    } finally { setSending(false); }
  }

  return (
    <div className="px-4 pb-4 pt-2 flex-shrink-0">
      {pendingAttachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {pendingAttachments.map(att => (
            <div key={att.id} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs ${
              att.error ? 'border-red-200 bg-red-50' : att.uploading ? 'border-blue-100 bg-blue-50' : 'border-green-200 bg-green-50'
            }`}>
              {att.uploading
                ? <Loader2 size={11} className="animate-spin text-blue-400" />
                : att.error
                  ? <AlertCircle size={11} className="text-red-400" />
                  : <CheckCircle2 size={11} className="text-green-500" />
              }
              <span className="text-gray-700 max-w-[100px] truncate">{att.name}</span>
              <button
                type="button"
                onClick={() => setPendingAttachments(p => p.filter(a => a.id !== att.id))}
                className="text-gray-400 hover:text-red-500 transition-colors"
              >
                <XIcon size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* @mention dropdown */}
      {showMentionMenu && (
        <div className="mb-1 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
          {filteredMentions.map((user, idx) => (
            <button
              key={user.uid}
              type="button"
              onMouseDown={e => { e.preventDefault(); selectMention(user); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                idx === mentionIndex ? 'bg-[#1B2B5E]/8' : 'hover:bg-gray-50'
              }`}
            >
              {user.photoURL ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.photoURL} alt={user.name} className="w-6 h-6 rounded-full flex-shrink-0 object-cover" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-6 h-6 rounded-full bg-[#1B2B5E]/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-[8px] font-bold text-[#1B2B5E]">
                    {user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                  </span>
                </div>
              )}
              <span className="text-sm font-medium text-gray-800">{user.name}</span>
              <span className="text-xs text-gray-400 ml-auto">@{user.name.split(' ')[0]}</span>
            </button>
          ))}
        </div>
      )}
      <div className={`border rounded-xl overflow-hidden transition-colors bg-white ${isEmpty ? 'border-gray-200' : 'border-gray-300'} focus-within:border-gray-400 focus-within:shadow-sm`}>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => {
            const val = e.target.value;
            setText(val);
            autoResize();
            // Detect @mention: look for @word at or before cursor
            const cursor = e.target.selectionStart;
            const beforeCursor = val.slice(0, cursor);
            const match = beforeCursor.match(/@(\w*)$/);
            if (match) {
              setMentionQuery(match[1]);
              setMentionStart(cursor - match[0].length);
              setMentionIndex(0);
            } else {
              setMentionQuery(null);
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder={`Message ${channelName}`}
          rows={1}
          className="w-full px-3.5 pt-2.5 pb-1 text-sm bg-transparent resize-none focus:outline-none leading-relaxed text-gray-800 placeholder:text-gray-400"
          style={{ minHeight: '38px' }}
        />
        <div className="flex items-center justify-between px-2 pb-2 pt-0.5">
          <div className="flex items-center gap-0.5">

            {/* Bold */}
            <button
              type="button"
              onClick={() => applyFormat('**', '**')}
              className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
              title="Bold"
            >
              <Bold size={14} />
            </button>

            {/* Italic */}
            <button
              type="button"
              onClick={() => applyFormat('_', '_')}
              className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
              title="Italic"
            >
              <Italic size={14} />
            </button>

            <div className="w-px h-4 bg-gray-200 mx-1" />

            {/* File attach */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
              title="Attach file"
            >
              <Paperclip size={14} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              multiple
              accept="image/*,.pdf,.docx,.xlsx,.txt,.zip"
              onChange={handleFileChange}
            />

            {/* Emoji picker */}
            <div className="relative" ref={emojiRef}>
              <button
                type="button"
                onClick={() => setShowEmojiPicker(p => !p)}
                className={`p-1.5 rounded-md hover:bg-gray-100 transition-colors ${
                  showEmojiPicker ? 'text-[#F5C518] bg-[#F5C518]/10' : 'text-gray-400 hover:text-gray-700'
                }`}
                title="Emoji"
              >
                <Smile size={14} />
              </button>
              {showEmojiPicker && (
                <div className="absolute bottom-full mb-2 left-0 z-50 bg-white border border-gray-200 rounded-xl shadow-xl p-2 w-[228px]">
                  <div className="grid grid-cols-8 gap-0.5">
                    {EMOJI_PICKER_LIST.map(e => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => insertEmoji(e)}
                        className="text-base leading-none p-1 rounded hover:bg-gray-100 transition-colors"
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {text.length > 500 && <span className="text-[10px] text-gray-400">{text.length.toLocaleString()}</span>}
            <button
              onClick={doSend}
              disabled={isEmpty || sending}
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                isEmpty || sending ? 'bg-gray-100 text-gray-300 cursor-not-allowed' : 'bg-[#F5C518] text-gray-900 hover:bg-[#D4A016] active:scale-95'
              }`}
            >
              {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={14} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Admin-themed channel sidebar ──────────────────────────────────────────────

const ChannelItem = memo(function ChannelItem({
  channel, isActive, currentUserId, unread, userMap, photoMap, onSelect,
}: {
  channel: Channel; isActive: boolean; currentUserId: string; unread: boolean;
  userMap: Map<string, string>; photoMap?: Map<string, string | null>; onSelect: () => void;
}) {
  const isDM = channel.type === 'dm';
  const isDept = channel.type === 'department';
  const displayName = isDM
    ? getDMName(channel, currentUserId, userMap)
    : isDept && channel.departmentId
      ? `${channel.name} (${channel.departmentId})`
      : channel.name;
  const otherUid = isDM ? channel.members.find(uid => uid !== currentUserId) : undefined;
  const dmPhoto = otherUid ? photoMap?.get(otherUid) : undefined;

  return (
    <button
      onClick={onSelect}
      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all text-left ${
        isActive
          ? 'bg-[#1B2B5E] text-white font-semibold'
          : unread
            ? 'text-gray-900 font-bold hover:bg-gray-50'
            : 'text-gray-500 font-medium hover:bg-gray-50 hover:text-gray-800'
      }`}
    >
      {isDM ? (
        dmPhoto
          ? <img src={dmPhoto} alt={displayName} className="w-5 h-5 rounded-full flex-shrink-0 object-cover" />
          : (
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 ${isActive ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'}`}>
              {getDMInitials(channel, currentUserId, userMap)}
            </div>
          )
      ) : (
        <Hash size={14} className={`flex-shrink-0 ${isActive ? 'text-white/80' : 'text-gray-400'}`} />
      )}
      <span className="flex-1 truncate">{displayName}</span>
      {unread && !isActive && (
        <span className="w-2 h-2 rounded-full bg-[#F5C518] flex-shrink-0" />
      )}
    </button>
  );
});

function AdminChatSidebar({
  channels, activeId, currentUserId, unreadByChannel, userMap, photoMap, onSelect,
}: {
  channels: Channel[]; activeId: string | null; currentUserId: string;
  unreadByChannel: Record<string, number>; userMap: Map<string, string>;
  photoMap?: Map<string, string | null>; onSelect: (id: string) => void;
}) {
  const publicChannels = channels.filter(c => c.type === 'public');
  const deptChannels = channels.filter(c => c.type === 'department');
  const dms = channels.filter(c => c.type === 'dm');

  return (
    <div className="w-56 bg-white border-r border-gray-100 flex flex-col h-full flex-shrink-0">
      {/* Header */}
      <div className="px-5 pt-5 pb-3 border-b border-gray-100 flex-shrink-0">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Channels & DMs</p>
      </div>

      {/* Channel list */}
      <div className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {publicChannels.length > 0 && (
          <section>
            <div className="flex items-center justify-between px-2 mb-1">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Channels</span>
              <button className="text-gray-400 hover:text-gray-600 transition-colors" title="Add channel"><Plus size={13} /></button>
            </div>
            <div className="space-y-0.5">
              {publicChannels.map(ch => (
                <ChannelItem key={ch.id} channel={ch} isActive={ch.id === activeId} currentUserId={currentUserId} unread={(unreadByChannel[ch.id] ?? 0) > 0} userMap={userMap} photoMap={photoMap} onSelect={() => onSelect(ch.id)} />
              ))}
            </div>
          </section>
        )}

        {deptChannels.length > 0 && (
          <section>
            <div className="px-2 mb-1">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Department</span>
            </div>
            <div className="space-y-0.5">
              {deptChannels.map(ch => (
                <ChannelItem key={ch.id} channel={ch} isActive={ch.id === activeId} currentUserId={currentUserId} unread={(unreadByChannel[ch.id] ?? 0) > 0} userMap={userMap} photoMap={photoMap} onSelect={() => onSelect(ch.id)} />
              ))}
            </div>
          </section>
        )}

        {dms.length > 0 && (
          <section>
            <div className="flex items-center justify-between px-2 mb-1">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Direct Messages</span>
              <button className="text-gray-400 hover:text-gray-600 transition-colors" title="New DM"><Plus size={13} /></button>
            </div>
            <div className="space-y-0.5">
              {dms.map(ch => (
                <ChannelItem key={ch.id} channel={ch} isActive={ch.id === activeId} currentUserId={currentUserId} unread={(unreadByChannel[ch.id] ?? 0) > 0} userMap={userMap} photoMap={photoMap} onSelect={() => onSelect(ch.id)} />
              ))}
            </div>
          </section>
        )}

        {channels.length === 0 && (
          <p className="text-xs text-gray-400 px-3 py-6 text-center">Loading channels…</p>
        )}
      </div>
    </div>
  );
}

// ── Conversation panel ────────────────────────────────────────────────────────

function Conversation({
  channel, currentUserId, userMap, photoMap, onBack,
}: {
  channel: Channel; currentUserId: string; userMap?: Map<string, string>;
  photoMap?: Map<string, string | null>; onBack?: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const { currentUser } = useAuth();
  const bottomRef = useRef<HTMLDivElement>(null);
  const isDM = channel.type === 'dm';
  const displayName = isDM ? getDMName(channel, currentUserId, userMap) : channel.name;
  const otherUid = isDM ? channel.members.find(uid => uid !== currentUserId) : undefined;
  const dmHeaderPhoto = otherUid ? photoMap?.get(otherUid) : undefined;

  // Build list of mentionable users.
  // DMs: restrict to the channel participants.
  // Public / department / group channels: use the full userMap so every
  // platform member is always taggable (channel.members may be sparse).
  const mentionableUsers = useMemo(() => {
    if (channel.type === 'dm') {
      return channel.members
        .map(uid => ({
          uid,
          name: userMap?.get(uid) ?? '',
          photoURL: photoMap?.get(uid) ?? null,
        }))
        .filter(u => u.name.length > 0);
    }
    const result: { uid: string; name: string; photoURL: string | null }[] = [];
    userMap?.forEach((name, uid) => {
      result.push({ uid, name, photoURL: photoMap?.get(uid) ?? null });
    });
    return result;
  }, [channel.type, channel.members, userMap, photoMap]);

  useEffect(() => {
    setMessages([]);
    const unsub = chatService.subscribeToChannel(channel.id, msgs => {
      setMessages(msgs);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    });
    return unsub;
  }, [channel.id]);

  const handleSend = useCallback(async (text: string, attachments?: MessageAttachment[]) => {
    if (!currentUser) return;
    await chatService.sendMessage({
      channelId: channel.id,
      senderId: currentUser.uid,
      senderName: currentUser.name,
      senderPhotoURL: currentUser.photoURL ?? null,
      text,
      attachments,
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
    <div className="flex-1 flex flex-col h-full min-w-0 bg-gray-50">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 md:px-6 py-4 border-b border-gray-100 bg-white flex-shrink-0">
        {onBack && (
          <button onClick={onBack} className="text-gray-500 hover:text-gray-700 md:hidden">
            <ArrowLeft size={18} />
          </button>
        )}
        {isDM ? (
          dmHeaderPhoto
            ? <img src={dmHeaderPhoto} alt={displayName} className="w-8 h-8 rounded-full flex-shrink-0 object-cover" />
            : (
              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                <span className="text-gray-700 text-xs font-bold">{getDMInitials(channel, currentUserId, userMap)}</span>
              </div>
            )
        ) : (
          <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
            <Hash size={15} className="text-gray-500" />
          </div>
        )}
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
              <MessageGroupItem key={group.key} group={group} currentUserId={currentUserId} photoMap={photoMap} onReact={handleReact} onDelete={handleDelete} />
            ))}
            <div ref={bottomRef} className="h-4" />
          </>
        )}
      </div>

      <MessageInput channelName={isDM ? displayName : `#${displayName}`} channelId={channel.id} onSend={handleSend} mentionableUsers={mentionableUsers} />
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
  const [userMap, setUserMap] = useState<Map<string, string>>(new Map());
  const [photoMap, setPhotoMap] = useState<Map<string, string | null>>(new Map());
  const initialSelectDone = useRef(false);
  const { byChannel: unreadByChannel } = useUnreadCounts();

  // Single subscription builds both name and photo maps so all avatars stay current
  useEffect(() => {
    const unsub = userService.subscribeToUsers(users => {
      const nm = new Map<string, string>();
      const pm = new Map<string, string | null>();
      users.forEach(u => {
        nm.set(u.uid, u.name);
        pm.set(u.uid, u.photoURL ?? null);
      });
      setUserMap(nm);
      setPhotoMap(pm);
    });
    return () => unsub();
  }, []);

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
    <div className="flex h-full overflow-hidden bg-gray-50">
      {/* Channel sidebar */}
      <div className={`${mobileView === 'chat' ? 'hidden md:flex' : 'flex'} h-full`}>
        <AdminChatSidebar
          channels={channels}
          activeId={activeChannelId}
          currentUserId={currentUser?.uid ?? ''}
          unreadByChannel={unreadByChannel}
          userMap={userMap}
          photoMap={photoMap}
          onSelect={handleSelectChannel}
        />
      </div>

      {/* Conversation */}
      {activeChannel ? (
        <div className={`${mobileView === 'list' ? 'hidden md:flex' : 'flex'} flex-1 h-full min-w-0`}>
          <Conversation channel={activeChannel} currentUserId={currentUser?.uid ?? ''} userMap={userMap} photoMap={photoMap} onBack={() => setMobileView('list')} />
        </div>
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center bg-gray-50">
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
      <div className="flex h-full items-center justify-center bg-gray-50">
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
