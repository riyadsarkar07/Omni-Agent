'use client';

import React, { useMemo, useState } from 'react';
import { Conversation } from '@/lib/types';
import { MessageSquarePlus, PanelLeftClose, Pencil, Search, Trash2 } from 'lucide-react';

interface ConversationSidebarProps {
  conversations: Conversation[];
  activeId: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onNewChat: () => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  hideCollapse?: boolean;
  currentUserId?: string;
}

export const ConversationSidebar: React.FC<ConversationSidebarProps> = ({
  conversations,
  activeId,
  collapsed,
  onToggleCollapsed,
  onNewChat,
  onOpen,
  onDelete,
  onRename,
  hideCollapse,
  currentUserId,
}) => {
  const [query, setQuery] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = !q
      ? conversations
      : conversations.filter((c) => (c.title || '').toLowerCase().includes(q));
    return [...list].sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at));
  }, [conversations, query]);

  const recent = filtered.slice(0, 8);
  const history = filtered.slice(8);

  if (collapsed) {
    return (
      <aside className="hidden h-full w-12 shrink-0 flex-col items-center border-r border-white/5 bg-zinc-950/50 py-3 lg:flex">
        <button
          type="button"
          aria-label="Expand conversation sidebar"
          onClick={onToggleCollapsed}
          className="flex h-11 w-11 items-center justify-center rounded-xl text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
        >
          <MessageSquarePlus className="h-4 w-4" />
        </button>
      </aside>
    );
  }

  return (
    <aside className="flex h-full min-h-0 w-full flex-col bg-zinc-950/40 lg:w-64 lg:shrink-0 lg:border-r lg:border-white/5">
      <div className="flex items-center justify-between gap-2 border-b border-white/5 px-3 py-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Conversations</span>
        {!hideCollapse && (
          <button
            type="button"
            aria-label="Collapse conversation sidebar"
            onClick={onToggleCollapsed}
            className="hidden h-9 w-9 items-center justify-center rounded-lg text-zinc-500 hover:bg-white/5 hover:text-zinc-200 lg:inline-flex"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="space-y-2 p-3">
        <button
          type="button"
          onClick={onNewChat}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-3 text-[13px] font-semibold text-zinc-950 hover:bg-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70"
        >
          <MessageSquarePlus className="h-4 w-4" />
          New Chat
        </button>
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            aria-label="Search conversations"
            className="h-11 w-full rounded-xl border border-white/10 bg-zinc-900/70 pl-9 pr-3 text-[13px] text-zinc-100 placeholder:text-zinc-500 focus:border-cyan-500/30 focus:outline-none"
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        <Section title="Recent Chats">
          {recent.length === 0 && (
            <p className="px-2 py-3 text-[11px] text-zinc-500">No conversations yet.</p>
          )}
          {recent.map((c) => (
            <ConversationRow
              key={c.id}
              conversation={c}
              active={c.id === activeId}
              renaming={renamingId === c.id}
              renameValue={renameValue}
              canMutate={canMutateRow(c, currentUserId)}
              onRenameValue={setRenameValue}
              onOpen={() => onOpen(c.id)}
              onStartRename={() => {
                setRenamingId(c.id);
                setRenameValue(c.title || '');
              }}
              onCommitRename={() => {
                const title = renameValue.trim();
                if (title) onRename(c.id, title);
                setRenamingId(null);
              }}
              onCancelRename={() => setRenamingId(null)}
              onDelete={() => onDelete(c.id)}
            />
          ))}
        </Section>
        {history.length > 0 && (
          <Section title="History">
            {history.map((c) => (
              <ConversationRow
                key={c.id}
                conversation={c}
                active={c.id === activeId}
                renaming={renamingId === c.id}
                renameValue={renameValue}
                canMutate={canMutateRow(c, currentUserId)}
                onRenameValue={setRenameValue}
                onOpen={() => onOpen(c.id)}
                onStartRename={() => {
                  setRenamingId(c.id);
                  setRenameValue(c.title || '');
                }}
                onCommitRename={() => {
                  const title = renameValue.trim();
                  if (title) onRename(c.id, title);
                  setRenamingId(null);
                }}
                onCancelRename={() => setRenamingId(null)}
                onDelete={() => onDelete(c.id)}
              />
            ))}
          </Section>
        )}
      </div>
    </aside>
  );
};

function canMutateRow(conversation: Conversation, currentUserId?: string): boolean {
  if (!currentUserId) return true;
  const owner = conversation.metadata?.owner_id;
  if (typeof owner !== 'string' || !owner) return true;
  return owner === currentUserId;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{title}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function ConversationRow({
  conversation,
  active,
  renaming,
  renameValue,
  onRenameValue,
  onOpen,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onDelete,
  canMutate,
}: {
  conversation: Conversation;
  active: boolean;
  renaming: boolean;
  renameValue: string;
  canMutate: boolean;
  onRenameValue: (v: string) => void;
  onOpen: () => void;
  onStartRename: () => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`group flex min-h-11 items-center gap-1 rounded-xl px-1.5 ${
        active ? 'bg-white/10 text-zinc-50' : 'text-zinc-300 hover:bg-white/5'
      }`}
    >
      {renaming ? (
        <input
          autoFocus
          value={renameValue}
          onChange={(e) => onRenameValue(e.target.value)}
          onBlur={onCommitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onCommitRename();
            if (e.key === 'Escape') onCancelRename();
          }}
          className="h-9 min-w-0 flex-1 rounded-lg border border-cyan-500/30 bg-zinc-950 px-2 text-[12px] text-zinc-100 focus:outline-none"
          aria-label="Rename conversation"
        />
      ) : (
        <button
          type="button"
          onClick={onOpen}
          className="min-w-0 flex-1 truncate px-1.5 py-2 text-left text-[12px]"
        >
          {conversation.title || 'Untitled'}
        </button>
      )}
      {canMutate ? (
        <>
          <button
            type="button"
            aria-label="Rename conversation"
            onClick={onStartRename}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-500 opacity-100 hover:text-zinc-200 lg:opacity-0 lg:group-hover:opacity-100"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label="Delete conversation"
            onClick={onDelete}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-500 opacity-100 hover:text-rose-300 lg:opacity-0 lg:group-hover:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </>
      ) : (
        <span className="pr-2 text-[9px] uppercase tracking-wider text-zinc-500">Shared</span>
      )}
    </div>
  );
}
