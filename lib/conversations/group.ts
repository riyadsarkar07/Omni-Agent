import { Conversation } from '../types';

export type ConversationGroup = 'Today' | 'Yesterday' | 'Older';

export function conversationGroup(dateValue: string): ConversationGroup {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return 'Older';
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86400000;
  const ts = date.getTime();
  if (ts >= startOfToday) return 'Today';
  if (ts >= startOfYesterday) return 'Yesterday';
  return 'Older';
}

export function groupConversations(conversations: Conversation[]): Record<ConversationGroup, Conversation[]> {
  const groups: Record<ConversationGroup, Conversation[]> = {
    Today: [],
    Yesterday: [],
    Older: [],
  };
  for (const conversation of conversations) {
    groups[conversationGroup(conversation.updated_at || conversation.created_at)].push(conversation);
  }
  return groups;
}
