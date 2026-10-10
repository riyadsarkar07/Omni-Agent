'use client';

import React from 'react';
import { Project, Agent } from '@/lib/types';
import { FolderGit2 } from 'lucide-react';

interface UserProjectsViewProps {
  projects: Project[];
  agents: Agent[];
  activeProject: Project | null;
  onSelectProject: (project: Project) => void;
}

export const UserProjectsView: React.FC<UserProjectsViewProps> = ({
  projects,
  agents,
  activeProject,
  onSelectProject,
}) => {
  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h2 className="text-2xl font-extrabold text-white tracking-tight">Projects</h2>
        <p className="text-sm text-zinc-400 mt-1">
          Platform workspaces assigned to your account. Project create/delete is an Admin Console action.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {projects.map((project) => {
          const count = agents.filter((a) => a.project_id === project.id).length;
          const active = activeProject?.id === project.id;
          return (
            <button
              key={project.id}
              type="button"
              onClick={() => onSelectProject(project)}
              className={`text-left glass-card rounded-2xl border p-5 space-y-2 cursor-pointer ${
                active ? 'border-cyan-500/40 bg-cyan-500/5' : 'border-white/5'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <FolderGit2 className="w-4 h-4 text-cyan-400" />
                <div className="font-bold text-sm text-white">{project.name}</div>
              </div>
              <p className="text-xs text-zinc-400">{project.description}</p>
              <div className="text-[11px] text-zinc-500">{count} agents</div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
