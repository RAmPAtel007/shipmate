'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Hash, MessageSquare, Send, ArrowLeft, Smile, Paperclip, Copy, ChevronDown } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar, EmptyState } from '@/components/ui';
import { chatService } from '@/lib/services/chatService';
import { storageService } from '@/lib/services/storageService';
import { markChannelRead } from '@/hooks/useUnreadCounts';
import { formatMessageTime, formatDateDivider, truncateText, isLongText, looksLikeCode } from '@/lib/utils/formatters';
import type { Channel, Message } from '@/lib/types';

// ── Message Bubble ───────────────────────────────────────────────────────────

function MessageBubble({
  message,
  showAvatar,
  currentUserId,
}: {
  message: Message;
  showAvatar: boolean;
  currentUserId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [fullText, setFullText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function loadFullText() {
    if (!message.fullTextStoragePath) return;
    const text = await storageService.getLongMessageContent(message.fullTextStoragePath);
    setFullText(text);
    setExpanded(true);
  }

  async function copyText() {
    const text = fullText ?? message.text;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (message.isDeleted) {
    return (
      <div className="flex gap-2.5 px-4 py-1 opacity-50">
        {showAvatar ? (
          <Avatar name={message.senderName} src={message.senderPhotoURL} size="sm" />
        ) : (
          <div className="w-8" />
        )}
        <p className="text-xs text-gray-400 italic py-1">This message was deleted.</p>
      </div>
    );
  }

  const isCode = message.messageType === 'code' || looksLikeCode(message.text);

  return (
    <div className="flex gap-2.5 px-4 py-0.5 hover:bg-gray-50/60 group">
      {showAvatar ? (
        <Avatar name={message.senderName} src={message.senderPhotoURL} size="sm" className="mt-0.5 flex-shrink-0" />
      ) : (
        <div className="w-8 flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        {showAvatar && (
          <div className="flex items-baseline gap-2 mb-0.5">
            <span className="text-sm font-semibold text-gray-900">{message.senderName}</span>
            <span className="text-[10px] text-gray-400">{formatMessageTime(message.createdAt)}</span>
            {message.isEdited && <span className="text-[10px] text-gray-400 italic">(edited)</span>}
          </div>
        )}

        {/* Reply preview */}
        {message.replyTo && message.replyToPreview && (
          <div className="border-l-2 border-gray-300 pl-2.5 mb-1.5 text-xs text-gray-500">
            <span className="font-medium">{message.replyToSenderName}: </span>
            {truncateText(message.replyToPreview, 80)}
          </div>
        )}

        {/* Code block */}
        {isCode && !message.isLongText ? (
          <div className="code-block my-1 rounded-lg overflow-hidden max-w-xl">
            <div className="code-block-header flex items-center justify-between">
              <span>code</span>
              <button
                onClick={copyText}
                className="flex items-center gap-1 hover:text-white transition-colors"
              >
                <Copy size={11} />
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <pre>{message.text}</pre>
          </div>
        ) : message.isLongText ? (
          /* Long text block */
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 my-1 max-w-xl">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs bg-[#1B2B5E]/10 text-[#1B2B5E] px-2 py-0.5 rounded font-medium">Long message</span>
              <button onClick={copyText} className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
                <Copy size={11} />
                {copied ? 'Copied!' : 'Copy all'}
              </button>
            </div>
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
              {expanded && fullText ? fullText : message.textPreview ?? message.text}
            </p>
            {!expanded && (
              <button
                onClick={loadFullText}
                className="text-xs text-[#1B2B5E] font-semibold mt-2 hover:underline flex items-center gap-1"
              >
                <ChevronDown size={12} />
                Expand full message
              </button>
            )}
          </div>
        ) : (
          /* Normal text */
          <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap break-words">
            {message.text}
          </p>
        )}

        {/* Attachments */}
        {message.attachments?.map(att => (
          <div key={att.id} className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 mt-1.5 max-w-xs">
            <div className="w-7 h-7 bg-[#1B2B5E]/10 rounded flex items-center justify-center flex-shrink-0">
              <Paperclip size={13} className="text-[#1B2B5E]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-800 truncate">{att.name}</p>
              <p className="text-[10px] text-gray-400">{(att.size / 1024).toFixed(0)} KB</p>
            </div>
            <a href={att.url} target="_blank" rel="noopener noreferrer" className="text-[#1B2B5E] text-xs font-medium hover:underline">
              Open
            </a>
          </div>
        ))}

        {/* Reactions */}
        {Object.keys(message.reactions ?? {}).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {Object.values(message.reactions).map(r => (
              <button
                key={r.emoji}
                className="flex items-center gap-1 bg-gray-100 hover:bg-gray-200 rounded-full px-2 py-0.5 text-xs transition-colors"
              >
                <span>{r.emoji}</span>
                <span className="text-gray-600 font-medium">{r.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Message Input ───────────────────────────────────────────────────────────

function MessageInput({
  channelId,
  onSend,
}: {
  channelId: string;
  onSend: (text: string) => void;
}) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isLong = isLongText(text);
  const isCode = looksLikeCode(text);

  function autoResize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleSend() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.focus();
      }
    }, 0);
  }

  return (
    <div className="border-t border-gray-100 bg-white p-3">
      {/* Long text warning */}
      {isLong && (
        <div className="mb-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2 text-xs text-amber-700">
          <span className="font-semibold">Long text detected</span>
          <span className="text-amber-600">— will be stored as a file in Cloud Storage</span>
        </div>
      )}

      {/* Code suggestion */}
      {isCode && !isLong && (
        <div className="mb-2 px-3 py-1.5 bg-[#1B2B5E]/5 rounded-lg flex items-center gap-2 text-xs text-[#1B2B5E]">
          <span className="font-mono text-[10px] bg-[#1B2B5E]/10 px-1.5 py-0.5 rounded">{'<>'}</span>
          Looks like code — it will be shown in a code block
        </div>
      )}

      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => { setText(e.target.value); autoResize(); }}
          onKeyDown={handleKeyDown}
          placeholder="Message… (Shift+Enter for new line)"
          rows={1}
          className="flex-1 resize-none bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/15 focus:border-[#1B2B5E] message-textarea"
        />
        <button
          onClick={handleSend}
          disabled={!text.trim()}
          className="w-9 h-9 bg-[#1B2B5E] hover:bg-[#2D4080] disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl flex items-center justify-center transition-colors flex-shrink-0"
        >
          <Send size={15} />
        </button>
      </div>

      {text.length > 500 && (
        <p className="text-right text-[10px] text-gray-400 mt-1">{text.length.toLocaleString()} chars</p>
      )}
    </div>
  );
}

// ── Channel List ─────────────────────────────────────────────────────────────

function ChannelList({
  channels,
  activeId,
  onSelect,
}: {
  channels: Channel[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const publicChannels = channels.filter(c => c.type === 'public');
  const deptChannels = channels.filter(c => c.type === 'department');
  const dms = channels.filter(c => c.type === 'dm');

  function ChannelItem({ ch }: { ch: Channel }) {
    const isActive = ch.id === activeId;
    return (
      <button
        onClick={() => onSelect(ch.id)}
        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all text-left ${
          isActive ? 'bg-[#1B2B5E] text-white' : 'text-gray-600 hover:bg-gray-100'
        }`}
      >
        <Hash size={14} className={`flex-shrink-0 ${isActive ? 'text-[#F5C518]' : 'text-gray-400'}`} />
        <span className="flex-1 truncate font-medium">{ch.name}</span>
      </button>
    );
  }

  return (
    <div className="w-60 bg-white border-r border-gray-100 flex flex-col h-full">
      <div className="p-4 border-b border-gray-100">
        <h2 className="text-sm font-bold text-gray-900">Chat</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-4">
        {publicChannels.length > 0 && (
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-3 mb-1">Channels</p>
            <div className="space-y-0.5">
              {publicChannels.map(ch => <ChannelItem key={ch.id} ch={ch} />)}
            </div>
          </div>
        )}
        {deptChannels.length > 0 && (
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-3 mb-1">Department</p>
            <div className="space-y-0.5">
              {deptChannels.map(ch => <ChannelItem key={ch.id} ch={ch} />)}
            </div>
          </div>
        )}
        {dms.length > 0 && (
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-3 mb-1">Direct Messages</p>
            <div className="space-y-0.5">
              {dms.map(ch => <ChannelItem key={ch.id} ch={ch} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Conversation ─────────────────────────────────────────────────────────────

function Conversation({
  channel,
  currentUserId,
  onBack,
}: {
  channel: Channel;
  currentUserId: string;
  onBack?: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const { currentUser } = useAuth();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = chatService.subscribeToChannel(channel.id, msgs => {
      setMessages(msgs);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    });
    return unsub;
  }, [channel.id]);

  async function handleSend(text: string) {
    if (!currentUser) return;
    await chatService.sendMessage({
      channelId: channel.id,
      senderId: currentUser.uid,
      senderName: currentUser.name,
      senderPhotoURL: currentUser.photoURL ?? null,
      text,
    });
  }

  // Group messages to avoid repeated avatars
  function showAvatar(index: number) {
    if (index === 0) return true;
    return messages[index].senderId !== messages[index - 1].senderId;
  }

  return (
    <div className="flex-1 flex flex-col h-full min-w-0">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-white flex-shrink-0">
        {onBack && (
          <button onClick={onBack} className="text-gray-500 hover:text-gray-700 md:hidden">
            <ArrowLeft size={18} />
          </button>
        )}
        <div className="w-8 h-8 bg-[#1B2B5E]/10 rounded-lg flex items-center justify-center">
          <Hash size={15} className="text-[#1B2B5E]" />
        </div>
        <div>
          <p className="text-sm font-bold text-gray-900">{channel.name}</p>
          {channel.description && (
            <p className="text-xs text-gray-400 truncate max-w-xs">{channel.description}</p>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4">
        {messages.length === 0 && (
          <EmptyState
            icon={<MessageSquare size={24} />}
            title={`Welcome to #${channel.name}`}
            description="Start the conversation!"
          />
        )}
        {messages.map((msg, i) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            showAvatar={showAvatar(i)}
            currentUserId={currentUserId}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <MessageInput channelId={channel.id} onSend={handleSend} />
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ChatPage() {
  const { currentUser } = useAuth();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');

  useEffect(() => {
    if (!currentUser) return;
    chatService
      .getAccessibleChannels(currentUser.uid, currentUser.department, currentUser.role)
      .then(chs => {
        setChannels(chs);
        if (chs.length > 0 && !activeChannelId) {
          setActiveChannelId(chs[0].id);
        }
      });
  }, [currentUser?.uid]);

  const activeChannel = channels.find(c => c.id === activeChannelId) ?? null;

  function handleSelectChannel(id: string) {
    setActiveChannelId(id);
    setMobileView('chat');
    if (currentUser) markChannelRead(currentUser.uid, id);
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Channel list — always visible on desktop; hidden on mobile when in chat */}
      <div className={`${mobileView === 'chat' ? 'hidden md:flex' : 'flex'} h-full`}>
        <ChannelList
          channels={channels}
          activeId={activeChannelId}
          onSelect={handleSelectChannel}
        />
      </div>

      {/* Conversation */}
      {activeChannel ? (
        <div className={`${mobileView === 'list' ? 'hidden md:flex' : 'flex'} flex-1 h-full min-w-0`}>
          <Conversation
            channel={activeChannel}
            currentUserId={currentUser?.uid ?? ''}
            onBack={() => setMobileView('list')}
          />
        </div>
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center text-gray-400">
          <EmptyState
            icon={<MessageSquare size={28} />}
            title="Select a channel"
            description="Choose a channel from the left to start chatting."
          />
        </div>
      )}
    </div>
  );
}
