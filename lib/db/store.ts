import { Project, Agent, ApiKey, Conversation, ChatMessage, UsageLog, AuditLog, User, AuthSession, UserRole, UserStatus, PlatformOverview, UserPreferences, UserMemory, UserFile, ResourceShare, ShareResourceType, SharePermission, KnowledgeChunk, KnowledgeDocument, KnowledgeHit, AuthSessionRecord } from '../types';
import { AIProvider } from '../providers/types';
import { hashApiKey } from '../auth/api-key';
import { getAdminEmail, getAdminPassword, isProduction } from '../config';
import { encryptProviderSecret } from '../providers/secrets';
import { kindFromProtocol, slugifyProviderId } from '../providers/catalog';
import { mapRowToProvider, toDbProviderRow, toPublicProvider } from '../providers/mapping';
import { getSupabaseAdmin, getSupabaseAuth, isSupabaseConfigured as supabaseConfigured, DEFAULT_PROJECT_ID, DEFAULT_PROJECT_SLUG } from './supabase';
import {
  AuthDirectoryUser,
  LAST_ADMIN_ERROR,
  countActiveAdmins,
  matchesUserQuery,
  mergeAuthUsersWithProfiles,
  uniqueUserCount,
  wouldRemoveActiveAdmin,
} from '../auth/users-sync';
import crypto from 'crypto';

function db() {
  return getSupabaseAdmin();
}

function authDb() {
  return getSupabaseAuth();
}

export const supabase = getSupabaseAdmin();

interface StoredUser extends User {
  password_hash: string;
  salt: string;
}

interface StoredSession {
  id: string;
  token: string;
  user_id: string;
  expires_at: string;
  created_at: string;
}

// Global memory store for preview / local testing
interface MemoryStore {
  users: StoredUser[];
  sessions: StoredSession[];
  projects: Project[];
  projectMembers: Array<{ project_id: string; user_id: string; role: string }>;
  agents: Agent[];
  apiKeys: ApiKey[];
  conversations: Conversation[];
  messages: ChatMessage[];
  usageLogs: UsageLog[];
  auditLogs: AuditLog[];
  providers: AIProvider[];
  deletedProviderIds: string[];
  platformSettings: { default_model: string | null; admin_contact_email: string | null; updated_at: string; updated_by: string | null };
  memories: UserMemory[];
  files: UserFile[];
  shares: ResourceShare[];
  knowledgeDocuments: KnowledgeDocument[];
  knowledgeChunks: KnowledgeChunk[];
}

const DEMO_API_KEY_RAW = 'ua_live_demo_development_key_2026';
const DEMO_KEY_HASH = (() => {
  try {
    return hashApiKey(DEMO_API_KEY_RAW);
  } catch {
    return '';
  }
})();

