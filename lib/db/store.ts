import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Project, Agent, ApiKey, Conversation, ChatMessage, UsageLog, AuditLog, User, AuthSession, UserRole, UserStatus, PlatformOverview } from '../types';
import { AIProvider } from '../providers/types';
import { hashApiKey } from '../auth/api-key';
import { getAdminEmail, getAdminPassword, isProduction } from '../config';
import { encryptProviderSecret } from '../providers/secrets';
import { kindFromProtocol, slugifyProviderId } from '../providers/catalog';
import { mapRowToProvider, toDbProviderRow, toPublicProvider } from '../providers/mapping';
import crypto from 'crypto';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = isProduction()
  ? process.env.SUPABASE_SERVICE_ROLE_KEY
  : process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false },
      })
    : null;

interface StoredUser extends User {
  password_hash: string;
  salt: string;
}

interface StoredSession {
  token: string;
  user_id: string;
  expires_at: string;
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

export const DEMO_PRESET_KEY = DEMO_API_KEY_RAW;

export class DatabaseStore {
  // Check Supabase connection state
  static isSupabaseConfigured(): boolean {
    if (isProduction()) {
      return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
    }
    return Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
        (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    );
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
    if (supabase) {
      try {
        const { data, error } = await supabase.auth.signUp({
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
        const role = isSystemAdmin ? 'admin' : 'developer';

        // Upsert profile record
        await supabase.from('profiles').upsert({
          id: data.user.id,
          email: email.toLowerCase(),
          full_name: fullName || email.split('@')[0],
          role: role,
          status: 'active',
          last_active_at: new Date().toISOString(),
        });

        // Add to default project member list
        await supabase.from('project_members').upsert({
          project_id: 'da1a0000-0000-4000-8000-000000000001',
          user_id: data.user.id,
          role: isSystemAdmin ? 'admin' : 'member',
        });

        return {
          user: {
            id: data.user.id,
            email: email.toLowerCase(),
            full_name: fullName || email.split('@')[0],
            role,
            status: 'active',
            last_active_at: new Date().toISOString(),
            created_at: data.user.created_at,
          },
          token: data.session?.access_token || '',
          expiresAt: data.session
            ? new Date(Date.now() + (data.session.expires_in || 3600) * 1000).toISOString()
            : new Date(Date.now() + 86400000 * 7).toISOString(),
        };
      } catch (err) {
        console.error('Supabase registration error, falling back to memoryStore:', err);
      }
    }

    // Memory Store Fallback
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

    const token = `sess_${crypto.randomBytes(24).toString('hex')}`;
    const expiresAt = new Date(Date.now() + 86400000 * 7).toISOString();

    memoryStore.sessions.push({
      token,
      user_id: newUser.id,
      expires_at: expiresAt,
    });

    const { password_hash: _, salt: __, ...userWithoutSecrets } = newUser;
    return {
      user: userWithoutSecrets,
      token,
      expiresAt,
    };
  }

  static async loginUser(email: string, password: string): Promise<AuthSession> {
    if (supabase) {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        if (!data.user || !data.session) throw new Error('Invalid credentials.');

        let { data: profile } = await supabase.from('profiles').select('*').eq('id', data.user.id).maybeSingle();
        const configuredAdminEmail = getAdminEmail();
        const isSystemAdmin = Boolean(configuredAdminEmail) && email.toLowerCase() === configuredAdminEmail!.toLowerCase();
        const role = isSystemAdmin ? 'admin' : profile?.role || 'developer';
        const status: UserStatus = profile?.status === 'disabled' ? 'disabled' : 'active';
        if (status === 'disabled') {
          const disabledError = new Error('This account has been disabled.');
          (disabledError as Error & { code?: string }).code = 'ACCOUNT_DISABLED';
          throw disabledError;
        }

        if (!profile) {
          // Sync profile to database
          const { data: newProfile } = await supabase
            .from('profiles')
            .upsert({
              id: data.user.id,
              email: email.toLowerCase(),
              full_name: data.user.user_metadata?.full_name || email.split('@')[0],
              role,
              status: 'active',
              last_active_at: new Date().toISOString(),
            })
            .select()
            .single();
          if (newProfile) profile = newProfile;
        } else {
          await supabase
            .from('profiles')
            .update({ last_active_at: new Date().toISOString() })
            .eq('id', data.user.id);
        }

        return {
          user: {
            id: data.user.id,
            email: data.user.email!,
            full_name: profile?.full_name || data.user.user_metadata?.full_name || email.split('@')[0],
            role,
            status,
            last_active_at: new Date().toISOString(),
            created_at: data.user.created_at,
          },
          token: data.session.access_token,
          expiresAt: new Date(Date.now() + (data.session.expires_in || 3600) * 1000).toISOString(),
        };
      } catch (err) {
        if (err instanceof Error && ((err as Error & { code?: string }).code === 'ACCOUNT_DISABLED' || /disabled/i.test(err.message))) {
          throw err;
        }
        console.error('Supabase login error, falling back to memoryStore:', err);
      }
    }

    // Memory Store Fallback
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

    const token = `sess_${crypto.randomBytes(24).toString('hex')}`;
    const expiresAt = new Date(Date.now() + 86400000 * 7).toISOString();

    memoryStore.sessions.push({
      token,
      user_id: user.id,
      expires_at: expiresAt,
    });

    const { password_hash: _, salt: __, ...userWithoutSecrets } = user;
    return {
      user: userWithoutSecrets,
      token,
      expiresAt,
    };
  }

  static async verifySessionToken(token: string): Promise<User | null> {
    if (!token) return null;

    if (supabase) {
      try {
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (!error && user?.email) {
          const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
          const configuredAdminEmail = getAdminEmail();
          const isSystemAdmin = Boolean(configuredAdminEmail) && user.email.toLowerCase() === configuredAdminEmail!.toLowerCase();

          return {
            id: user.id,
            email: user.email,
            full_name: profile?.full_name || user.user_metadata?.full_name || user.email.split('@')[0] || '',
            role: isSystemAdmin ? 'admin' : profile?.role || 'developer',
            status: profile?.status === 'disabled' ? 'disabled' : 'active',
            last_active_at: profile?.last_active_at || null,
            created_at: user.created_at,
          };
        }
      } catch (err) {
        console.error('Supabase session verification error, falling back to memoryStore:', err);
      }
    }

    // Memory Store Fallback
    const sess = memoryStore.sessions.find((s) => s.token === token);
    if (!sess) return null;

    if (new Date(sess.expires_at).getTime() < Date.now()) {
      memoryStore.sessions = memoryStore.sessions.filter((s) => s.token !== token);
      return null;
    }

    const user = memoryStore.users.find((u) => u.id === sess.user_id);
    if (!user) return null;

    const { password_hash: _, salt: __, ...userWithoutSecrets } = user;
    return userWithoutSecrets;
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
    };
  }

