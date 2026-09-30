'use client';

import React, { useState } from 'react';
import { Project, Agent, ApiKey } from '@/lib/types';
import {
  FolderGit2,
  Plus,
  Edit2,
  Trash2,
  Bot,
  KeyRound,
  Activity,
  Layers,
  Check,
  X,
} from 'lucide-react';

interface ProjectsViewProps {
  projects: Project[];
  agents: Agent[];
  apiKeys: ApiKey[];
  activeProject: Project | null;
  onSelectProject: (p: Project) => void;
  onRefresh: () => void;
}

export const ProjectsView: React.FC<ProjectsViewProps> = ({
  projects,
  agents,
  apiKeys,
  activeProject,
  onSelectProject,
  onRefresh,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [rateLimitRpm, setRateLimitRpm] = useState(60);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpenCreate = () => {
    setEditingProject(null);
    setName('');
    setSlug('');
    setDescription('');
    setRateLimitRpm(60);
    setError(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (project: Project) => {
    setEditingProject(project);
    setName(project.name);
    setSlug(project.slug);
    setDescription(project.description);
    setRateLimitRpm(project.rate_limit_rpm);
    setError(null);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Project name is required');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const payload = {
        name,
        slug: slug.trim() || name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        description,
        rate_limit_rpm: rateLimitRpm,
      };

      if (editingProject) {
        const res = await fetch(`/api/v1/projects/${editingProject.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'x-internal-admin': 'true' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.message || data.error || 'Failed to update project');
        }
      } else {
        const res = await fetch('/api/v1/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-internal-admin': 'true' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.message || data.error || 'Failed to create project');
        }
      }

      setIsModalOpen(false);
      onRefresh();
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (projects.length <= 1) {
      alert('You must keep at least one active project.');
      return;
    }
    if (!confirm('Are you sure you want to delete this project? Its agents and keys will also be removed.')) {
      return;
    }
    try {
      await fetch(`/api/v1/projects/${id}`, {
        method: 'DELETE',
        headers: { 'x-internal-admin': 'true' },
      });
      onRefresh();
    } catch (err: unknown) {
      alert((err as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-white">Multi-Project Workspaces</h2>
          <p className="text-sm text-zinc-400">
            Isolate agents, API keys, conversations, and usage limits across different applications.
          </p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="px-4 py-2 rounded-xl bg-white text-zinc-950 font-bold text-sm flex items-center gap-2 transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Create New Project
        </button>
      </div>

      {/* Projects Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {projects.map((project) => {
          const projectAgents = agents.filter((a) => a.project_id === project.id);
          const projectKeys = apiKeys.filter((k) => k.project_id === project.id);
          const isCurrent = activeProject?.id === project.id;

          return (
            <div
              key={project.id}
              className={`glass-card rounded-2xl p-6 border border-white/5 flex flex-col justify-between space-y-4 transition-all ${
                isCurrent
                  ? 'border-white/20 bg-zinc-900/50'
                  : 'bg-zinc-950 hover:bg-zinc-900/50'
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                      <FolderGit2 className="w-5 h-5 text-cyan-400" />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-white flex items-center gap-2">
                        {project.name}
                        {isCurrent && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                            Active
                          </span>
                        )}
                      </h3>
                      <div className="text-[11px] font-mono text-slate-400">/{project.slug}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEdit(project)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
                      title="Edit Project"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(project.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                      title="Delete Project"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">
                  {project.description || 'Independent project workspace.'}
                </p>

                {/* Sub-resource counts */}
                <div className="grid grid-cols-3 gap-2 text-center text-xs pt-4 border-t border-white/5">
                  <div className="p-3 rounded-xl bg-zinc-900 border border-white/5">
                    <div className="font-bold text-white text-sm">{projectAgents.length}</div>
                    <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-1">
                      Agents
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-zinc-900 border border-white/5">
                    <div className="font-bold text-white text-sm">{projectKeys.length}</div>
                    <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-1">
                      Keys
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-zinc-900 border border-white/5">
                    <div className="font-bold text-white text-sm">{project.rate_limit_rpm}</div>
                    <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-1">
                      RPM Cap
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                {!isCurrent ? (
                  <button
                    onClick={() => onSelectProject(project)}
                    className="w-full py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-semibold transition-colors cursor-pointer"
                  >
                    Switch to this Project
                  </button>
                ) : (
                  <div className="w-full py-2 text-center text-sm text-zinc-400 font-semibold bg-zinc-900 rounded-xl border border-white/5">
                    Selected Workspace
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-zinc-950 border border-white/10 rounded-3xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <h3 className="font-bold text-lg text-white flex items-center gap-2">
                {editingProject ? 'Edit Project' : 'Create Project'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              {error && (
                <div className="p-3 rounded-xl bg-rose-950/20 border border-rose-900 text-rose-400 text-sm">
                  {error}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Project Name *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. My Dating App, Support Portal"
                  className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-white/20"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Project Slug</label>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase())}
                  placeholder="e.g. dating-app"
                  className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-white/20 font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Description</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief description of application scope"
                  className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-white/20"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Default Rate Limit (RPM)</label>
                <input
                  type="number"
                  min="10"
                  max="1000"
                  value={rateLimitRpm}
                  onChange={(e) => setRateLimitRpm(parseInt(e.target.value) || 60)}
                  className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-white/20"
                />
              </div>

              <div className="pt-3 border-t border-white/5 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-sm font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-white text-zinc-950 text-sm font-bold transition-all disabled:opacity-40 cursor-pointer"
                >
                  {isSubmitting ? 'Saving...' : editingProject ? 'Save Changes' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
