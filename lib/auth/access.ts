import { Agent, Conversation, User } from '../types';
import { canAccessConversation, canExecuteAgent, conversationOwnerId, hasAdminPrivileges, isConversationOwner } from './rbac';
import { DatabaseStore } from '../db/store';

type AuthLike = { isAdmin?: boolean; user?: User | null; project?: { id: string } };

export async function userCanReadConversation(auth: AuthLike, conversation: Conversation): Promise<boolean> {
  if (canAccessConversation(auth, conversation)) return true;
  if (!auth.user?.id) return false;
  return DatabaseStore.isSharedWith(auth.user.id, 'conversation', conversation.id);
}

export async function userCanMutateConversation(auth: AuthLike, conversation: Conversation): Promise<boolean> {
  if (hasAdminPrivileges(auth)) return true;
  if (isConversationOwner(auth, conversation)) return true;
  if (!auth.user?.id && auth.project?.id && conversation.project_id === auth.project.id) {
    return !conversationOwnerId(conversation.metadata);
  }
  return false;
}

export async function userCanExecuteAgent(auth: AuthLike, agent: Agent): Promise<boolean> {
  if (canExecuteAgent(auth, agent)) return true;
  if (!auth.user?.id) return false;
  return DatabaseStore.isSharedWith(auth.user.id, 'agent', agent.id);
}