  static async listUsers(query?: string): Promise<User[]> {
    const needle = query?.trim().toLowerCase();
    if (supabase) {
      try {
        let req = supabase.from('profiles').select('*').order('created_at', { ascending: false });
        const { data, error } = await req;
        if (!error && data) {
          const users = data.map((row) => this.toPublicUser({
            id: row.id,
            email: row.email,
            full_name: row.full_name,
            role: row.role || 'developer',
            status: row.status === 'disabled' ? 'disabled' : 'active',
            last_active_at: row.last_active_at || null,
            created_at: row.created_at,
          }));
          if (!needle) return users;
          return users.filter(
            (u) =>
              u.email.toLowerCase().includes(needle) ||
              (u.full_name || '').toLowerCase().includes(needle)
          );
        }
      } catch (err) {
        console.error('Supabase listUsers error, falling back to memoryStore:', err);
      }
    }

    const users = memoryStore.users.map((u) => this.toPublicUser(u));
    if (!needle) return users;
    return users.filter(
      (u) =>
        u.email.toLowerCase().includes(needle) ||
        (u.full_name || '').toLowerCase().includes(needle)
    );
  }

  static async getUserById(id: string): Promise<User | null> {
    if (supabase) {
      try {
        const { data, error } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle();
        if (!error && data) {
          return this.toPublicUser({
            id: data.id,
            email: data.email,
            full_name: data.full_name,
            role: data.role || 'developer',
            status: data.status === 'disabled' ? 'disabled' : 'active',
            last_active_at: data.last_active_at || null,
            created_at: data.created_at,
          });
        }
      } catch (err) {
        console.error('Supabase getUserById error, falling back to memoryStore:', err);
      }
    }
    const user = memoryStore.users.find((u) => u.id === id);
    return user ? this.toPublicUser(user) : null;
  }

  static async updateUser(
    id: string,
    updates: { role?: UserRole; status?: UserStatus; full_name?: string }
  ): Promise<User | null> {
    if (supabase) {
      try {
        const payload: Record<string, unknown> = {};
        if (updates.role) payload.role = updates.role;
        if (updates.status) payload.status = updates.status;
        if (updates.full_name !== undefined) payload.full_name = updates.full_name;
        const { data, error } = await supabase.from('profiles').update(payload).eq('id', id).select().maybeSingle();
        if (!error && data) {
          return this.toPublicUser({
            id: data.id,
            email: data.email,
            full_name: data.full_name,
            role: data.role || 'developer',
            status: data.status === 'disabled' ? 'disabled' : 'active',
            last_active_at: data.last_active_at || null,
            created_at: data.created_at,
          });
        }
      } catch (err) {
        console.error('Supabase updateUser error, falling back to memoryStore:', err);
      }
    }

    const user = memoryStore.users.find((u) => u.id === id);
    if (!user) return null;
    if (updates.role) user.role = updates.role;
    if (updates.status) user.status = updates.status;
    if (updates.full_name !== undefined) user.full_name = updates.full_name;
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

  static async updateUserProfile(id: string, updates: { full_name?: string }): Promise<User | null> {
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
    const memberIds = await this.listUserProjectIds(userId);
    const all = await this.listProjects();
    if (memberIds.length === 0) {
      return all.filter((p) => p.id === 'proj_default_core' || p.slug === 'core-platform').slice(0, 1);
    }
    return all.filter((p) => memberIds.includes(p.id));
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
    const [users, projects, agents, providers, usage, conversationCount] = await Promise.all([
      this.listUsers(),
      this.listProjects(),
      this.listAgents(),
      this.listProviders(),
      this.getUsageStats(),
      this.countConversations(),
    ]);
    return {
      totalUsers: users.length,
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
    if (supabase) {
      try {
        let query = supabase.from('conversations').select('*').contains('metadata', { owner_id: userId });
        if (projectId) {
          query = query.eq('project_id', projectId);
        }
        const { data, error } = await query.order('updated_at', { ascending: false });
        if (!error && data) {
          return data.map((c) => ({ ...c, message_count: 0 }));
        }
      } catch (err) {
        console.error('Supabase listUserConversations error, falling back to memoryStore:', err);
      }
    }
    const all = await this.listConversations(projectId);
    return all.filter((c) => this.conversationOwnerId(c) === userId);
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
              throw new Error('Conversation not found');
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
          throw new Error('Conversation not found');
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
