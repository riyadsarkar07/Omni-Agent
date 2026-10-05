import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Project, Agent, ApiKey, Conversation, ChatMessage, UsageLog, AuditLog, User, AuthSession } from '../types';
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
  agents: Agent[];
  apiKeys: ApiKey[];
  conversations: Conversation[];
  messages: ChatMessage[];
  usageLogs: UsageLog[];
  auditLogs: AuditLog[];
  providers: AIProvider[];
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
    ]
  };
}

const memoryStore = globalForStore.memoryStore!;

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
      password_hash,
      salt,
      created_at: new Date().toISOString(),
    };

    memoryStore.users.push(newUser);

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

        if (!profile) {
          // Sync profile to database
          const { data: newProfile } = await supabase
            .from('profiles')
            .upsert({
              id: data.user.id,
              email: email.toLowerCase(),
              full_name: data.user.user_metadata?.full_name || email.split('@')[0],
              role,
            })
            .select()
            .single();
          if (newProfile) profile = newProfile;
        }

        return {
          user: {
            id: data.user.id,
            email: data.user.email!,
            full_name: profile?.full_name || data.user.user_metadata?.full_name || email.split('@')[0],
            role,
            created_at: data.user.created_at,
          },
          token: data.session.access_token,
          expiresAt: new Date(Date.now() + (data.session.expires_in || 3600) * 1000).toISOString(),
        };
      } catch (err) {
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
  static async listConversations(projectId: string, agentId?: string): Promise<Conversation[]> {
    if (supabase) {
      try {
        let query = supabase.from('conversations').select('*').eq('project_id', projectId);
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
      .filter((c) => c.project_id === projectId && (!agentId || c.agent_id === agentId))
      .map((c) => ({
        ...c,
        message_count: memoryStore.messages.filter((m) => m.conversation_id === c.id).length,
      }));
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

  static async getOrCreateConversation(
    id: string | undefined,
    projectId: string,
    agentId: string,
    title = 'New Conversation'
  ): Promise<Conversation> {
    if (supabase) {
      try {
        if (id) {
          const { data: existing } = await supabase.from('conversations').select('*').eq('id', id).maybeSingle();
          if (existing) return existing;
        }
        const insertId = id || crypto.randomUUID();
        const { data: newConv, error } = await supabase
          .from('conversations')
          .insert({
            id: insertId,
            project_id: projectId,
            agent_id: agentId,
            title,
            metadata: {},
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
      if (existing) return existing;
    }
    const newConv: Conversation = {
      id: id || `conv_${crypto.randomBytes(6).toString('hex')}`,
      project_id: projectId,
      agent_id: agentId,
      title,
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
        const { data, error } = await supabase
          .from('usage_logs')
          .insert({
            project_id: entry.project_id,
            agent_id: entry.agent_id || null,
            api_key_id: entry.api_key_id || null,
            endpoint: entry.endpoint,
            model: entry.model,
            prompt_tokens: entry.prompt_tokens || 0,
            candidate_tokens: entry.candidate_tokens || 0,
            total_tokens: entry.total_tokens || 0,
            status_code: entry.status_code || 200,
            latency_ms: entry.latency_ms || 0,
            error_message: entry.error_message || null,
            ip_address: entry.ip_address || null,
          })
          .select()
          .single();
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

  static async getUsageStats(projectId?: string): Promise<{
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
        const { data: logs, error } = await query.order('created_at', { ascending: false });
        if (!error && logs) {
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
      } catch (err) {
        console.error('Supabase getUsageStats error, falling back to memoryStore:', err);
      }
    }

    const logs = projectId
      ? memoryStore.usageLogs.filter((l) => l.project_id === projectId)
      : memoryStore.usageLogs;

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
  static async listProviders(includeSecret = false): Promise<AIProvider[]> {
    if (supabase) {
      try {
        const { data, error } = await supabase.from('ai_providers').select('*').order('created_at', { ascending: false });
        if (!error && data) {
          const mapped = data.map((p) => mapRowToProvider(p, includeSecret));
          return includeSecret ? mapped : mapped.map(toPublicProvider);
        }
      } catch {
        // Table may not exist yet, fallback to memory
      }
    }
    const mapped = memoryStore.providers.map((p) => ({
      ...p,
      type: p.type || kindFromProtocol(p.protocol),
      hasApiKey: Boolean(p.apiKey),
      apiKey: includeSecret ? p.apiKey : undefined,
    }));
    return includeSecret ? mapped : mapped.map(toPublicProvider);
  }

  static async getProvider(id: string, includeSecret = false): Promise<AIProvider | null> {
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
    const found = memoryStore.providers.find((p) => p.id === id);
    if (!found) return null;
    const mapped: AIProvider = {
      ...found,
      type: found.type || kindFromProtocol(found.protocol),
      hasApiKey: Boolean(found.apiKey),
      apiKey: includeSecret ? found.apiKey : undefined,
    };
    return includeSecret ? mapped : toPublicProvider(mapped);
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

    if (supabase) {
      const { data: inserted, error } = await supabase
        .from('ai_providers')
        .insert(toDbProviderRow(newProvider, encryptedKey))
        .select()
        .single();
      if (error) {
        const msg = error.message || 'Failed to save provider';
        if (/relation|schema cache|does not exist|ai_providers/i.test(msg)) {
          throw new Error('ai_providers table is missing. Run supabase/migrations/20261004_provider_configuration.sql in the Supabase SQL editor, then retry.');
        }
        throw new Error(msg);
      }
      if (inserted) {
        memoryStore.providers.unshift(newProvider);
        return toPublicProvider(mapRowToProvider(inserted, false));
      }
    }

    if (isProduction()) {
      throw new Error('Failed to persist provider to database.');
    }

    memoryStore.providers.unshift(newProvider);
    return toPublicProvider(newProvider);
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

    if (supabase) {
      try {
        const patch = toDbProviderRow(merged, replaceKey ? encryptProviderSecret(incomingKey!) : '');
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
          return toPublicProvider(mapRowToProvider(updated, false));
        }
      } catch {
        // Fallback
      }
    }

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
        const { error } = await supabase.from('ai_providers').delete().eq('id', id);
        if (!error) {
          const idx = memoryStore.providers.findIndex((p) => p.id === id);
          if (idx !== -1) memoryStore.providers.splice(idx, 1);
          return true;
        }
      } catch {
        // Fallback
      }
    }

    const idx = memoryStore.providers.findIndex((p) => p.id === id);
    if (idx === -1) return false;
    memoryStore.providers.splice(idx, 1);
    return true;
  }
}
