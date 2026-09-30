'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useCallback } from 'react';
import { Project, Agent, ApiKey, UsageLog, User } from '@/lib/types';
import { Sidebar, DashboardTab } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { AuthModal } from '@/components/dashboard/AuthModal';
import { OverviewView } from '@/components/dashboard/OverviewView';
import { ProjectsView } from '@/components/dashboard/ProjectsView';
import { AgentsView } from '@/components/dashboard/AgentsView';
import { PlaygroundView } from '@/components/dashboard/PlaygroundView';
import { ApiKeysView } from '@/components/dashboard/ApiKeysView';
import { ConversationsView } from '@/components/dashboard/ConversationsView';
import { AnalyticsView } from '@/components/dashboard/AnalyticsView';
import { DocsView } from '@/components/dashboard/DocsView';
import { SettingsView } from '@/components/dashboard/SettingsView';
import { ProvidersView } from '@/components/dashboard/ProvidersView';

export default function DashboardPage() {
  const [currentTab, setCurrentTab] = useState<DashboardTab>('overview');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [isSupabaseConnected, setIsSupabaseConnected] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);

  const [usageSummary, setUsageSummary] = useState<{
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    totalTokens: number;
    promptTokens: number;
    candidateTokens: number;
    avgLatencyMs: number;
    recentLogs: UsageLog[];
  }>({
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    totalTokens: 0,
    promptTokens: 0,
    candidateTokens: 0,
    avgLatencyMs: 0,
    recentLogs: [],
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshData = useCallback(async () => {
    try {
      const [projRes, agentsRes, keysRes, usageRes] = await Promise.all([
        fetch('/api/v1/projects'),
        fetch('/api/v1/agents'),
        fetch('/api/v1/api-keys'),
        fetch('/api/v1/usage'),
      ]);

      if (projRes.ok) {
        const pData = await projRes.json();
        setProjects(pData.projects || []);
      }
      if (agentsRes.ok) {
        const aData = await agentsRes.json();
        setAgents(aData.agents || []);
      }
      if (keysRes.ok) {
        const kData = await keysRes.json();
        setApiKeys(kData.apiKeys || []);
      }
      if (usageRes.ok) {
        const uData = await usageRes.json();
        setUsageSummary({
          totalRequests: uData.summary?.totalRequests || 0,
          successfulRequests: uData.summary?.successfulRequests || 0,
          failedRequests: uData.summary?.failedRequests || 0,
          totalTokens: uData.summary?.totalTokens || 0,
          promptTokens: uData.summary?.promptTokens || 0,
          candidateTokens: uData.summary?.candidateTokens || 0,
          avgLatencyMs: uData.summary?.avgLatencyMs || 0,
          recentLogs: uData.recentLogs || [],
        });
      }
    } catch {
      //
    }
  }, []);

  useEffect(() => {
    let ignore = false;

    async function initialLoad() {
      try {
        const [healthRes, projRes, agentsRes, keysRes, usageRes, authRes] = await Promise.all([
          fetch('/api/v1/health'),
          fetch('/api/v1/projects'),
          fetch('/api/v1/agents'),
          fetch('/api/v1/api-keys'),
          fetch('/api/v1/usage'),
          fetch('/api/auth/me'),
        ]);

        if (ignore) return;

        if (authRes.ok) {
          const authData = await authRes.json();
          if (authData.authenticated && authData.user) {
            setCurrentUser(authData.user);
          }
        }

        if (healthRes.ok) {
          const health = await healthRes.json();
          setIsSupabaseConnected(health.database?.adapter === 'supabase-postgresql');
        }

        if (projRes.ok) {
          const pData = await projRes.json();
          const pList = pData.projects || [];
          setProjects(pList);
          setActiveProject((prev) => prev || pList[0] || null);
        }

        if (agentsRes.ok) {
          const aData = await agentsRes.json();
          setAgents(aData.agents || []);
        }

        if (keysRes.ok) {
          const kData = await keysRes.json();
          setApiKeys(kData.apiKeys || []);
        }

        if (usageRes.ok) {
          const uData = await usageRes.json();
          setUsageSummary({
            totalRequests: uData.summary?.totalRequests || 0,
            successfulRequests: uData.summary?.successfulRequests || 0,
            failedRequests: uData.summary?.failedRequests || 0,
            totalTokens: uData.summary?.totalTokens || 0,
            promptTokens: uData.summary?.promptTokens || 0,
            candidateTokens: uData.summary?.candidateTokens || 0,
            avgLatencyMs: uData.summary?.avgLatencyMs || 0,
            recentLogs: uData.recentLogs || [],
          });
        }
      } catch {
        //
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    initialLoad();

    return () => {
      ignore = true;
    };
  }, []);

  const handleSelectProject = (project: Project) => {
    setActiveProject(project);
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 font-sans text-slate-100">
      {/* Sidebar Navigation */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={(tab) => setCurrentTab(tab)}
        agentCount={agents.length}
        projectCount={projects.length}
        apiKeyCount={apiKeys.length}
        isOpen={isMobileSidebarOpen}
        onClose={() => setIsMobileSidebarOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header
          projects={projects}
          activeProject={activeProject}
          onSelectProject={handleSelectProject}
          onOpenPlayground={() => setCurrentTab('playground')}
          isSupabaseConnected={isSupabaseConnected}
          currentUser={currentUser}
          onOpenAuthModal={() => setIsAuthModalOpen(true)}
          onMenuToggle={() => setIsMobileSidebarOpen(true)}
        />

        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          {isLoading ? (
            <div className="h-full flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 rounded-full border-2 border-cyan-500 border-t-transparent animate-spin" />
                <span className="text-xs text-slate-400 font-medium">
                  Connecting to OmniAgent Engine...
                </span>
              </div>
            </div>
          ) : (
            <>
              {currentTab === 'overview' && (
                <OverviewView
                  projects={projects}
                  agents={agents}
                  apiKeys={apiKeys}
                  usageSummary={usageSummary}
                  onNavigate={(tab) => setCurrentTab(tab)}
                  onOpenCreateAgent={() => setCurrentTab('agents')}
                  onOpenCreateKey={() => setCurrentTab('api-keys')}
                />
              )}

              {currentTab === 'projects' && (
                <ProjectsView
                  projects={projects}
                  agents={agents}
                  apiKeys={apiKeys}
                  activeProject={activeProject}
                  onSelectProject={handleSelectProject}
                  onRefresh={refreshData}
                />
              )}

              {currentTab === 'agents' && (
                <AgentsView
                  agents={agents}
                  projects={projects}
                  activeProject={activeProject}
                  onRefresh={refreshData}
                  onTestInPlayground={(_agentId) => {
                    setCurrentTab('playground');
                  }}
                />
              )}

              {currentTab === 'playground' && (
                <PlaygroundView
                  agents={agents}
                  activeProject={activeProject}
                  onRefreshAgents={refreshData}
                />
              )}

              {currentTab === 'api-keys' && (
                <ApiKeysView
                  apiKeys={apiKeys}
                  projects={projects}
                  activeProject={activeProject}
                  onRefresh={refreshData}
                />
              )}

              {currentTab === 'conversations' && (
                <ConversationsView activeProject={activeProject} agents={agents} />
              )}

              {currentTab === 'analytics' && (
                <AnalyticsView usageSummary={usageSummary} activeProject={activeProject} />
              )}

              {currentTab === 'docs' && <DocsView />}

              {currentTab === 'settings' && (
                <SettingsView isSupabaseConnected={isSupabaseConnected} />
              )}

              {currentTab === 'providers' && (
                <ProvidersView />
              )}
            </>
          )}
        </main>
      </div>

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        currentUser={currentUser}
        onLoginSuccess={(user) => {
          setCurrentUser(user);
          refreshData();
        }}
        onLogoutSuccess={() => {
          setCurrentUser(null);
          refreshData();
        }}
      />
    </div>
  );
}