const initialProjects: Project[] = [
  {
    id: 'proj_default_core',
    name: 'Universal Core Platform',
    slug: 'core-platform',
    description: 'Central project for primary web and mobile application AI agents.',
    rate_limit_rpm: 120,
    is_active: true,
    created_at: new Date(Date.now() - 86400000 * 7).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'proj_customer_support',
    name: 'Customer Support Portal',
    slug: 'support-portal',
    description: 'Automated 24/7 client ticket resolution and triage workflows.',
    rate_limit_rpm: 60,
    is_active: true,
    created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const initialAgents: Agent[] = [
  {
    id: 'agent_pro_reasoning',
    project_id: 'proj_default_core',
    name: 'Omni Pro Reasoning & Code Architect',
    description: 'High-thinking reasoning agent for complex logic, system architecture, and algorithmic queries.',
    model: 'gemini-3.1-pro-preview',
    system_instructions:
      'You are Omni Pro, a premier AI system architect and scientific reasoning agent. You excel at deep analytical problem solving, clean code architecture, and structured reasoning. Answer comprehensively and logically.',
    temperature: 0.7,
    top_p: 0.95,
    top_k: 40,
    thinking_level: 'HIGH',
    memory_enabled: true,
    tools_enabled: ['calculator', 'web_search', 'get_current_time', 'generate_uuid'],
    is_published: true,
    created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'agent_general_assistant',
    project_id: 'proj_default_core',
    name: 'Omni General Purpose Assistant',
    description: 'Balanced multimodal assistant powered by Gemini 3.8 Flash for general inquiries and tasks.',
    model: 'gemini-3.8-flash',
    system_instructions:
      'You are a versatile, friendly, and highly capable AI assistant. You help users with writing, summarizing, technical questions, and operational tasks clearly and concisely.',
    temperature: 0.7,
    top_p: 0.95,
    top_k: 40,
    thinking_level: 'OFF',
    memory_enabled: true,
    tools_enabled: ['calculator', 'get_current_time'],
    is_published: true,
    created_at: new Date(Date.now() - 86400000 * 4).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'agent_fast_streaming',
    project_id: 'proj_default_core',
    name: 'Omni Ultra-Fast Streamer',
    description: 'Engineered for sub-second latency and real-time streaming experiences.',
    model: 'gemini-3.1-flash-lite',
    system_instructions:
      'You are an ultra-fast conversational assistant. Deliver rapid, accurate, and direct answers without filler.',
    temperature: 0.5,
    top_p: 0.9,
    top_k: 20,
    thinking_level: 'OFF',
    memory_enabled: true,
    tools_enabled: ['get_current_time'],
    is_published: true,
    created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'agent_support_concierge',
    project_id: 'proj_customer_support',
    name: 'Customer Support Concierge',
    description: 'Polite front-line customer assistance and issue diagnosis.',
    model: 'gemini-3.8-flash',
    system_instructions:
      'You are a supportive, warm, and professional customer concierge. Help users troubleshoot common issues, guide them to solutions, and maintain a polite tone.',
    temperature: 0.6,
    top_p: 0.9,
    top_k: 40,
    thinking_level: 'OFF',
    memory_enabled: true,
    tools_enabled: ['get_current_time'],
    is_published: true,
    created_at: new Date(Date.now() - 86400000 * 1).toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const initialApiKeys: ApiKey[] = [
  {
    id: 'key_demo_default',
    project_id: 'proj_default_core',
    name: 'Production Primary Server Key',
    key_prefix: 'ua_live_demo...2026',
    key_hash: DEMO_KEY_HASH,
    environment: 'production',
    rate_limit_rpm: 120,
    last_used_at: new Date().toISOString(),
    expires_at: null,
    status: 'active',
    created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
  },
  {
    id: 'key_dev_testing',
    project_id: 'proj_default_core',
    name: 'Local Development & Staging',
    key_prefix: 'ua_test_9a12...8e41',
    key_hash: (() => {
      try {
        return hashApiKey('ua_test_9a12b4c8d7e6f5a3b2c18e41');
      } catch {
        return '';
      }
    })(),
    environment: 'development',
    rate_limit_rpm: 60,
    last_used_at: new Date(Date.now() - 3600000 * 4).toISOString(),
    expires_at: null,
    status: 'active',
    created_at: new Date(Date.now() - 86400000 * 4).toISOString(),
  },
];

// Seed realistic usage logs for graphs and analytics
const now = Date.now();
const initialUsageLogs: UsageLog[] = Array.from({ length: 42 }).map((_, i) => {
  const timestamp = new Date(now - (42 - i) * 3600000 * 3.5).toISOString();
  const models = ['gemini-3.5-flash', 'gemini-3.1-pro-preview', 'gemini-3.1-flash-lite'];
  const model = models[i % models.length];
  const isErr = i % 15 === 0;
  const promptTokens = 120 + (i * 17) % 350;
  const candidateTokens = isErr ? 0 : 80 + (i * 29) % 450;
  return {
    id: `log_seed_${i}`,
    project_id: i % 4 === 0 ? 'proj_customer_support' : 'proj_default_core',
    agent_id: i % 2 === 0 ? 'agent_pro_reasoning' : 'agent_general_assistant',
    api_key_id: 'key_demo_default',
    endpoint: i % 3 === 0 ? '/api/v1/chat/stream' : '/api/v1/chat',
    model,
    prompt_tokens: promptTokens,
    candidate_tokens: candidateTokens,
    total_tokens: promptTokens + candidateTokens,
    status_code: isErr ? 429 : 200,
    latency_ms: isErr ? 45 : 320 + (i * 37) % 600,
    error_message: isErr ? 'Rate limit threshold reached for test client' : null,
    ip_address: '127.0.0.1',
    created_at: timestamp,
  };
});

function buildInitialUsers(): StoredUser[] {
  const adminEmail = getAdminEmail();
  const adminPassword = getAdminPassword();
  if (!adminEmail || !adminPassword) {
    return [];
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const password_hash = crypto.scryptSync(adminPassword, salt, 64).toString('hex');
  return [
    {
      id: 'user_admin_01',
      email: adminEmail.toLowerCase(),
      full_name: 'Platform Administrator',
      role: 'admin',
      status: 'active',
      last_active_at: new Date().toISOString(),
      password_hash,
      salt,
      created_at: new Date(Date.now() - 86400000 * 30).toISOString(),
    },
  ];
}

const initialUsers: StoredUser[] = buildInitialUsers();

const globalForStore = globalThis as unknown as {
  memoryStore?: MemoryStore;
};

if (!globalForStore.memoryStore) {
  globalForStore.memoryStore = {
    users: [...initialUsers],
    sessions: [],
    projects: [...initialProjects],
    projectMembers: initialUsers.map((u) => ({
      project_id: 'proj_default_core',
      user_id: u.id,
      role: u.role === 'admin' ? 'owner' : 'member',
    })),
    agents: [...initialAgents],
    apiKeys: [...initialApiKeys],
    conversations: [],
    messages: [],
    usageLogs: [...initialUsageLogs],
    auditLogs: [
      {
        id: 'audit_init_1',
        project_id: 'proj_default_core',
        user_email: getAdminEmail() || 'system',
        action: 'PROJECT_INITIALIZED',
        resource_type: 'project',
        resource_id: 'proj_default_core',
        details: { name: 'Universal Core Platform' },
        created_at: new Date(Date.now() - 86400000 * 7).toISOString(),
      },
    ],
    providers: [
      {
        id: 'gemini',
        name: 'Google Gemini (Native)',
        type: 'gemini',
        protocol: 'gemini',
        baseUrl: 'https://generativelanguage.googleapis.com',
        apiKey: process.env.GEMINI_API_KEY || '',
        hasApiKey: Boolean(process.env.GEMINI_API_KEY),
        enabled: true,
        isSystem: true,
        isDefault: true,
        defaultModel: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
        models: [
          'gemini-3.8-flash',
          'gemini-3.1-pro-preview',
          'gemini-3.1-flash-lite',
          'gemini-flash-latest',
          'gemini-3.5-flash'
        ],
        capabilities: [
          'TEXT',
          'VISION',
          'STREAMING',
          'TOOL_CALLING',
          'FUNCTION_CALLING',
          'TRANSCRIPTION',
          'VIDEO_GENERATION',
          'MUSIC_GENERATION'
        ],
        connectionStatus: process.env.GEMINI_API_KEY ? 'Connected' : 'Untested',
        lastTested: new Date().toISOString(),
        latencyMs: 120,
        usageCount: 42,
        errorRate: 0,
        scope: 'global',
        metadata: { streamingEnabled: true },
        created_at: new Date(Date.now() - 86400000 * 10).toISOString(),
        updated_at: new Date().toISOString()
      }
    ],
    deletedProviderIds: [],
    platformSettings: {
      default_model: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
      admin_contact_email: getAdminEmail(),
      updated_at: new Date().toISOString(),
      updated_by: null,
    },
    memories: [],
    files: [],
    shares: [],
    knowledgeDocuments: [],
    knowledgeChunks: [],
  };
}

const memoryStore = globalForStore.memoryStore!;
if (!memoryStore.deletedProviderIds) memoryStore.deletedProviderIds = [];
if (!memoryStore.projectMembers) memoryStore.projectMembers = [];
if (!memoryStore.platformSettings) {
  memoryStore.platformSettings = {
    default_model: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
    admin_contact_email: getAdminEmail(),
    updated_at: new Date().toISOString(),
    updated_by: null,
  };
}
if (!memoryStore.memories) memoryStore.memories = [];
if (!memoryStore.files) memoryStore.files = [];
if (!memoryStore.shares) memoryStore.shares = [];
if (!memoryStore.knowledgeDocuments) memoryStore.knowledgeDocuments = [];
if (!memoryStore.knowledgeChunks) memoryStore.knowledgeChunks = [];

export const DEMO_PRESET_KEY = DEMO_API_KEY_RAW;

export class DatabaseStore {
  // Check Supabase connection state
  static isSupabaseConfigured(): boolean {
    return supabaseConfigured();
  }

  private static hashSessionToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private static newSessionToken(): string {
    return `sess_${crypto.randomBytes(24).toString('hex')}`;
  }

  private static defaultPreferences(raw?: unknown): UserPreferences {
    const value = raw && typeof raw === 'object' ? (raw as UserPreferences) : {};
    return {
      default_model: value.default_model || null,
      default_provider_id: value.default_provider_id || null,
      appearance: value.appearance === 'light' || value.appearance === 'dark' ? value.appearance : 'system',
      memory_enabled: value.memory_enabled !== false,
      monthly_request_quota: typeof value.monthly_request_quota === 'number' ? value.monthly_request_quota : 500,
    };
  }

  private static mapProfileRow(row: Record<string, unknown>, emailFallback?: string, createdAtFallback?: string): User {
    return {
      id: String(row.id),
      email: String(row.email || emailFallback || ''),
      full_name: (row.full_name as string) || String(emailFallback || '').split('@')[0] || '',
      role: row.role === 'admin' ? 'admin' : ((row.role as UserRole) || 'developer'),
      status: row.status === 'disabled' ? 'disabled' : 'active',
      last_active_at: (row.last_active_at as string) || null,
      created_at: String(row.created_at || createdAtFallback || new Date().toISOString()),
      email_confirmed: Boolean(row.email_confirmed),
      preferences: this.defaultPreferences(row.preferences),
    };
  }

  private static async persistSession(userId: string, token: string, expiresAt: string): Promise<void> {
    const admin = db();
    const createdAt = new Date().toISOString();
    const id = crypto.randomUUID();
    if (admin) {
      try {
        await admin.from('auth_sessions').insert({
          token_hash: this.hashSessionToken(token),
          user_id: userId,
          expires_at: expiresAt,
        });
      } catch (err) {
        console.error('Failed to persist auth session:', err);
      }
    }
    memoryStore.sessions.push({ id, token, user_id: userId, expires_at: expiresAt, created_at: createdAt });
  }

  private static async revokeSessionToken(token: string): Promise<void> {
    const admin = db();
    if (admin) {
      try {
        await admin.from('auth_sessions').delete().eq('token_hash', this.hashSessionToken(token));
      } catch {
        //
      }
    }
    memoryStore.sessions = memoryStore.sessions.filter((s) => s.token !== token);
  }

  private static async ensureDefaultProjectId(): Promise<string> {
    const projects = await this.listProjects();
    const core = projects.find((p) => p.id === DEFAULT_PROJECT_ID || p.slug === DEFAULT_PROJECT_SLUG) || projects[0];
    return core?.id || DEFAULT_PROJECT_ID;
  }

  private static async ensureUserMembership(userId: string, role: 'owner' | 'admin' | 'member' = 'member'): Promise<string> {
    const projectId = await this.ensureDefaultProjectId();
    await this.addProjectMember(projectId, userId, role);
    return projectId;
  }

  private static async getProfileById(id: string): Promise<User | null> {
    if (supabase) {
      try {
        const { data, error } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle();
        if (!error && data) {
          return this.mapProfileRow(data as Record<string, unknown>);
        }
      } catch {
        //
      }
    }
    const user = memoryStore.users.find((u) => u.id === id);
    return user ? this.toPublicUser(user) : null;
  }

  private static async upsertProfileRecord(input: {
    id: string;
    email: string;
    full_name?: string;
    role?: UserRole;
    status?: UserStatus;
    preserveExisting?: boolean;
  }): Promise<User> {
    const admin = db();
    const existing = await this.getProfileById(input.id);
    const role = existing?.role || input.role || 'developer';
    const status = existing?.status || input.status || 'active';
    const payload: Record<string, unknown> = {
      id: input.id,
      email: (existing?.email || input.email).toLowerCase(),
      full_name: existing?.full_name || input.full_name || input.email.split('@')[0],
      last_active_at: new Date().toISOString(),
    };
    if (!existing) {
      payload.role = role;
      payload.status = status;
    } else if (!input.preserveExisting) {
      if (input.role && !existing.role) payload.role = input.role;
      if (input.status && !existing.status) payload.status = input.status;
    }
    if (admin) {
      const { data, error } = await admin.from('profiles').upsert(payload, { onConflict: 'id', ignoreDuplicates: false }).select().maybeSingle();
      if (!error && data) {
        return this.mapProfileRow(data as Record<string, unknown>, input.email);
      }
    }
    if (existing) {
      return {
        ...existing,
        email: existing.email || input.email.toLowerCase(),
        full_name: existing.full_name || input.full_name,
        last_active_at: payload.last_active_at as string,
      };
    }
    return {
      id: input.id,
      email: input.email.toLowerCase(),
      full_name: String(payload.full_name),
      role,
      status,
      last_active_at: payload.last_active_at as string,
      created_at: new Date().toISOString(),
      preferences: this.defaultPreferences(),
    };
  }

  private static async listAuthDirectoryUsers(): Promise<AuthDirectoryUser[]> {
    const admin = db();
    if (!admin) return [];
    const collected: AuthDirectoryUser[] = [];
    const seen = new Set<string>();
    try {
      let page = 1;
      const perPage = 200;
      while (page <= 20) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
        if (error || !data?.users) break;
        for (const row of data.users) {
          if (!row?.id || seen.has(row.id)) continue;
          seen.add(row.id);
          collected.push({
            id: row.id,
            email: row.email,
            created_at: row.created_at,
            last_sign_in_at: row.last_sign_in_at,
            email_confirmed_at: row.email_confirmed_at,
            user_metadata: (row.user_metadata || {}) as Record<string, unknown>,
          });
        }
        if (data.users.length < perPage) break;
        page += 1;
      }
    } catch (err) {
      console.error('Failed to list Auth users:', err);
    }
    return collected;
  }

  private static async syncMissingProfiles(authUsers: AuthDirectoryUser[], profiles: User[]): Promise<User[]> {
    const existingIds = new Set(profiles.map((p) => p.id));
    const adminEmail = getAdminEmail();
    for (const authUser of authUsers) {
      if (!authUser.id || existingIds.has(authUser.id) || !authUser.email) continue;
      const isSystemAdmin = Boolean(adminEmail) && authUser.email.toLowerCase() === adminEmail!.toLowerCase();
      const synced = await this.upsertProfileRecord({
        id: authUser.id,
        email: authUser.email,
        full_name:
          typeof authUser.user_metadata?.full_name === 'string'
            ? authUser.user_metadata.full_name
            : authUser.email.split('@')[0],
        role: isSystemAdmin ? 'admin' : 'developer',
        status: 'active',
        preserveExisting: true,
      });
      existingIds.add(synced.id);
      profiles.push(synced);
      await this.ensureUserMembership(synced.id, isSystemAdmin ? 'admin' : 'member').catch(() => {});
    }
    return profiles;
  }

  static async countAuthenticatedUsers(): Promise<number> {
    const admin = db();
    if (admin) {
      try {
        const authUsers = await this.listAuthDirectoryUsers();
        if (authUsers.length > 0) return uniqueUserCount(authUsers);
      } catch {
        //
      }
    }
    const users = await this.listUsers();
    return uniqueUserCount(users);
  }

  static async countActiveAdmins(): Promise<number> {
    const users = await this.listUsers();
    return countActiveAdmins(users);
  }

  // Private helper to seed default data if DB is empty
  static async seedInitialData(): Promise<void> {
    if (!supabase) return;
    try {
      const { data: existingProjects } = await supabase.from('projects').select('id').limit(1);
      if (existingProjects && existingProjects.length > 0) {
        return; // Already seeded
      }

      console.log('Supabase database is empty. Seeding initial projects, agents, and api keys...');

      // Seed Projects
      const seedProj = [
        {
          id: 'da1a0000-0000-4000-8000-000000000001',
          name: 'Universal Core Platform',
          slug: 'core-platform',
          description: 'Central project for primary web and mobile application AI agents.',
          rate_limit_rpm: 120,
          is_active: true,
        },
        {
          id: 'da1a0000-0000-4000-8000-000000000002',
          name: 'Customer Support Portal',
          slug: 'support-portal',
          description: 'Automated 24/7 client ticket resolution and triage workflows.',
          rate_limit_rpm: 60,
          is_active: true,
        }
      ];

      await supabase.from('projects').upsert(seedProj, { onConflict: 'slug' });

      // Seed Agents
      const seedAgents = [
        {
          id: 'ae1a0000-0000-4000-8000-000000000001',
          project_id: 'da1a0000-0000-4000-8000-000000000001',
          name: 'Omni Pro Reasoning & Code Architect',
          description: 'High-thinking reasoning agent for complex logic, system architecture, and algorithmic queries.',
          model: 'gemini-3.1-pro-preview',
          system_instructions: 'You are Omni Pro, a premier AI system architect and scientific reasoning agent. You excel at deep analytical problem solving, clean code architecture, and structured reasoning. Answer comprehensively and logically.',
          temperature: 0.7,
          top_p: 0.95,
          top_k: 40,
          thinking_level: 'HIGH',
          memory_enabled: true,
          tools_enabled: ['calculator', 'web_search', 'get_current_time', 'generate_uuid'],
          is_published: true,
        },
        {
          id: 'ae1a0000-0000-4000-8000-000000000002',
          project_id: 'da1a0000-0000-4000-8000-000000000001',
          name: 'Omni General Purpose Assistant',
          description: 'Balanced multimodal assistant powered by Gemini 3.8 Flash for general inquiries and tasks.',
          model: 'gemini-3.8-flash',
          system_instructions: 'You are a versatile, friendly, and highly capable AI assistant. You help users with writing, summarizing, technical questions, and operational tasks clearly and concisely.',
          temperature: 0.7,
          top_p: 0.95,
          top_k: 40,
          thinking_level: 'OFF',
          memory_enabled: true,
          tools_enabled: ['calculator', 'get_current_time'],
          is_published: true,
        },
        {
          id: 'ae1a0000-0000-4000-8000-000000000003',
          project_id: 'da1a0000-0000-4000-8000-000000000001',
          name: 'Omni Ultra-Fast Streamer',
          description: 'Engineered for sub-second latency and real-time streaming experiences.',
          model: 'gemini-3.1-flash-lite',
          system_instructions: 'You are an ultra-fast conversational assistant. Deliver rapid, accurate, and direct answers without filler.',
          temperature: 0.5,
          top_p: 0.9,
          top_k: 20,
          thinking_level: 'OFF',
          memory_enabled: true,
          tools_enabled: ['get_current_time'],
          is_published: true,
        },
        {
          id: 'ae1a0000-0000-4000-8000-000000000004',
          project_id: 'da1a0000-0000-4000-8000-000000000002',
          name: 'Customer Support Concierge',
          description: 'Polite front-line customer assistance and issue diagnosis.',
          model: 'gemini-3.8-flash',
          system_instructions: 'You are a supportive, warm, and professional customer concierge. Help users troubleshoot common issues, guide them to solutions, and maintain a polite tone.',
          temperature: 0.6,
          top_p: 0.9,
          top_k: 40,
          thinking_level: 'OFF',
          memory_enabled: true,
          tools_enabled: ['get_current_time'],
          is_published: true,
        }
      ];

      await supabase.from('agents').upsert(seedAgents, { onConflict: 'id' });

      // Seed Demo API Key
      const seedKeys = [
        {
          id: 'ca1a0000-0000-4000-8000-000000000001',
          project_id: 'da1a0000-0000-4000-8000-000000000001',
          name: 'Production Primary Server Key',
          key_prefix: 'ua_live_demo...2026',
          key_hash: DEMO_KEY_HASH,
          environment: 'production',
          rate_limit_rpm: 120,
          status: 'active',
        }
      ];

      if (!isProduction()) {
        await supabase.from('api_keys').upsert(seedKeys, { onConflict: 'id' });
      }
      console.log('Seeding successful.');
    } catch (err) {
      console.error('Failed to seed Supabase database:', err);
    }
  }

  // User Auth Methods
  static async registerUser(email: string, password: string, fullName?: string): Promise<AuthSession> {
    const authClient = authDb();
    const admin = db();
    if (authClient && admin) {
      try {
        const { data, error } = await authClient.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName || email.split('@')[0],
            },
          },
        });
        if (error) throw error;
        if (!data.user) throw new Error('Registration failed.');

        const configuredAdminEmail = getAdminEmail();
        const isSystemAdmin = Boolean(configuredAdminEmail) && email.toLowerCase() === configuredAdminEmail!.toLowerCase();
        const role: UserRole = isSystemAdmin ? 'admin' : 'developer';
        const user = await this.upsertProfileRecord({
          id: data.user.id,
          email: email.toLowerCase(),
          full_name: fullName || email.split('@')[0],
          role,
          status: 'active',
          preserveExisting: true,
        });
        await this.ensureUserMembership(user.id, isSystemAdmin ? 'admin' : 'member');
        const token = this.newSessionToken();
        const expiresAt = new Date(Date.now() + 86400000 * 7).toISOString();
        await this.persistSession(user.id, token, expiresAt);
        return { user: this.toPublicUser(user), token, expiresAt };
      } catch (err) {
        if (err instanceof Error && /already registered|already exists/i.test(err.message)) {
          throw new Error('User with this email already exists.');
        }
        console.error('Supabase registration error, falling back to memoryStore:', err);
      }
    }

    const existing = memoryStore.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (existing) {
      throw new Error('User with this email already exists.');
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const password_hash = crypto.scryptSync(password, salt, 64).toString('hex');
    const configuredAdminEmail = getAdminEmail();
    const isSystemAdmin = Boolean(configuredAdminEmail) && email.toLowerCase() === configuredAdminEmail!.toLowerCase();
    const newUser: StoredUser = {
      id: `usr_${crypto.randomBytes(6).toString('hex')}`,
      email: email.toLowerCase(),
      full_name: fullName || email.split('@')[0],
      role: isSystemAdmin ? 'admin' : 'developer',
      status: 'active',
      last_active_at: new Date().toISOString(),
      password_hash,
      salt,
      created_at: new Date().toISOString(),
    };

    memoryStore.users.push(newUser);
    memoryStore.projectMembers.push({
      project_id: 'proj_default_core',
      user_id: newUser.id,
      role: isSystemAdmin ? 'owner' : 'member',
    });

    const token = this.newSessionToken();
    const expiresAt = new Date(Date.now() + 86400000 * 7).toISOString();
    await this.persistSession(newUser.id, token, expiresAt);
    return { user: this.toPublicUser(newUser), token, expiresAt };
  }

  static async loginUser(email: string, password: string): Promise<AuthSession> {
    const authClient = authDb();
    const admin = db();
    if (authClient && admin) {
      try {
        const { data, error } = await authClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (!data.user) throw new Error('Invalid credentials.');

        const configuredAdminEmail = getAdminEmail();
        const isSystemAdmin = Boolean(configuredAdminEmail) && email.toLowerCase() === configuredAdminEmail!.toLowerCase();
        const existing = await this.getUserById(data.user.id);
        const role: UserRole = isSystemAdmin ? 'admin' : existing?.role || 'developer';
        const status: UserStatus = existing?.status === 'disabled' ? 'disabled' : 'active';
        if (status === 'disabled') {
          const disabledError = new Error('This account has been disabled.');
          (disabledError as Error & { code?: string }).code = 'ACCOUNT_DISABLED';
          throw disabledError;
        }

        const user = await this.upsertProfileRecord({
          id: data.user.id,
          email: (data.user.email || email).toLowerCase(),
          full_name: existing?.full_name || data.user.user_metadata?.full_name || email.split('@')[0],
          role: existing?.role || role,
          status: existing?.status || 'active',
          preserveExisting: true,
        });
        await this.ensureUserMembership(user.id, isSystemAdmin ? 'admin' : 'member');
        const token = this.newSessionToken();
        const expiresAt = new Date(Date.now() + 86400000 * 7).toISOString();
        await this.persistSession(user.id, token, expiresAt);
        return { user: this.toPublicUser(user), token, expiresAt };
      } catch (err) {
        if (err instanceof Error && ((err as Error & { code?: string }).code === 'ACCOUNT_DISABLED' || /disabled/i.test(err.message))) {
          throw err;
        }
        console.error('Supabase login error, falling back to memoryStore:', err);
      }
    }

    const user = memoryStore.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (!user) {
      throw new Error('Invalid email or password.');
    }

    const computedHash = crypto.scryptSync(password, user.salt, 64).toString('hex');
    if (computedHash !== user.password_hash) {
      throw new Error('Invalid email or password.');
    }
    if (user.status === 'disabled') {
      throw new Error('This account has been disabled.');
    }
    user.last_active_at = new Date().toISOString();
    const token = this.newSessionToken();
    const expiresAt = new Date(Date.now() + 86400000 * 7).toISOString();
    await this.persistSession(user.id, token, expiresAt);
    return { user: this.toPublicUser(user), token, expiresAt };
  }

  static async verifySessionToken(token: string): Promise<User | null> {
    if (!token) return null;
    const admin = db();

    if (token.startsWith('sess_') && admin) {
      try {
        const { data: session, error } = await admin
          .from('auth_sessions')
          .select('*')
          .eq('token_hash', this.hashSessionToken(token))
          .maybeSingle();
        if (!error && session) {
          if (new Date(session.expires_at).getTime() < Date.now()) {
            await admin.from('auth_sessions').delete().eq('token_hash', this.hashSessionToken(token));
            return null;
          }
          const user = await this.getUserById(String(session.user_id));
          if (user) return this.toPublicUser(user);
        }
      } catch (err) {
        console.error('Supabase session verification error, falling back to memoryStore:', err);
      }
    }

    if (admin && token.split('.').length === 3) {
      try {
        const { data, error } = await admin.auth.getUser(token);
        if (!error && data.user?.email) {
          const profile = await this.getUserById(data.user.id);
          const configuredAdminEmail = getAdminEmail();
          const isSystemAdmin =
            Boolean(configuredAdminEmail) && data.user.email.toLowerCase() === configuredAdminEmail!.toLowerCase();
          if (profile) {
            return this.toPublicUser({
              ...profile,
              role: isSystemAdmin ? 'admin' : profile.role,
            });
          }
          return this.toPublicUser(
            await this.upsertProfileRecord({
              id: data.user.id,
              email: data.user.email,
              full_name: data.user.user_metadata?.full_name || data.user.email.split('@')[0],
              role: isSystemAdmin ? 'admin' : 'developer',
            })
          );
        }
      } catch (err) {
        console.error('Supabase JWT verification error, falling back to memoryStore:', err);
      }
    }

    const sess = memoryStore.sessions.find((s) => s.token === token);
    if (!sess) return null;
    if (new Date(sess.expires_at).getTime() < Date.now()) {
      memoryStore.sessions = memoryStore.sessions.filter((s) => s.token !== token);
      return null;
    }
    const user = memoryStore.users.find((u) => u.id === sess.user_id);
    return user ? this.toPublicUser(user) : null;
  }

  static async logoutSession(token?: string | null): Promise<void> {
    if (!token) return;
    await this.revokeSessionToken(token);
  }

  static async listUserSessions(userId: string, currentToken?: string | null): Promise<AuthSessionRecord[]> {
    const currentHash = currentToken ? this.hashSessionToken(currentToken) : null;
    const admin = db();
    if (admin) {
      try {
        const { data, error } = await admin
          .from('auth_sessions')
          .select('token_hash, user_id, expires_at, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });
        if (!error && data) {
          return data.map((row) => ({
            id: String(row.token_hash).slice(0, 16),
            user_id: String(row.user_id),
            created_at: String(row.created_at || new Date().toISOString()),
            expires_at: String(row.expires_at),
            current: Boolean(currentHash && row.token_hash === currentHash),
          }));
        }
      } catch {
        //
      }
    }
    return memoryStore.sessions
      .filter((s) => s.user_id === userId)
      .map((s) => ({
        id: s.id || this.hashSessionToken(s.token).slice(0, 16),
        user_id: s.user_id,
        created_at: s.created_at || s.expires_at,
        expires_at: s.expires_at,
        current: Boolean(currentToken && s.token === currentToken),
      }));
  }

  static async revokeUserSession(userId: string, sessionId: string, currentToken?: string | null): Promise<boolean> {
    const admin = db();
    if (admin) {
      try {
        const { data, error } = await admin
          .from('auth_sessions')
          .select('token_hash')
          .eq('user_id', userId);
        if (!error && data) {
          const match = data.find((row) => String(row.token_hash).startsWith(sessionId) || String(row.token_hash).slice(0, 16) === sessionId);
          if (match) {
            await admin.from('auth_sessions').delete().eq('token_hash', match.token_hash).eq('user_id', userId);
            memoryStore.sessions = memoryStore.sessions.filter(
              (s) => !(s.user_id === userId && this.hashSessionToken(s.token) === match.token_hash)
            );
            return true;
          }
        }
      } catch {
        //
      }
    }
    const before = memoryStore.sessions.length;
    memoryStore.sessions = memoryStore.sessions.filter((s) => {
      if (s.user_id !== userId) return true;
      const id = s.id || this.hashSessionToken(s.token).slice(0, 16);
      return id !== sessionId;
    });
    return memoryStore.sessions.length < before || Boolean(currentToken);
  }

  static async revokeAllUserSessions(userId: string, keepToken?: string | null): Promise<number> {
    const keepHash = keepToken ? this.hashSessionToken(keepToken) : null;
    const admin = db();
    let deleted = 0;
    if (admin) {
      try {
        let query = admin.from('auth_sessions').delete().eq('user_id', userId).select('token_hash');
        if (keepHash) query = query.neq('token_hash', keepHash);
        const { data } = await query;
        deleted = data?.length || 0;
      } catch {
        //
      }
    }
    const remaining = memoryStore.sessions.filter((s) => {
      if (s.user_id !== userId) return true;
      if (keepToken && s.token === keepToken) return true;
      deleted += 1;
      return false;
    });
    memoryStore.sessions = remaining;
    return deleted;
  }

  static async requestPasswordReset(email: string, redirectTo: string): Promise<boolean> {
    const authClient = authDb();
    if (!authClient) return false;
    const { error } = await authClient.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw error;
    return true;
  }

  static async updateOwnPassword(accessToken: string, password: string): Promise<boolean> {
    const admin = db();
    if (!admin) return false;
    const { data, error } = await admin.auth.getUser(accessToken);
    if (error || !data.user) throw new Error('Invalid or expired recovery session');
    const { error: updateError } = await admin.auth.admin.updateUserById(data.user.id, { password });
    if (updateError) throw updateError;
    return true;
  }

  static async resendVerificationEmail(email: string, redirectTo: string): Promise<boolean> {
    const authClient = authDb();
    if (!authClient) return false;
    const { error } = await authClient.auth.resend({ type: 'signup', email, options: { emailRedirectTo: redirectTo } });
    if (error) throw error;
    return true;
  }

  static async deleteOwnAccount(userId: string): Promise<void> {
    const existing = await this.getUserById(userId);
    if (existing?.role === 'admin' && existing.status !== 'disabled') {
      const activeAdmins = await this.countActiveAdmins();
      if (activeAdmins <= 1) {
        throw Object.assign(new Error(LAST_ADMIN_ERROR), { code: 'LAST_ADMIN' });
      }
    }
    await this.clearUserMemories(userId);
    const files = await this.listUserFiles(userId);
    for (const file of files) {
      await this.deleteUserFile(userId, file.id);
    }
    await this.revokeAllUserSessions(userId);
    const admin = db();
    if (admin) {
      try {
        await admin.from('resource_shares').delete().or(`owner_id.eq.${userId},shared_with_user_id.eq.${userId}`);
      } catch {
        //
      }
      try {
        await admin.from('profiles').delete().eq('id', userId);
      } catch {
        //
      }
      try {
        await admin.auth.admin.deleteUser(userId);
      } catch (err) {
        console.error('Failed to delete Auth user:', err);
      }
    }
    memoryStore.users = memoryStore.users.filter((u) => u.id !== userId);
    memoryStore.sessions = memoryStore.sessions.filter((s) => s.user_id !== userId);
    memoryStore.shares = memoryStore.shares.filter((s) => s.owner_id !== userId && s.shared_with_user_id !== userId);
  }

  static toPublicUser(user: StoredUser | User): User {
    return {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      status: user.status === 'disabled' ? 'disabled' : 'active',
      last_active_at: user.last_active_at || null,
      created_at: user.created_at,
      email_confirmed: (user as User).email_confirmed,
      preferences: this.defaultPreferences((user as User).preferences),
    };
  }

  static async listUsers(query?: string): Promise<User[]> {
    let profiles: User[] = [];
    if (supabase) {
      try {
        const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
        if (!error && data) {
          profiles = data.map((row) => this.mapProfileRow(row as Record<string, unknown>));
        }
      } catch (err) {
        console.error('Supabase listUsers error, falling back to memoryStore:', err);
      }
    }
    if (!profiles.length) {
      profiles = memoryStore.users.map((u) => this.toPublicUser(u));
    }

    const authUsers = await this.listAuthDirectoryUsers();
    if (authUsers.length) {
      await this.syncMissingProfiles(authUsers, profiles);
      const merged = mergeAuthUsersWithProfiles(authUsers, profiles, getAdminEmail());
      return merged.users.filter((u) => matchesUserQuery(u, query));
    }

    const unique = new Map<string, User>();
    for (const user of profiles) {
      if (user.id && !unique.has(user.id)) unique.set(user.id, user);
    }
    return Array.from(unique.values()).filter((u) => matchesUserQuery(u, query));
  }

  static async getUserById(id: string): Promise<User | null> {
    const profile = await this.getProfileById(id);
    if (profile) return profile;
    const admin = db();
    if (admin) {
      try {
        const { data } = await admin.auth.admin.getUserById(id);
        if (data?.user) {
          const authUser = data.user;
          const adminEmail = getAdminEmail();
          const isSystemAdmin =
            Boolean(adminEmail) && (authUser.email || '').toLowerCase() === adminEmail!.toLowerCase();
          return this.upsertProfileRecord({
            id: authUser.id,
            email: authUser.email || `${authUser.id}@users.local`,
            full_name:
              typeof authUser.user_metadata?.full_name === 'string'
                ? authUser.user_metadata.full_name
                : (authUser.email || '').split('@')[0],
            role: isSystemAdmin ? 'admin' : 'developer',
            status: 'active',
            preserveExisting: true,
          });
        }
      } catch {
        //
      }
    }
    return null;
  }

  static async getUserByEmail(email: string): Promise<User | null> {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return null;
    if (supabase) {
      try {
        const { data, error } = await supabase.from('profiles').select('*').eq('email', normalized).maybeSingle();
        if (!error && data) {
          return this.mapProfileRow(data as Record<string, unknown>);
        }
      } catch (err) {
        console.error('Supabase getUserByEmail error, falling back to memoryStore:', err);
      }
    }
    const user = memoryStore.users.find((u) => u.email.toLowerCase() === normalized);
    if (user) return this.toPublicUser(user);
    const authUsers = await this.listAuthDirectoryUsers();
    const authUser = authUsers.find((row) => (row.email || '').toLowerCase() === normalized);
    if (authUser) return this.getUserById(authUser.id);
    return null;
  }

  static async updateUser(
    id: string,
    updates: { role?: UserRole; status?: UserStatus; full_name?: string; preferences?: UserPreferences },
    options?: { actorId?: string; enforceLastAdmin?: boolean }
  ): Promise<User | null> {
    const existing = await this.getUserById(id);
    if (!existing) return null;
    if (options?.enforceLastAdmin !== false && wouldRemoveActiveAdmin(existing, updates)) {
      const activeAdmins = await this.countActiveAdmins();
      if (activeAdmins <= 1) {
        throw Object.assign(new Error(LAST_ADMIN_ERROR), { code: 'LAST_ADMIN' });
      }
    }
    if (supabase) {
      try {
        const payload: Record<string, unknown> = {};
        if (updates.role) payload.role = updates.role;
        if (updates.status) payload.status = updates.status;
        if (updates.full_name !== undefined) payload.full_name = updates.full_name;
        if (updates.preferences) payload.preferences = this.defaultPreferences(updates.preferences);
        const { data, error } = await supabase.from('profiles').update(payload).eq('id', id).select().maybeSingle();
        if (!error && data) {
          return this.mapProfileRow(data as Record<string, unknown>);
        }
      } catch (err) {
        if ((err as Error & { code?: string }).code === 'LAST_ADMIN') throw err;
        console.error('Supabase updateUser error, falling back to memoryStore:', err);
      }
    }

    const user = memoryStore.users.find((u) => u.id === id);
    if (!user) return null;
    if (updates.role) user.role = updates.role;
    if (updates.status) user.status = updates.status;
    if (updates.full_name !== undefined) user.full_name = updates.full_name;
    if (updates.preferences) (user as StoredUser & { preferences?: UserPreferences }).preferences = this.defaultPreferences(updates.preferences);
    return this.toPublicUser(user);
  }

  static async touchUserActivity(id: string): Promise<void> {
    const now = new Date().toISOString();
    if (supabase) {
      try {
        await supabase.from('profiles').update({ last_active_at: now }).eq('id', id);
      } catch {
        //
      }
    }
    const user = memoryStore.users.find((u) => u.id === id);
    if (user) user.last_active_at = now;
  }

  static async updateUserProfile(id: string, updates: { full_name?: string; preferences?: UserPreferences }): Promise<User | null> {
    return this.updateUser(id, updates);
  }

  static async countConversations(): Promise<number> {
    if (supabase) {
      try {
        const { count, error } = await supabase.from('conversations').select('*', { count: 'exact', head: true });
        if (!error && typeof count === 'number') return count;
      } catch (err) {
        console.error('Supabase countConversations error, falling back to memoryStore:', err);
      }
    }
    return memoryStore.conversations.length;
  }

  static async listUserProjectIds(userId: string): Promise<string[]> {
    if (!userId) return [];
    if (supabase) {
      try {
        const { data, error } = await supabase.from('project_members').select('project_id').eq('user_id', userId);
        if (!error && data) {
          return data.map((row) => String(row.project_id)).filter(Boolean);
        }
      } catch (err) {
        console.error('Supabase listUserProjectIds error, falling back to memoryStore:', err);
      }
    }
    return memoryStore.projectMembers.filter((m) => m.user_id === userId).map((m) => m.project_id);
  }

  static async listUserProjects(userId: string): Promise<Project[]> {
    let memberIds = await this.listUserProjectIds(userId);
    if (memberIds.length === 0) {
      const projectId = await this.ensureUserMembership(userId, 'member');
      memberIds = [projectId];
    }
    const all = await this.listProjects();
    const owned = all.filter((p) => memberIds.includes(p.id));
    if (owned.length > 0) return owned;
    return all.filter((p) => p.id === DEFAULT_PROJECT_ID || p.slug === DEFAULT_PROJECT_SLUG).slice(0, 1);
  }

  static async getUserPrimaryProject(userId: string): Promise<Project | null> {
    const projects = await this.listUserProjects(userId);
    return projects[0] || null;
  }

  static async addProjectMember(projectId: string, userId: string, role = 'member'): Promise<void> {
    if (supabase) {
      try {
        await supabase.from('project_members').upsert({
          project_id: projectId,
          user_id: userId,
          role,
        });
        return;
      } catch (err) {
        console.error('Supabase addProjectMember error, falling back to memoryStore:', err);
      }
    }
    if (!memoryStore.projectMembers.some((m) => m.project_id === projectId && m.user_id === userId)) {
      memoryStore.projectMembers.push({ project_id: projectId, user_id: userId, role });
    }
  }

  static async getPlatformSettings(): Promise<{
    default_model: string | null;
    admin_contact_email: string | null;
    updated_at: string | null;
    updated_by: string | null;
  }> {
    if (supabase) {
      try {
        const { data, error } = await supabase.from('platform_settings').select('*').eq('id', 'global').maybeSingle();
        if (!error && data) {
          return {
            default_model: data.default_model || null,
            admin_contact_email: data.admin_contact_email || null,
            updated_at: data.updated_at || null,
            updated_by: data.updated_by || null,
          };
        }
      } catch (err) {
        console.error('Supabase getPlatformSettings error, falling back to memoryStore:', err);
      }
    }
    return { ...memoryStore.platformSettings };
  }

  static async updatePlatformSettings(
    updates: { default_model?: string | null; admin_contact_email?: string | null },
    updatedBy?: string
  ): Promise<{
    default_model: string | null;
    admin_contact_email: string | null;
    updated_at: string | null;
    updated_by: string | null;
  }> {
    const next = {
      default_model: updates.default_model !== undefined ? updates.default_model : memoryStore.platformSettings.default_model,
      admin_contact_email:
        updates.admin_contact_email !== undefined
          ? updates.admin_contact_email
          : memoryStore.platformSettings.admin_contact_email,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy || null,
    };
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('platform_settings')
          .upsert({
            id: 'global',
            default_model: next.default_model,
            admin_contact_email: next.admin_contact_email,
            updated_at: next.updated_at,
            updated_by: next.updated_by,
          })
          .select()
          .maybeSingle();
        if (!error && data) {
          memoryStore.platformSettings = {
            default_model: data.default_model || null,
            admin_contact_email: data.admin_contact_email || null,
            updated_at: data.updated_at,
            updated_by: data.updated_by || null,
          };
          return { ...memoryStore.platformSettings };
        }
      } catch (err) {
        console.error('Supabase updatePlatformSettings error, falling back to memoryStore:', err);
      }
    }
    memoryStore.platformSettings = next;
    return { ...next };
  }

  static async getPlatformOverview(): Promise<PlatformOverview> {
    const [users, projects, agents, providers, usage, conversationCount, totalUsers] = await Promise.all([
      this.listUsers(),
      this.listProjects(),
      this.listAgents(),
      this.listProviders(),
      this.getUsageStats(),
      this.countConversations(),
      this.countAuthenticatedUsers(),
    ]);
    return {
      totalUsers,
      activeUsers: users.filter((u) => u.status !== 'disabled').length,
      totalRequests: usage.totalRequests,
      successfulRequests: usage.successfulRequests,
      failedRequests: usage.failedRequests,
      totalTokens: usage.totalTokens,
      avgLatencyMs: usage.avgLatencyMs,
      providerCount: providers.length,
      enabledProviderCount: providers.filter((p) => p.enabled).length,
      agentCount: agents.length,
      projectCount: projects.length,
      conversationCount,
      databaseAdapter: this.isSupabaseConfigured() ? 'supabase-postgresql' : 'in-memory-preview-resilient',
      databaseStatus: this.isSupabaseConfigured() ? 'connected' : 'unconfigured',
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    };
  }

  static async renameConversation(id: string, title: string): Promise<Conversation | null> {
    const trimmed = title.trim().slice(0, 80);
    if (!trimmed) return null;
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('conversations')
          .update({ title: trimmed, updated_at: new Date().toISOString() })
          .eq('id', id)
          .select()
          .maybeSingle();
        if (!error && data) return data;
      } catch (err) {
        console.error('Supabase renameConversation error, falling back to memoryStore:', err);
      }
    }
    const conv = memoryStore.conversations.find((c) => c.id === id);
    if (!conv) return null;
    conv.title = trimmed;
    conv.updated_at = new Date().toISOString();
    return conv;
  }

  // Projects
  static async listProjects(): Promise<Project[]> {
    if (supabase) {
      try {
        const { data, error } = await supabase.from('projects').select('*').order('created_at', { ascending: false });
        if (!error && data) {
          if (data.length === 0) {
            await this.seedInitialData();
            const { data: seeded } = await supabase.from('projects').select('*').order('created_at', { ascending: false });
            return seeded || [];
          }
          return data;
        }
      } catch (err) {
        console.error('Supabase projects error, falling back to memoryStore:', err);
      }
    }
    return [...memoryStore.projects];
  }

  static async getProject(id: string): Promise<Project | null> {
    if (supabase) {
      try {
        // Since PostgreSQL UUID strict checks IDs, we first verify if 'id' matches a UUID or else check the slug
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
        const column = isUuid ? 'id' : 'slug';
        const { data, error } = await supabase.from('projects').select('*').eq(column, id).maybeSingle();
        if (!error) return data;
      } catch (err) {
        console.error('Supabase getProject error, falling back to memoryStore:', err);
      }
    }
    return memoryStore.projects.find((p) => p.id === id || p.slug === id) || null;
  }

  static async createProject(data: Partial<Project>): Promise<Project> {
    if (supabase) {
      try {
        const { data: newProj, error } = await supabase
          .from('projects')
          .insert({
            name: data.name || 'Untitled Project',
            slug: data.slug || `project-${Date.now()}`,
            description: data.description || '',
            rate_limit_rpm: data.rate_limit_rpm || 60,
            is_active: data.is_active !== undefined ? data.is_active : true,
          })
          .select()
          .single();
        if (!error && newProj) return newProj;
      } catch (err) {
        console.error('Supabase createProject error, falling back to memoryStore:', err);
      }
    }

    const newProj: Project = {
      id: `proj_${crypto.randomBytes(6).toString('hex')}`,
      name: data.name || 'Untitled Project',
      slug: data.slug || `project-${Date.now()}`,
      description: data.description || '',
      rate_limit_rpm: data.rate_limit_rpm || 60,
      is_active: data.is_active !== undefined ? data.is_active : true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    memoryStore.projects.unshift(newProj);
    return newProj;
  }

  static async createOwnedProject(data: Partial<Project>, ownerId?: string): Promise<Project> {
    const project = await this.createProject(data);
    if (ownerId) {
      await this.addProjectMember(project.id, ownerId, 'owner');
    }
    return project;
  }

  static async updateProject(id: string, updates: Partial<Project>): Promise<Project | null> {
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('projects')
          .update({
            name: updates.name,
            slug: updates.slug,
            description: updates.description,
            rate_limit_rpm: updates.rate_limit_rpm,
            is_active: updates.is_active,
          })
          .eq('id', id)
          .select()
          .single();
        if (!error && data) return data;
      } catch (err) {
        console.error('Supabase updateProject error, falling back to memoryStore:', err);
      }
    }

    const idx = memoryStore.projects.findIndex((p) => p.id === id);
    if (idx === -1) return null;
    memoryStore.projects[idx] = {
      ...memoryStore.projects[idx],
      ...updates,
      updated_at: new Date().toISOString(),
    };
    return memoryStore.projects[idx];
  }

  static async deleteProject(id: string): Promise<boolean> {
    if (supabase) {
      try {
        const { error } = await supabase.from('projects').delete().eq('id', id);
        if (!error) return true;
      } catch (err) {
        console.error('Supabase deleteProject error, falling back to memoryStore:', err);
      }
    }

    const idx = memoryStore.projects.findIndex((p) => p.id === id);
    if (idx === -1) return false;
    memoryStore.projects.splice(idx, 1);
    memoryStore.agents = memoryStore.agents.filter((a) => a.project_id !== id);
    memoryStore.apiKeys = memoryStore.apiKeys.filter((k) => k.project_id !== id);
    return true;
  }

  // Agents
  static async listAgents(projectId?: string): Promise<Agent[]> {
    if (supabase) {
      try {
        let query = supabase.from('agents').select('*');
        if (projectId) {
          query = query.eq('project_id', projectId);
        }
        const { data, error } = await query.order('created_at', { ascending: false });
        if (!error && data) {
          if (data.length === 0 && !projectId) {
            await this.seedInitialData();
            const { data: seeded } = await supabase.from('agents').select('*').order('created_at', { ascending: false });
            return seeded || [];
          }
          return data;
        }
      } catch (err) {
        console.error('Supabase agents error, falling back to memoryStore:', err);
      }
    }

    if (projectId) {
      return memoryStore.agents.filter((a) => a.project_id === projectId);
    }
    return [...memoryStore.agents];
  }

  static async getAgent(id: string): Promise<Agent | null> {
    if (supabase) {
      try {
        const { data, error } = await supabase.from('agents').select('*').eq('id', id).maybeSingle();
        if (!error) return data;
      } catch (err) {
        console.error('Supabase getAgent error, falling back to memoryStore:', err);
      }
    }
    return memoryStore.agents.find((a) => a.id === id) || null;
  }

  static async createAgent(data: Partial<Agent>): Promise<Agent> {
    if (supabase) {
      try {
        const { data: newAgent, error } = await supabase
          .from('agents')
          .insert({
            project_id: data.project_id || 'da1a0000-0000-4000-8000-000000000001',
            name: data.name || 'Custom Agent',
            description: data.description || '',
            model: data.model || 'gemini-3.8-flash',
            provider_id: data.provider_id || 'gemini',
            fallback_provider_id: data.fallback_provider_id || null,
            fallback_model: data.fallback_model || null,
            system_instructions: data.system_instructions || 'You are a helpful AI assistant.',
            temperature: data.temperature ?? 0.7,
            top_p: data.top_p ?? 0.95,
            top_k: data.top_k ?? 40,
            max_output_tokens: data.max_output_tokens,
            thinking_level: data.thinking_level || 'OFF',
            memory_enabled: data.memory_enabled !== false,
            tools_enabled: data.tools_enabled || [],
            is_published: data.is_published !== false,
            owner_id: data.owner_id || null,
            scope: data.scope || 'platform',
          })
          .select()
          .single();
        if (!error && newAgent) return newAgent;
      } catch (err) {
        console.error('Supabase createAgent error, falling back to memoryStore:', err);
      }
    }

    const newAgent: Agent = {
      id: `agent_${crypto.randomBytes(6).toString('hex')}`,
      project_id: data.project_id || memoryStore.projects[0]?.id || 'proj_default_core',
      name: data.name || 'Custom Agent',
      description: data.description || '',
      model: data.model || 'gemini-3.8-flash',
      provider_id: data.provider_id || 'gemini',
      fallback_provider_id: data.fallback_provider_id,
      fallback_model: data.fallback_model,
      system_instructions: data.system_instructions || 'You are a helpful AI assistant.',
      temperature: data.temperature ?? 0.7,
      top_p: data.top_p ?? 0.95,
      top_k: data.top_k ?? 40,
      max_output_tokens: data.max_output_tokens,
      thinking_level: data.thinking_level || 'OFF',
      memory_enabled: data.memory_enabled !== false,
      tools_enabled: data.tools_enabled || [],
      is_published: data.is_published !== false,
      owner_id: data.owner_id || null,
      scope: data.scope || 'platform',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    memoryStore.agents.unshift(newAgent);
    return newAgent;
  }

  static async updateAgent(id: string, updates: Partial<Agent>): Promise<Agent | null> {
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('agents')
          .update({
            project_id: updates.project_id,
            name: updates.name,
            description: updates.description,
            model: updates.model,
            provider_id: updates.provider_id,
            fallback_provider_id: updates.fallback_provider_id,
            fallback_model: updates.fallback_model,
            system_instructions: updates.system_instructions,
            temperature: updates.temperature,
            top_p: updates.top_p,
            top_k: updates.top_k,
            max_output_tokens: updates.max_output_tokens,
            thinking_level: updates.thinking_level,
            memory_enabled: updates.memory_enabled,
            tools_enabled: updates.tools_enabled,
            is_published: updates.is_published,
            owner_id: updates.owner_id,
            scope: updates.scope,
          })
          .eq('id', id)
          .select()
          .single();
        if (!error && data) return data;
      } catch (err) {
        console.error('Supabase updateAgent error, falling back to memoryStore:', err);
      }
    }

    const idx = memoryStore.agents.findIndex((a) => a.id === id);
    if (idx === -1) return null;
    memoryStore.agents[idx] = {
      ...memoryStore.agents[idx],
      ...updates,
      updated_at: new Date().toISOString(),
    };
    return memoryStore.agents[idx];
  }

  static async deleteAgent(id: string): Promise<boolean> {
    if (supabase) {
      try {
        const { error } = await supabase.from('agents').delete().eq('id', id);
        if (!error) return true;
      } catch (err) {
        console.error('Supabase deleteAgent error, falling back to memoryStore:', err);
      }
    }

    const idx = memoryStore.agents.findIndex((a) => a.id === id);
    if (idx === -1) return false;
    memoryStore.agents.splice(idx, 1);
    return true;
  }

  static async listVisibleAgents(userId?: string, isAdmin = false, projectId?: string): Promise<Agent[]> {
    const agents = await this.listAgents(projectId);
    if (isAdmin) return agents;
    const sharedIds = userId
      ? new Set((await this.listSharesForUser(userId, 'agent')).map((s) => s.resource_id))
      : new Set<string>();
    return agents.filter((agent) => {
      if (agent.owner_id && agent.owner_id === userId) return true;
      if (sharedIds.has(agent.id)) return true;
      if (agent.scope === 'user') return false;
      return agent.is_published;
    });
  }

  static async searchUserConversations(userId: string, query?: string): Promise<Conversation[]> {
    const conversations = await this.listUserConversations(userId);
    const needle = query?.trim().toLowerCase();
    if (!needle) return conversations;
    return conversations.filter((c) => (c.title || '').toLowerCase().includes(needle));
  }

  static async countUserUsageThisMonth(userId: string): Promise<number> {
    const start = new Date();
    start.setUTCDate(1);
    start.setUTCHours(0, 0, 0, 0);
    const admin = db();
    if (admin) {
      try {
        const { count, error } = await admin
          .from('usage_logs')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .gte('created_at', start.toISOString());
        if (!error && typeof count === 'number') return count;
      } catch {
        //
      }
    }
    return memoryStore.usageLogs.filter(
      (l) => l.user_id === userId && new Date(l.created_at).getTime() >= start.getTime()
    ).length;
  }

  static async listUserMemories(userId: string): Promise<UserMemory[]> {
    const admin = db();
    if (admin) {
      try {
        const { data, error } = await admin
          .from('user_memories')
          .select('*')
          .eq('user_id', userId)
          .order('updated_at', { ascending: false });
        if (!error && data) return data as UserMemory[];
      } catch (err) {
        console.error('Supabase listUserMemories error, falling back to memoryStore:', err);
      }
    }
    return memoryStore.memories.filter((m) => m.user_id === userId);
  }

  static async createUserMemory(userId: string, content: string): Promise<UserMemory> {
    const trimmed = content.trim().slice(0, 2000);
    const admin = db();
    if (admin) {
      try {
        const { data, error } = await admin
          .from('user_memories')
          .insert({ user_id: userId, content: trimmed })
          .select()
          .single();
        if (!error && data) return data as UserMemory;
      } catch (err) {
        console.error('Supabase createUserMemory error, falling back to memoryStore:', err);
      }
    }
    const memory: UserMemory = {
      id: `mem_${crypto.randomBytes(6).toString('hex')}`,
      user_id: userId,
      content: trimmed,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    memoryStore.memories.unshift(memory);
    return memory;
  }

  static async deleteUserMemory(userId: string, memoryId: string): Promise<boolean> {
    const admin = db();
    if (admin) {
      try {
        const { data, error } = await admin
          .from('user_memories')
          .delete()
          .eq('id', memoryId)
          .eq('user_id', userId)
          .select('id');
        if (!error && data && data.length > 0) return true;
      } catch (err) {
        console.error('Supabase deleteUserMemory error, falling back to memoryStore:', err);
      }
    }
    const before = memoryStore.memories.length;
    memoryStore.memories = memoryStore.memories.filter((m) => !(m.id === memoryId && m.user_id === userId));
    return memoryStore.memories.length < before;
  }

  static async clearUserMemories(userId: string): Promise<number> {
    const admin = db();
    if (admin) {
      try {
        const { data, error } = await admin.from('user_memories').delete().eq('user_id', userId).select('id');
        if (!error) return data?.length || 0;
      } catch (err) {
        console.error('Supabase clearUserMemories error, falling back to memoryStore:', err);
      }
    }
    const remaining = memoryStore.memories.filter((m) => m.user_id !== userId);
    const deleted = memoryStore.memories.length - remaining.length;
    memoryStore.memories = remaining;
    return deleted;
  }

  static async createUserFile(file: Omit<UserFile, 'id' | 'created_at'> & { id?: string }): Promise<UserFile> {
    const id = file.id || `file_${crypto.randomBytes(6).toString('hex')}`;
    const payload = {
      id,
      user_id: file.user_id,
      conversation_id: file.conversation_id || null,
      original_name: file.original_name,
      mime_type: file.mime_type,
      size_bytes: file.size_bytes,
      storage_path: file.storage_path || '',
    };
    const admin = db();
    if (admin) {
      try {
        const { data, error } = await admin.from('user_files').insert(payload).select().single();
        if (!error && data) return data as UserFile;
      } catch (err) {
        console.error('Supabase createUserFile error, falling back to memoryStore:', err);
      }
    }
    const created: UserFile = {
      ...payload,
      created_at: new Date().toISOString(),
    };
    memoryStore.files.unshift(created);
    return created;
  }

  static async listUserFiles(userId: string): Promise<UserFile[]> {
    const admin = db();
    if (admin) {
      try {
        const { data, error } = await admin
          .from('user_files')
          .select('id, user_id, conversation_id, original_name, mime_type, size_bytes, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });
        if (!error && data) return data as UserFile[];
      } catch (err) {
        console.error('Supabase listUserFiles error, falling back to memoryStore:', err);
      }
    }
    return memoryStore.files
      .filter((f) => f.user_id === userId)
      .map((f) => ({
        id: f.id,
        user_id: f.user_id,
        conversation_id: f.conversation_id,
        original_name: f.original_name,
        mime_type: f.mime_type,
        size_bytes: f.size_bytes,
        created_at: f.created_at,
      }));
  }

  static async getUserFile(id: string, userId?: string): Promise<(UserFile & { storage_path?: string }) | null> {
    const admin = db();
    if (admin) {
      try {
        let query = admin.from('user_files').select('*').eq('id', id);
        if (userId) query = query.eq('user_id', userId);
        const { data, error } = await query.maybeSingle();
        if (!error && data) return data as UserFile & { storage_path?: string };
      } catch {
        //
      }
    }
    const found = memoryStore.files.find((f) => f.id === id && (!userId || f.user_id === userId));
    return found || null;
  }

  static async deleteUserFile(userId: string, fileId: string): Promise<UserFile | null> {
    const existing = await this.getUserFile(fileId, userId);
    if (!existing) return null;
    await this.deleteKnowledgeForFile(userId, fileId);
    const admin = db();
    if (admin) {
      try {
        const { data, error } = await admin
          .from('user_files')
          .delete()
          .eq('id', fileId)
          .eq('user_id', userId)
          .select('*');
        if (!error && data && data.length > 0) {
          memoryStore.files = memoryStore.files.filter((f) => !(f.id === fileId && f.user_id === userId));
          return data[0] as UserFile;
        }
      } catch {
        //
      }
    }
    const before = memoryStore.files.length;
    memoryStore.files = memoryStore.files.filter((f) => !(f.id === fileId && f.user_id === userId));
    return memoryStore.files.length < before ? existing : existing;
  }

  static async upsertKnowledgeDocument(doc: Omit<KnowledgeDocument, 'created_at' | 'updated_at'> & { created_at?: string }): Promise<KnowledgeDocument> {
    const now = new Date().toISOString();
    const payload = {
      id: doc.id,
      user_id: doc.user_id,
      file_id: doc.file_id,
      original_name: doc.original_name,
      mime_type: doc.mime_type,
      status: doc.status,
      chunk_count: doc.chunk_count,
      error_message: doc.error_message || null,
      updated_at: now,
    };
    const admin = db();
    if (admin) {
      try {
        const { data, error } = await admin.from('knowledge_documents').upsert(payload).select().maybeSingle();
        if (!error && data) return data as KnowledgeDocument;
      } catch {
        //
      }
    }
    const created: KnowledgeDocument = {
      ...payload,
      created_at: doc.created_at || now,
      updated_at: now,
    };
    memoryStore.knowledgeDocuments = memoryStore.knowledgeDocuments.filter((d) => d.id !== created.id);
    memoryStore.knowledgeDocuments.unshift(created);
    return created;
  }

  static async listKnowledgeDocuments(userId: string): Promise<KnowledgeDocument[]> {
    const admin = db();
    if (admin) {
      try {
        const { data, error } = await admin
          .from('knowledge_documents')
          .select('*')
          .eq('user_id', userId)
          .order('updated_at', { ascending: false });
        if (!error && data) return data as KnowledgeDocument[];
      } catch {
        //
      }
    }
    return memoryStore.knowledgeDocuments.filter((d) => d.user_id === userId);
  }

  static async getKnowledgeDocumentByFile(userId: string, fileId: string): Promise<KnowledgeDocument | null> {
    const admin = db();
    if (admin) {
      try {
        const { data, error } = await admin
          .from('knowledge_documents')
          .select('*')
          .eq('user_id', userId)
          .eq('file_id', fileId)
          .maybeSingle();
        if (!error && data) return data as KnowledgeDocument;
      } catch {
        //
      }
    }
    return memoryStore.knowledgeDocuments.find((d) => d.user_id === userId && d.file_id === fileId) || null;
  }

  static async replaceKnowledgeChunks(userId: string, documentId: string, fileId: string, chunks: Array<{ content: string; embedding?: number[] | null; embedding_model?: string | null }>): Promise<number> {
    await this.deleteKnowledgeChunks(userId, documentId);
    const admin = db();
    const rows: KnowledgeChunk[] = chunks.map((chunk, index) => ({
      id: crypto.randomUUID(),
      document_id: documentId,
      user_id: userId,
      file_id: fileId,
      chunk_index: index,
      content: chunk.content,
      embedding: chunk.embedding || null,
      embedding_model: chunk.embedding_model || null,
      created_at: new Date().toISOString(),
    }));
    if (admin && rows.length) {
      try {
        const { error } = await admin.from('knowledge_chunks').insert(
          rows.map((row) => ({
            id: row.id,
            document_id: row.document_id,
            user_id: row.user_id,
            file_id: row.file_id,
            chunk_index: row.chunk_index,
            content: row.content,
            embedding: row.embedding,
            embedding_model: row.embedding_model,
          }))
        );
        if (!error) return rows.length;
      } catch {
        //
      }
    }
    memoryStore.knowledgeChunks.push(...rows);
    return rows.length;
  }

  static async deleteKnowledgeChunks(userId: string, documentId: string): Promise<void> {
    const admin = db();
    if (admin) {
      try {
        await admin.from('knowledge_chunks').delete().eq('user_id', userId).eq('document_id', documentId);
      } catch {
        //
      }
    }
    memoryStore.knowledgeChunks = memoryStore.knowledgeChunks.filter(
      (c) => !(c.user_id === userId && c.document_id === documentId)
    );
  }

  static async deleteKnowledgeForFile(userId: string, fileId: string): Promise<void> {
    const admin = db();
    if (admin) {
      try {
        await admin.from('knowledge_chunks').delete().eq('user_id', userId).eq('file_id', fileId);
        await admin.from('knowledge_documents').delete().eq('user_id', userId).eq('file_id', fileId);
      } catch {
        //
      }
    }
    memoryStore.knowledgeChunks = memoryStore.knowledgeChunks.filter((c) => !(c.user_id === userId && c.file_id === fileId));
    memoryStore.knowledgeDocuments = memoryStore.knowledgeDocuments.filter((d) => !(d.user_id === userId && d.file_id === fileId));
  }

  static async listKnowledgeChunks(userId: string): Promise<KnowledgeChunk[]> {
    const admin = db();
    if (admin) {
      try {
        const { data, error } = await admin.from('knowledge_chunks').select('*').eq('user_id', userId);
        if (!error && data) return data as KnowledgeChunk[];
      } catch {
        //
      }
    }
    return memoryStore.knowledgeChunks.filter((c) => c.user_id === userId);
  }

  static async searchKnowledge(userId: string, query: string, queryEmbedding: number[] | null, topK = 6): Promise<KnowledgeHit[]> {
    const { cosineSimilarity, keywordScore } = await import('../knowledge/chunk');
    const chunks = await this.listKnowledgeChunks(userId);
    const docs = await this.listKnowledgeDocuments(userId);
    const docById = new Map(docs.map((d) => [d.id, d]));
    const scored = chunks
      .map((chunk) => {
        const vectorScore =
          queryEmbedding && Array.isArray(chunk.embedding) && chunk.embedding.length === queryEmbedding.length
            ? cosineSimilarity(queryEmbedding, chunk.embedding)
            : 0;
        const lexical = keywordScore(query, chunk.content);
        return {
          chunk,
          score: vectorScore * 0.82 + lexical * 0.18,
        };
      })
      .filter((row) => row.score > 0.05)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, Math.min(topK, 12)));

    return scored.map((row) => ({
      chunk_id: row.chunk.id,
      document_id: row.chunk.document_id,
      file_id: row.chunk.file_id,
      user_id: row.chunk.user_id,
      original_name: docById.get(row.chunk.document_id)?.original_name || 'document',
      content: row.chunk.content,
      score: row.score,
    }));
  }

  static async getShareById(shareId: string): Promise<ResourceShare | null> {
    const admin = db();
    if (admin) {
      try {
        const { data, error } = await admin.from('resource_shares').select('*').eq('id', shareId).maybeSingle();
        if (!error && data) return data as ResourceShare;
      } catch {
        //
      }
    }
    return memoryStore.shares.find((s) => s.id === shareId) || null;
  }

  static async listSharesForOwner(ownerId: string, resourceType?: ShareResourceType, resourceId?: string): Promise<ResourceShare[]> {
    const admin = db();
    if (admin) {
      try {
        let query = admin.from('resource_shares').select('*').eq('owner_id', ownerId);
        if (resourceType) query = query.eq('resource_type', resourceType);
        if (resourceId) query = query.eq('resource_id', resourceId);
        const { data, error } = await query.order('created_at', { ascending: false });
        if (!error && data) return data as ResourceShare[];
      } catch (err) {
        console.error('Supabase listSharesForOwner error, falling back to memoryStore:', err);
      }
    }
    return memoryStore.shares.filter(
      (s) =>
        s.owner_id === ownerId &&
        (!resourceType || s.resource_type === resourceType) &&
        (!resourceId || s.resource_id === resourceId)
    );
  }

  static async listSharesForUser(userId: string, resourceType?: ShareResourceType): Promise<ResourceShare[]> {
    const admin = db();
    if (admin) {
      try {
        let query = admin.from('resource_shares').select('*').eq('shared_with_user_id', userId);
        if (resourceType) query = query.eq('resource_type', resourceType);
        const { data, error } = await query.order('created_at', { ascending: false });
        if (!error && data) return data as ResourceShare[];
      } catch (err) {
        console.error('Supabase listSharesForUser error, falling back to memoryStore:', err);
      }
    }
    return memoryStore.shares.filter(
      (s) => s.shared_with_user_id === userId && (!resourceType || s.resource_type === resourceType)
    );
  }

  static async isSharedWith(userId: string, resourceType: ShareResourceType, resourceId: string): Promise<boolean> {
    if (!userId) return false;
    const share = await this.findShare(resourceType, resourceId, userId);
    return Boolean(share);
  }

  static async findShare(resourceType: ShareResourceType, resourceId: string, userId: string): Promise<ResourceShare | null> {
    const admin = db();
    if (admin) {
      try {
        const { data, error } = await admin
          .from('resource_shares')
          .select('*')
          .eq('resource_type', resourceType)
          .eq('resource_id', resourceId)
          .eq('shared_with_user_id', userId)
          .maybeSingle();
        if (!error && data) return data as ResourceShare;
      } catch {
        //
      }
    }
    return (
      memoryStore.shares.find(
        (s) => s.resource_type === resourceType && s.resource_id === resourceId && s.shared_with_user_id === userId
      ) || null
    );
  }

  static async createShare(input: {
    resource_type: ShareResourceType;
    resource_id: string;
    owner_id: string;
    shared_with_user_id: string;
    shared_with_email?: string;
    permission?: SharePermission;
  }): Promise<ResourceShare> {
    const existing = await this.findShare(input.resource_type, input.resource_id, input.shared_with_user_id);
    if (existing) return existing;
    const payload = {
      resource_type: input.resource_type,
      resource_id: input.resource_id,
      owner_id: input.owner_id,
      shared_with_user_id: input.shared_with_user_id,
      shared_with_email: input.shared_with_email || null,
      permission: input.permission || 'read',
    };
    const admin = db();
    if (admin) {
      try {
        const { data, error } = await admin.from('resource_shares').insert(payload).select().single();
        if (!error && data) return data as ResourceShare;
      } catch (err) {
        console.error('Supabase createShare error, falling back to memoryStore:', err);
      }
    }
    const created: ResourceShare = {
      id: `share_${crypto.randomBytes(6).toString('hex')}`,
      resource_type: input.resource_type,
      resource_id: input.resource_id,
      owner_id: input.owner_id,
      shared_with_user_id: input.shared_with_user_id,
      shared_with_email: input.shared_with_email,
      permission: input.permission || 'read',
      created_at: new Date().toISOString(),
    };
    memoryStore.shares.unshift(created);
    return created;
  }

  static async deleteShare(ownerId: string, shareId: string): Promise<boolean> {
    const admin = db();
    if (admin) {
      try {
        const { data, error } = await admin
          .from('resource_shares')
          .delete()
          .eq('id', shareId)
          .eq('owner_id', ownerId)
          .select('id');
        if (!error && data && data.length > 0) return true;
      } catch (err) {
        console.error('Supabase deleteShare error, falling back to memoryStore:', err);
      }
    }
    const before = memoryStore.shares.length;
    memoryStore.shares = memoryStore.shares.filter((s) => !(s.id === shareId && s.owner_id === ownerId));
    return memoryStore.shares.length < before;
  }

  // API Keys
  static async listApiKeys(projectId?: string): Promise<ApiKey[]> {
    if (supabase) {
      try {
        let query = supabase.from('api_keys').select('*');
        if (projectId) {
          query = query.eq('project_id', projectId);
        }
        const { data, error } = await query.order('created_at', { ascending: false });
        if (!error && data) return data;
      } catch (err) {
        console.error('Supabase api keys error, falling back to memoryStore:', err);
      }
    }

    if (projectId) {
      return memoryStore.apiKeys.filter((k) => k.project_id === projectId);
    }
    return [...memoryStore.apiKeys];
  }

  static async getApiKeyByHash(keyHash: string): Promise<ApiKey | null> {
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('api_keys')
          .select('*')
          .eq('key_hash', keyHash)
          .eq('status', 'active')
          .maybeSingle();
        if (!error && data) return data;
      } catch (err) {
        console.error('Supabase getApiKeyByHash error, falling back to memoryStore:', err);
      }
    }
    return memoryStore.apiKeys.find((k) => k.key_hash === keyHash && k.status === 'active') || null;
  }

  static async createApiKey(data: Omit<ApiKey, 'id' | 'created_at'>): Promise<ApiKey> {
    if (supabase) {
      try {
        const { data: newKey, error } = await supabase
          .from('api_keys')
          .insert({
            project_id: data.project_id,
            name: data.name,
            key_prefix: data.key_prefix,
            key_hash: data.key_hash,
            environment: data.environment || 'production',
            rate_limit_rpm: data.rate_limit_rpm || 60,
            expires_at: data.expires_at,
            status: data.status || 'active',
          })
          .select()
          .single();
        if (!error && newKey) return newKey;
      } catch (err) {
        console.error('Supabase createApiKey error, falling back to memoryStore:', err);
      }
    }

    const newKey: ApiKey = {
      ...data,
      id: `key_${crypto.randomBytes(6).toString('hex')}`,
      created_at: new Date().toISOString(),
    };
    memoryStore.apiKeys.unshift(newKey);
    return newKey;
  }

  static async revokeApiKey(id: string): Promise<boolean> {
    if (supabase) {
      try {
        const { error } = await supabase.from('api_keys').update({ status: 'revoked' }).eq('id', id);
        if (!error) return true;
      } catch (err) {
        console.error('Supabase revokeApiKey error, falling back to memoryStore:', err);
      }
    }

    const key = memoryStore.apiKeys.find((k) => k.id === id);
    if (!key) return false;
    key.status = 'revoked';
    return true;
  }

  static async deleteApiKey(id: string): Promise<boolean> {
    if (supabase) {
      try {
        const { error } = await supabase.from('api_keys').delete().eq('id', id);
        if (!error) return true;
      } catch (err) {
        console.error('Supabase deleteApiKey error, falling back to memoryStore:', err);
      }
    }

    const idx = memoryStore.apiKeys.findIndex((k) => k.id === id);
    if (idx === -1) return false;
    memoryStore.apiKeys.splice(idx, 1);
    return true;
  }

  static async recordApiKeyUsage(id: string): Promise<void> {
    if (supabase) {
      try {
        await supabase.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', id);
        return;
      } catch (err) {
        console.error('Supabase recordApiKeyUsage error, falling back to memoryStore:', err);
      }
    }

    const key = memoryStore.apiKeys.find((k) => k.id === id);
    if (key) {
      key.last_used_at = new Date().toISOString();
    }
  }

  // Conversations & Messages
  static async listConversations(projectId?: string, agentId?: string): Promise<Conversation[]> {
    if (supabase) {
      try {
        let query = supabase.from('conversations').select('*');
        if (projectId) {
          query = query.eq('project_id', projectId);
        }
        if (agentId) {
          query = query.eq('agent_id', agentId);
        }
        const { data, error } = await query.order('updated_at', { ascending: false });
        if (!error && data) {
          const conversationsWithCounts = await Promise.all(
            data.map(async (c) => {
              const { count } = await supabase
                .from('messages')
                .select('*', { count: 'exact', head: true })
                .eq('conversation_id', c.id);
              return {
                ...c,
                message_count: count || 0,
              };
            })
          );
          return conversationsWithCounts;
        }
      } catch (err) {
        console.error('Supabase conversations list error, falling back to memoryStore:', err);
      }
    }

    return memoryStore.conversations
      .filter((c) => (!projectId || c.project_id === projectId) && (!agentId || c.agent_id === agentId))
      .map((c) => ({
        ...c,
        message_count: memoryStore.messages.filter((m) => m.conversation_id === c.id).length,
      }))
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }

  static async getConversation(id: string): Promise<{ conversation: Conversation; messages: ChatMessage[] } | null> {
    if (supabase) {
      try {
        const { data: conversation, error: convErr } = await supabase
          .from('conversations')
          .select('*')
          .eq('id', id)
          .maybeSingle();
        if (!convErr && conversation) {
          const { data: messages } = await supabase
            .from('messages')
            .select('*')
            .eq('conversation_id', id)
            .order('created_at', { ascending: true });
          return { conversation, messages: messages || [] };
        }
      } catch (err) {
        console.error('Supabase getConversation error, falling back to memoryStore:', err);
      }
    }

    const conv = memoryStore.conversations.find((c) => c.id === id);
    if (!conv) return null;
    const msgs = memoryStore.messages.filter((m) => m.conversation_id === id);
    return { conversation: conv, messages: msgs };
  }

  static conversationOwnerId(conversation: Conversation): string | undefined {
    const meta = conversation.metadata;
    if (!meta || typeof meta !== 'object') return undefined;
    const owner = (meta as Record<string, unknown>).owner_id;
    return typeof owner === 'string' ? owner : undefined;
  }

  static async listUserConversations(userId: string, projectId?: string): Promise<Conversation[]> {
    if (!userId) return [];
    const shared = await this.listSharesForUser(userId, 'conversation');
    const sharedIds = shared.map((s) => s.resource_id);
    if (supabase) {
      try {
        let query = supabase.from('conversations').select('*').contains('metadata', { owner_id: userId });
        if (projectId) {
          query = query.eq('project_id', projectId);
        }
        const { data, error } = await query.order('updated_at', { ascending: false });
        let owned: Conversation[] = [];
        if (!error && data) {
          owned = data.map((c) => ({ ...c, message_count: 0 }));
        }
        const extra: Conversation[] = [];
        for (const id of sharedIds) {
          if (owned.some((c) => c.id === id)) continue;
          const row = await this.getConversation(id);
          if (row) extra.push({ ...row.conversation, message_count: row.messages.length });
        }
        return [...owned, ...extra].sort(
          (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        );
      } catch (err) {
        console.error('Supabase listUserConversations error, falling back to memoryStore:', err);
      }
    }
    const all = await this.listConversations(projectId);
    return all.filter((c) => this.conversationOwnerId(c) === userId || sharedIds.includes(c.id));
  }

  static async getOrCreateConversation(
    id: string | undefined,
    projectId: string,
    agentId: string,
    title = 'New Conversation',
    ownerId?: string
  ): Promise<Conversation> {
    if (supabase) {
      try {
        if (id) {
          const { data: existing } = await supabase.from('conversations').select('*').eq('id', id).maybeSingle();
          if (existing) {
            const existingOwner = this.conversationOwnerId(existing);
            if (existingOwner && existingOwner !== ownerId) {
              const shared = ownerId ? await this.isSharedWith(ownerId, 'conversation', existing.id) : false;
              if (!shared) throw new Error('Conversation not found');
            }
            return existing;
          }
        }
        const insertId = id || crypto.randomUUID();
        const { data: newConv, error } = await supabase
          .from('conversations')
          .insert({
            id: insertId,
            project_id: projectId,
            agent_id: agentId,
            title,
            metadata: ownerId ? { owner_id: ownerId } : {},
          })
          .select()
          .single();
        if (!error && newConv) return newConv;
      } catch (err) {
        console.error('Supabase getOrCreateConversation error, falling back to memoryStore:', err);
      }
    }

    if (id) {
      const existing = memoryStore.conversations.find((c) => c.id === id);
      if (existing) {
        const existingOwner = this.conversationOwnerId(existing);
        if (existingOwner && existingOwner !== ownerId) {
          const shared = ownerId ? await this.isSharedWith(ownerId, 'conversation', existing.id) : false;
          if (!shared) throw new Error('Conversation not found');
        }
        return existing;
      }
    }
    const newConv: Conversation = {
      id: id || `conv_${crypto.randomBytes(6).toString('hex')}`,
      project_id: projectId,
      agent_id: agentId,
      title,
      metadata: ownerId ? { owner_id: ownerId } : {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    memoryStore.conversations.unshift(newConv);
    return newConv;
  }

  static async saveMessage(
    conversationId: string,
    role: 'user' | 'model' | 'system' | 'tool',
    content: string,
    toolCalls?: ChatMessage['tool_calls'],
    toolResults?: ChatMessage['tool_results'],
    tokensUsed = 0
  ): Promise<ChatMessage> {
    if (supabase) {
      try {
        const { data: msg, error } = await supabase
          .from('messages')
          .insert({
            conversation_id: conversationId,
            role,
            content,
            tool_calls: toolCalls || null,
            tool_results: toolResults || null,
            tokens_used: tokensUsed,
          })
          .select()
          .single();
        if (!error && msg) {
          // Update conversation timestamp & title if needed
          const { data: conv } = await supabase.from('conversations').select('*').eq('id', conversationId).maybeSingle();
          if (conv) {
            await supabase.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId);
            if (role === 'user' && conv.title === 'New Conversation') {
              const newTitle = content.slice(0, 45) + (content.length > 45 ? '...' : '');
              await supabase.from('conversations').update({ title: newTitle }).eq('id', conversationId);
            }
          }
          return msg;
        }
      } catch (err) {
        console.error('Supabase saveMessage error, falling back to memoryStore:', err);
      }
    }

    const msg: ChatMessage = {
      id: `msg_${crypto.randomBytes(6).toString('hex')}`,
      conversation_id: conversationId,
      role,
      content,
      tool_calls: toolCalls,
      tool_results: toolResults,
      tokens_used: tokensUsed,
      created_at: new Date().toISOString(),
    };
    memoryStore.messages.push(msg);

    const conv = memoryStore.conversations.find((c) => c.id === conversationId);
    if (conv) {
      conv.updated_at = new Date().toISOString();
      if (role === 'user' && conv.title === 'New Conversation') {
        conv.title = content.slice(0, 45) + (content.length > 45 ? '...' : '');
      }
    }

    return msg;
  }

  static async updateConversation(id: string, patch: { title?: string }): Promise<Conversation | null> {
    const title = typeof patch.title === 'string' ? patch.title.trim().slice(0, 120) : undefined;
    if (!title) {
      const current = await this.getConversation(id);
      return current?.conversation || null;
    }

    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('conversations')
          .update({ title, updated_at: new Date().toISOString() })
          .eq('id', id)
          .select()
          .maybeSingle();
        if (!error && data) return data;
      } catch (err) {
        console.error('Supabase updateConversation error, falling back to memoryStore:', err);
      }
    }

    const conv = memoryStore.conversations.find((c) => c.id === id);
    if (!conv) return null;
    conv.title = title;
    conv.updated_at = new Date().toISOString();
    return conv;
  }

  static async deleteConversation(id: string): Promise<boolean> {
    if (supabase) {
      try {
        const { error } = await supabase.from('conversations').delete().eq('id', id);
        if (!error) return true;
      } catch (err) {
        console.error('Supabase deleteConversation error, falling back to memoryStore:', err);
      }
    }

    const idx = memoryStore.conversations.findIndex((c) => c.id === id);
    if (idx === -1) return false;
    memoryStore.conversations.splice(idx, 1);
    memoryStore.messages = memoryStore.messages.filter((m) => m.conversation_id !== id);
    return true;
  }

  // Usage Logs
  static async logUsage(entry: Omit<UsageLog, 'id' | 'created_at'>): Promise<UsageLog> {
    if (supabase) {
      try {
        const payload: Record<string, unknown> = {
            project_id: entry.project_id,
            agent_id: entry.agent_id || null,
            api_key_id: entry.api_key_id || null,
            user_id: entry.user_id || null,
            endpoint: entry.endpoint,
            model: entry.model,
            prompt_tokens: entry.prompt_tokens || 0,
            candidate_tokens: entry.candidate_tokens || 0,
            total_tokens: entry.total_tokens || 0,
            status_code: entry.status_code || 200,
            latency_ms: entry.latency_ms || 0,
            error_message: entry.error_message || null,
            ip_address: entry.ip_address || null,
          };
        let { data, error } = await supabase.from('usage_logs').insert(payload).select().single();
        if (error && payload.user_id) {
          const { user_id: _ignored, ...withoutUser } = payload;
          const retry = await supabase.from('usage_logs').insert(withoutUser).select().single();
          data = retry.data;
          error = retry.error;
        }
        if (!error && data) return data;
      } catch (err) {
        console.error('Supabase logUsage error, falling back to memoryStore:', err);
      }
    }

    const log: UsageLog = {
      ...entry,
      id: `log_${crypto.randomBytes(6).toString('hex')}`,
      created_at: new Date().toISOString(),
    };
    memoryStore.usageLogs.unshift(log);
    if (memoryStore.usageLogs.length > 1000) {
      memoryStore.usageLogs.pop();
    }
    return log;
  }

  static async getUsageStats(projectId?: string, userId?: string): Promise<{
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    totalTokens: number;
    promptTokens: number;
    candidateTokens: number;
    avgLatencyMs: number;
    recentLogs: UsageLog[];
  }> {
    if (supabase) {
      try {
        let query = supabase.from('usage_logs').select('*');
        if (projectId) {
          query = query.eq('project_id', projectId);
        }
        if (userId) {
          query = query.eq('user_id', userId);
        }
        const { data: logs, error } = await query.order('created_at', { ascending: false });
        if (!error && logs) {
          const scopedLogs = userId ? logs.filter((l) => l.user_id === userId) : logs;
          const totalRequests = scopedLogs.length;
          const successfulRequests = scopedLogs.filter((l) => l.status_code >= 200 && l.status_code < 300).length;
          const failedRequests = totalRequests - successfulRequests;
          const totalTokens = scopedLogs.reduce((acc, curr) => acc + (curr.total_tokens || 0), 0);
          const promptTokens = scopedLogs.reduce((acc, curr) => acc + (curr.prompt_tokens || 0), 0);
          const candidateTokens = scopedLogs.reduce((acc, curr) => acc + (curr.candidate_tokens || 0), 0);
          const avgLatencyMs =
            totalRequests > 0
              ? Math.round(scopedLogs.reduce((acc, curr) => acc + (curr.latency_ms || 0), 0) / totalRequests)
              : 0;

          return {
            totalRequests,
            successfulRequests,
            failedRequests,
            totalTokens,
            promptTokens,
            candidateTokens,
            avgLatencyMs,
            recentLogs: scopedLogs.slice(0, 50),
          };
        }
      } catch (err) {
        console.error('Supabase getUsageStats error, falling back to memoryStore:', err);
      }
    }

    let logs = projectId
      ? memoryStore.usageLogs.filter((l) => l.project_id === projectId)
      : memoryStore.usageLogs;
    if (userId) {
      logs = logs.filter((l) => l.user_id === userId);
    }

    const totalRequests = logs.length;
    const successfulRequests = logs.filter((l) => l.status_code >= 200 && l.status_code < 300).length;
    const failedRequests = totalRequests - successfulRequests;
    const totalTokens = logs.reduce((acc, curr) => acc + (curr.total_tokens || 0), 0);
    const promptTokens = logs.reduce((acc, curr) => acc + (curr.prompt_tokens || 0), 0);
    const candidateTokens = logs.reduce((acc, curr) => acc + (curr.candidate_tokens || 0), 0);
    const avgLatencyMs =
      totalRequests > 0
        ? Math.round(logs.reduce((acc, curr) => acc + (curr.latency_ms || 0), 0) / totalRequests)
        : 0;

    return {
      totalRequests,
      successfulRequests,
      failedRequests,
      totalTokens,
      promptTokens,
      candidateTokens,
      avgLatencyMs,
      recentLogs: logs.slice(0, 50),
    };
  }

  // Audit Logs
  static async logAudit(entry: Omit<AuditLog, 'id' | 'created_at'>): Promise<AuditLog> {
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('audit_logs')
          .insert({
            project_id: entry.project_id,
            user_email: entry.user_email,
            action: entry.action,
            resource_type: entry.resource_type,
            resource_id: entry.resource_id,
            details: entry.details || {},
          })
          .select()
          .single();
        if (!error && data) return data;
      } catch (err) {
        console.error('Supabase logAudit error, falling back to memoryStore:', err);
      }
    }

    const log: AuditLog = {
      ...entry,
      id: `audit_${crypto.randomBytes(6).toString('hex')}`,
      created_at: new Date().toISOString(),
    };
    memoryStore.auditLogs.unshift(log);
    return log;
  }

  static async listAuditLogs(projectId?: string): Promise<AuditLog[]> {
    if (supabase) {
      try {
        let query = supabase.from('audit_logs').select('*');
        if (projectId) {
          query = query.eq('project_id', projectId);
        }
        const { data, error } = await query.order('created_at', { ascending: false });
        if (!error && data) return data;
      } catch (err) {
        console.error('Supabase listAuditLogs error, falling back to memoryStore:', err);
      }
    }

    if (projectId) {
      return memoryStore.auditLogs.filter((a) => a.project_id === projectId);
    }
    return [...memoryStore.auditLogs];
  }

  // --- AI PROVIDERS MANAGEMENT METHODS ---
  private static providerToolName(id: string): string {
    return `oa_provider_${id}`;
  }

  private static deletedProviderToolName(id: string): string {
    return `oa_provider_deleted_${id}`;
  }

  private static rememberDeletedProvider(id: string): void {
    if (!memoryStore.deletedProviderIds.includes(id)) {
      memoryStore.deletedProviderIds.push(id);
    }
    const idx = memoryStore.providers.findIndex((p) => p.id === id);
    if (idx !== -1) memoryStore.providers.splice(idx, 1);
  }

  private static forgetDeletedProvider(id: string): void {
    memoryStore.deletedProviderIds = memoryStore.deletedProviderIds.filter((item) => item !== id);
  }

  private static async listDeletedProviderIds(): Promise<Set<string>> {
    const deleted = new Set(memoryStore.deletedProviderIds);
    if (!supabase) return deleted;
    try {
      const { data, error } = await supabase
        .from('agent_tools')
        .select('name')
        .eq('description', 'omniagent-provider-deleted-v1');
      if (error || !data) return deleted;
      for (const row of data) {
        const name = String(row.name || '');
        const id = name.replace(/^oa_provider_deleted_/, '');
        if (id) deleted.add(id);
      }
    } catch {
      // ignore
    }
    return deleted;
  }

  private static async markProviderDeleted(id: string): Promise<void> {
    this.rememberDeletedProvider(id);
    if (!supabase) return;
    try {
      await supabase.from('agent_tools').upsert(
        {
          name: this.deletedProviderToolName(id),
          display_name: `Deleted provider ${id}`,
          description: 'omniagent-provider-deleted-v1',
          parameters_schema: { id, deleted_at: new Date().toISOString() },
          is_system: false,
        },
        { onConflict: 'name' }
      );
    } catch {
      // ignore
    }
  }

  private static async clearProviderDeleted(id: string): Promise<void> {
    this.forgetDeletedProvider(id);
    if (!supabase) return;
    try {
      await supabase.from('agent_tools').delete().eq('name', this.deletedProviderToolName(id));
    } catch {
      // ignore
    }
  }

  private static hydrateProvider(provider: AIProvider, includeSecret: boolean): AIProvider {
    const mapped: AIProvider = {
      ...provider,
      type: provider.type || kindFromProtocol(provider.protocol),
      hasApiKey: Boolean(provider.apiKey || provider.hasApiKey),
      apiKey: includeSecret ? provider.apiKey : undefined,
    };
    return includeSecret ? mapped : toPublicProvider(mapped);
  }

  private static mergeProviderLists(includeSecret: boolean, ...groups: AIProvider[][]): AIProvider[] {
    const byId = new Map<string, AIProvider>();
    for (const group of groups) {
      for (const provider of group) {
        if (!provider?.id || byId.has(provider.id)) continue;
        byId.set(provider.id, this.hydrateProvider(provider, includeSecret));
      }
    }
    return Array.from(byId.values());
  }

  private static async listLegacyProviders(includeSecret = false): Promise<AIProvider[]> {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from('agent_tools')
        .select('*')
        .eq('description', 'omniagent-provider-v1');
      if (error || !data) return [];
      return data
        .map((row) => {
          const payload = (row.parameters_schema && typeof row.parameters_schema === 'object'
            ? row.parameters_schema
            : {}) as Record<string, unknown>;
          const id = String(payload.id || String(row.name || '').replace(/^oa_provider_/, ''));
          if (!id) return null;
          return mapRowToProvider({ ...payload, id }, includeSecret);
        })
        .filter((p): p is AIProvider => Boolean(p));
    } catch {
      return [];
    }
  }

  private static async saveLegacyProvider(provider: AIProvider, encryptedKey: string): Promise<boolean> {
    if (!supabase) return false;
    try {
      const row = {
        name: this.providerToolName(provider.id),
        display_name: provider.name,
        description: 'omniagent-provider-v1',
        parameters_schema: toDbProviderRow(provider, encryptedKey),
        is_system: false,
      };
      const { error } = await supabase.from('agent_tools').upsert(row, { onConflict: 'name' });
      if (error) {
        console.error('Legacy provider persist error:', error.message);
        return false;
      }
      return true;
    } catch (err) {
      console.error('Legacy provider persist error:', err);
      return false;
    }
  }

  private static async deleteLegacyProvider(id: string): Promise<boolean> {
    if (!supabase) return false;
    try {
      const { error } = await supabase.from('agent_tools').delete().eq('name', this.providerToolName(id));
      return !error;
    } catch {
      return false;
    }
  }

  static async listProviders(includeSecret = false): Promise<AIProvider[]> {
    const fromTable: AIProvider[] = [];
    if (supabase) {
      try {
        const { data, error } = await supabase.from('ai_providers').select('*').order('created_at', { ascending: false });
        if (!error && data) {
          fromTable.push(...data.map((p) => mapRowToProvider(p, includeSecret)));
        }
      } catch {
        // Table may not exist yet
      }
    }
    const fromLegacy = await this.listLegacyProviders(includeSecret);
    const deletedIds = await this.listDeletedProviderIds();
    return this.mergeProviderLists(includeSecret, fromTable, fromLegacy, memoryStore.providers).filter(
      (provider) => !deletedIds.has(provider.id)
    );
  }

  static async getProvider(id: string, includeSecret = false): Promise<AIProvider | null> {
    const deletedIds = await this.listDeletedProviderIds();
    if (deletedIds.has(id)) return null;
    if (supabase) {
      try {
        const { data, error } = await supabase.from('ai_providers').select('*').eq('id', id).maybeSingle();
        if (!error && data) {
          const mapped = mapRowToProvider(data, includeSecret);
          return includeSecret ? mapped : toPublicProvider(mapped);
        }
      } catch {
        // Fallback
      }
    }
    const legacy = (await this.listLegacyProviders(includeSecret)).find((p) => p.id === id);
    if (legacy) return includeSecret ? legacy : toPublicProvider(legacy);
    const found = memoryStore.providers.find((p) => p.id === id);
    if (!found) return null;
    return this.hydrateProvider(found, includeSecret);
  }

  static async getDefaultProvider(includeSecret = false): Promise<AIProvider | null> {
    const providers = await this.listProviders(includeSecret);
    return providers.find((p) => p.isDefault && p.enabled) || providers.find((p) => p.enabled) || null;
  }

  static async createProvider(data: Partial<AIProvider>): Promise<AIProvider> {
    const id = data.id?.trim() || slugifyProviderId(data.name || 'provider');
    const resolvedProtocol = data.protocol || (data.type === 'anthropic' || data.type === 'anthropic-compatible'
      ? 'anthropic'
      : data.type === 'gemini'
        ? 'gemini'
        : data.type === 'custom-http'
          ? 'custom'
          : 'openai');
    const encryptedKey = data.apiKey ? encryptProviderSecret(data.apiKey) : '';
    const newProvider: AIProvider = {
      id,
      name: data.name || 'New Provider',
      type: data.type || kindFromProtocol(resolvedProtocol),
      protocol: resolvedProtocol,
      baseUrl: (data.baseUrl || '').trim(),
      apiKey: data.apiKey || '',
      hasApiKey: Boolean(data.apiKey),
      enabled: data.enabled !== false,
      defaultModel: data.defaultModel || '',
      models: data.models || (data.defaultModel ? [data.defaultModel] : []),
      capabilities: data.capabilities || ['TEXT', 'STREAMING'],
      connectionStatus: data.connectionStatus || 'Untested',
      lastTested: data.lastTested || null,
      latencyMs: data.latencyMs || null,
      usageCount: 0,
      errorRate: 0,
      isDefault: Boolean(data.isDefault),
      isSystem: Boolean(data.isSystem),
      scope: data.scope || 'global',
      ownerId: data.ownerId,
      metadata: data.metadata || {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (newProvider.isDefault) {
      await this.clearDefaultFlag(newProvider.id);
    }
    await this.clearProviderDeleted(newProvider.id);

    let persisted: AIProvider | null = null;
    if (supabase) {
      try {
        const { data: inserted, error } = await supabase
          .from('ai_providers')
          .insert(toDbProviderRow(newProvider, encryptedKey))
          .select()
          .single();
        if (!error && inserted) {
          persisted = toPublicProvider(mapRowToProvider(inserted, false));
        } else if (error) {
          console.error('Supabase createProvider error, using shared fallback store:', error.message);
        }
      } catch (err) {
        console.error('Supabase createProvider error, using shared fallback store:', err);
      }
    }

    const legacySaved = await this.saveLegacyProvider(
      newProvider,
      encryptedKey || encryptProviderSecret(newProvider.apiKey || '')
    );
    if (!persisted && legacySaved) {
      persisted = toPublicProvider(newProvider);
    }

    const existingIdx = memoryStore.providers.findIndex((p) => p.id === newProvider.id);
    if (existingIdx !== -1) {
      memoryStore.providers[existingIdx] = newProvider;
    } else {
      memoryStore.providers.unshift(newProvider);
    }

    if (!persisted && isProduction()) {
      throw new Error('Could not save provider to the shared database, so it would not appear on other devices.');
    }
    return persisted || toPublicProvider(newProvider);
  }

  static async updateProvider(id: string, updates: Partial<AIProvider>): Promise<AIProvider | null> {
    const originalProvider = await this.getProvider(id, true);
    const memoryIdx = memoryStore.providers.findIndex((p) => p.id === id);
    if (!originalProvider && memoryIdx === -1) return null;
    const base = originalProvider || memoryStore.providers[memoryIdx];
    if (!base) return null;

    const incomingKey = typeof updates.apiKey === 'string' ? updates.apiKey.trim() : undefined;
    const replaceKey = Boolean(incomingKey);
    const nextKey = replaceKey ? incomingKey! : base.apiKey || '';
    const merged: AIProvider = {
      ...base,
      ...updates,
      type: updates.type || base.type || kindFromProtocol(updates.protocol || base.protocol),
      protocol: updates.protocol || base.protocol,
      apiKey: nextKey,
      hasApiKey: Boolean(nextKey || base.hasApiKey),
      metadata: updates.metadata ? { ...(base.metadata || {}), ...updates.metadata } : base.metadata,
      updated_at: new Date().toISOString(),
    };

    if (updates.isDefault) {
      await this.clearDefaultFlag(id);
    }

    const encryptedKey = replaceKey ? encryptProviderSecret(incomingKey!) : encryptProviderSecret(nextKey || '');
    if (supabase) {
      try {
        const patch = toDbProviderRow(merged, encryptedKey);
        if (!replaceKey) {
          delete (patch as { api_key?: string }).api_key;
        }
        const { data: updated, error } = await supabase
          .from('ai_providers')
          .update(patch)
          .eq('id', id)
          .select()
          .single();

        if (!error && updated) {
          if (memoryIdx !== -1) memoryStore.providers[memoryIdx] = merged;
          await this.saveLegacyProvider(merged, encryptedKey);
          return toPublicProvider(mapRowToProvider(updated, false));
        }
      } catch {
        // Fallback
      }
    }

    await this.saveLegacyProvider(merged, encryptedKey);

    if (memoryIdx !== -1) {
      memoryStore.providers[memoryIdx] = merged;
    } else {
      memoryStore.providers.unshift(merged);
    }
    return toPublicProvider(merged);
  }

  static async clearDefaultFlag(exceptId?: string): Promise<void> {
    memoryStore.providers.forEach((p) => {
      if (p.id !== exceptId) p.isDefault = false;
    });
    if (supabase) {
      try {
        let query = supabase.from('ai_providers').update({ is_default: false });
        if (exceptId) query = query.neq('id', exceptId);
        await query;
      } catch {
        // optional
      }
    }
  }

  static async setDefaultProvider(id: string): Promise<AIProvider | null> {
    await this.clearDefaultFlag(id);
    return this.updateProvider(id, { isDefault: true, enabled: true });
  }

  static async deleteProvider(id: string): Promise<boolean> {
    const existing = await this.getProvider(id, true);
    if (existing?.isSystem && existing.protocol === 'gemini' && existing.id === 'gemini') {
      throw new Error('The native Gemini provider cannot be deleted');
    }

    if (supabase) {
      try {
        await supabase.from('ai_providers').delete().eq('id', id);
      } catch {
        // Fallback to shared tombstone
      }
    }
    await this.deleteLegacyProvider(id);
    this.rememberDeletedProvider(id);
    await this.markProviderDeleted(id);
    return true;
  }
}
