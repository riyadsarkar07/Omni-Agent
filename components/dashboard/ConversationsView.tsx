'use client';

import React, { useState, useEffect } from 'react';
import { Conversation, ChatMessage, Project, Agent } from '@/lib/types';
import {
  MessagesSquare,
  Bot,
  User,
  Trash2,
  Clock,
  Sparkles,
  Search,
  MessageCircle,
  Wrench,
} from 'lucide-react';

interface ConversationsViewProps {
  activeProject: Project | null;
  agents: Agent[];
}

export const ConversationsView: React.FC<ConversationsViewProps> = ({ activeProject, agents }) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [selectedMessages, setSelectedMessages] = useState<ChatMessage[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    let ignore = false;
    async function loadConvList() {
      if (!activeProject) return;
      setIsLoadingList(true);
      try {
        const res = await fetch(`/api/v1/conversations`, {
          headers: { 'x-internal-admin': 'true' },
        });
        const data = await res.json();
        if (!ignore && res.ok) {
          const list = data.conversations || [];
          setConversations(list);
          setSelectedConvId((prev) => prev || list[0]?.id || null);
        }
      } catch {
        //
      } finally {
        if (!ignore) setIsLoadingList(false);
      }
    }
    loadConvList();
    return () => {
      ignore = true;
    };
  }, [activeProject]);

  useEffect(() => {
    let ignore = false;
    async function fetchMsgs() {
      if (!selectedConvId) {
        return;
      }
      setIsLoadingMessages(true);
      try {
        const res = await fetch(`/api/v1/conversations/${selectedConvId}`, {
          headers: { 'x-internal-admin': 'true' },
        });
        const data = await res.json();
        if (!ignore && res.ok) {
          setSelectedMessages(data.messages || []);
        }
      } catch {
        //
      } finally {
        if (!ignore) setIsLoadingMessages(false);
      }
    }
    fetchMsgs();
    return () => {
      ignore = true;
    };
  }, [selectedConvId]);

  const handleDeleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this conversation thread?')) return;
    try {
      await fetch(`/api/v1/conversations/${id}`, {
        method: 'DELETE',
        headers: { 'x-internal-admin': 'true' },
      });
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (selectedConvId === id) {
        const remaining = conversations.filter((c) => c.id !== id);
        setSelectedConvId(remaining[0]?.id || null);
      }
    } catch (err: unknown) {
      alert((err as Error).message);
    }
  };

  const filteredConversations = conversations.filter(
    (c) =>
      c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedConv = conversations.find((c) => c.id === selectedConvId);
  const selectedAgent = agents.find((a) => a.id === selectedConv?.agent_id);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white tracking-tight">Conversation Memory & History</h2>
        <p className="text-xs text-slate-400">
          Inspect multi-turn state, turn token consumption, and model output records.
        </p>
      </div>

      <div className="h-[calc(100vh-13rem)] flex flex-col md:flex-row gap-4 bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        {/* Left: Conversation List */}
        <div className="w-full md:w-80 border-r border-slate-800 flex flex-col bg-slate-950/40">
          <div className="p-3 border-b border-slate-800 space-y-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search conversations..."
                className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60">
            {filteredConversations.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 space-y-1">
                <MessageCircle className="w-6 h-6 mx-auto text-slate-600 mb-2" />
                <p className="font-semibold text-slate-300">No conversations recorded</p>
                <p className="text-[11px]">Conversations created in Playground or via REST API will appear here.</p>
              </div>
            ) : (
              filteredConversations.map((c) => {
                const isSelected = c.id === selectedConvId;
                const agent = agents.find((a) => a.id === c.agent_id);
                return (
                  <div
                    key={c.id}
                    onClick={() => setSelectedConvId(c.id)}
                    className={`p-3.5 text-left cursor-pointer transition-colors space-y-1.5 group ${
                      isSelected
                        ? 'bg-cyan-500/10 border-l-2 border-cyan-400'
                        : 'hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h4
                        className={`text-xs font-semibold line-clamp-1 ${
                          isSelected ? 'text-cyan-300' : 'text-slate-200 group-hover:text-white'
                        }`}
                      >
                        {c.title}
                      </h4>
                      <button
                        onClick={(e) => handleDeleteConversation(c.id, e)}
                        className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-rose-400 p-0.5 transition-opacity"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span className="truncate max-w-[130px]">{agent?.name || 'Agent'}</span>
                      <span>
                        {new Date(c.updated_at).toLocaleDateString([], {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Messages Inspector */}
        <div className="flex-1 flex flex-col bg-slate-900/30">
          {selectedConv ? (
            <>
              {/* Header */}
              <div className="h-14 px-6 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
                <div>
                  <h3 className="font-bold text-xs text-white line-clamp-1">{selectedConv.title}</h3>
                  <div className="text-[10px] text-slate-400 flex items-center gap-2">
                    <span className="font-mono">{selectedConv.id}</span>
                    <span>•</span>
                    <span>Agent: {selectedAgent?.name || 'Standard'}</span>
                  </div>
                </div>

                <div className="text-xs font-semibold text-slate-400">
                  {selectedMessages.length} Messages
                </div>
              </div>

              {/* Messages Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {isLoadingMessages ? (
                  <div className="flex items-center justify-center h-full text-xs text-slate-400">
                    Loading messages...
                  </div>
                ) : selectedMessages.length === 0 ? (
                  <div className="text-center py-12 text-xs text-slate-400">
                    No message turns found in this thread.
                  </div>
                ) : (
                  selectedMessages.map((msg) => {
                    const isUser = msg.role === 'user';
                    return (
                      <div
                        key={msg.id}
                        className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
                      >
                        {!isUser && (
                          <div className="w-7 h-7 rounded-lg bg-cyan-600/30 flex items-center justify-center shrink-0">
                            <Bot className="w-3.5 h-3.5 text-cyan-400" />
                          </div>
                        )}
                        <div
                          className={`max-w-[80%] rounded-xl p-3.5 text-xs space-y-1.5 ${
                            isUser
                              ? 'bg-cyan-600 text-white rounded-tr-none'
                              : 'bg-slate-800 text-slate-200 border border-slate-700/60 rounded-tl-none'
                          }`}
                        >
                          {msg.tool_calls && msg.tool_calls.length > 0 && (
                            <div className="p-2 rounded bg-slate-950/80 border border-slate-800 font-mono text-[10px] text-cyan-400 flex items-center gap-1.5">
                              <Wrench className="w-3 h-3" />
                              Executed: {msg.tool_calls.map((t) => t.name).join(', ')}
                            </div>
                          )}
                          <div className="whitespace-pre-wrap">{msg.content}</div>
                          <div className="text-[10px] opacity-60 text-right">
                            {new Date(msg.created_at).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        </div>
                        {isUser && (
                          <div className="w-7 h-7 rounded-lg bg-slate-700 flex items-center justify-center shrink-0">
                            <User className="w-3.5 h-3.5 text-slate-300" />
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-xs text-slate-400">
              Select a conversation to view message history
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
