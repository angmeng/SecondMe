/**
 * Skills Management Page
 * Configure and manage AI skills/plugins
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import type { SkillInfo } from '@secondme/shared-types';
import SkillCard from '@/components/SkillCard';
import SkillConfigModal from '@/components/SkillConfigModal';
import { useToast } from '@/contexts/ToastContext';

export default function SkillsPage() {
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingSkillId, setLoadingSkillId] = useState<string | null>(null);
  const [configSkill, setConfigSkill] = useState<SkillInfo | null>(null);
  const { toast } = useToast();

  const fetchSkills = useCallback(async () => {
    try {
      const response = await fetch('/api/skills');
      const data = await response.json() as { success?: boolean; skills?: SkillInfo[]; error?: string };

      if (data.success && data.skills) {
        setSkills(data.skills);
      } else {
        toast({
          variant: 'error',
          title: 'Error',
          description: data.error || 'Failed to load skills',
        });
      }
    } catch (error) {
      console.error('Failed to fetch skills:', error);
      toast({
        variant: 'error',
        title: 'Error',
        description: 'Failed to load skills',
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchSkills();
  }, [fetchSkills]);

  const handleToggle = async (skillId: string, enabled: boolean) => {
    setLoadingSkillId(skillId);

    try {
      const response = await fetch(`/api/skills/${skillId}`, {
        method: enabled ? 'POST' : 'DELETE',
      });

      const data = await response.json() as { success?: boolean; error?: string };

      if (data.success) {
        // Update local state
        setSkills((prev) =>
          prev.map((s) =>
            s.manifest.id === skillId ? { ...s, enabled } : s
          )
        );

        toast({
          variant: 'success',
          title: enabled ? 'Skill Enabled' : 'Skill Disabled',
          description: `${skillId} has been ${enabled ? 'enabled' : 'disabled'}`,
        });
      } else {
        toast({
          variant: 'error',
          title: 'Error',
          description: data.error || 'Failed to update skill',
        });
      }
    } catch (error) {
      console.error('Failed to toggle skill:', error);
      toast({
        variant: 'error',
        title: 'Error',
        description: 'Failed to update skill',
      });
    } finally {
      setLoadingSkillId(null);
    }
  };

  const handleConfigure = (skill: SkillInfo) => {
    setConfigSkill(skill);
  };

  const handleSaveConfig = async (skillId: string, config: Record<string, unknown>) => {
    const response = await fetch(`/api/skills/${skillId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config }),
    });

    const data = await response.json() as { success?: boolean; config?: Record<string, unknown>; error?: string };

    if (data.success && data.config) {
      // Update local state
      setSkills((prev) =>
        prev.map((s) =>
          s.manifest.id === skillId ? { ...s, config: data.config! } : s
        )
      );

      toast({
        variant: 'success',
        title: 'Configuration Saved',
        description: `Settings for ${skillId} have been updated`,
      });
    } else {
      throw new Error(data.error || 'Failed to save configuration');
    }
  };

  const enabledCount = skills.filter((s) => s.enabled).length;
  const healthyCount = skills.filter((s) => s.enabled && s.health === 'healthy').length;

  return (
    <div className="mx-auto max-w-4xl p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Skills</h1>
        <p className="mt-1 text-slate-600 dark:text-slate-400">
          Configure AI skills that enhance your bot&apos;s capabilities
        </p>
      </div>

      {/* Info box */}
      <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
        <div className="flex items-start gap-3">
          <svg
            className="mt-0.5 h-5 w-5 text-blue-600 dark:text-blue-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div>
            <h3 className="font-medium text-blue-800 dark:text-blue-300">About Skills</h3>
            <p className="mt-1 text-sm text-blue-700 dark:text-blue-400">
              Skills provide context and capabilities to the AI. Each skill contributes different
              types of information to help generate better responses. Disable skills you don&apos;t
              need to reduce latency and improve performance.
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <div className="text-2xl font-bold text-slate-900 dark:text-white">{skills.length}</div>
          <div className="text-sm text-slate-500 dark:text-slate-400">Total Skills</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{enabledCount}</div>
          <div className="text-sm text-slate-500 dark:text-slate-400">Enabled</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">{healthyCount}</div>
          <div className="text-sm text-slate-500 dark:text-slate-400">Healthy</div>
        </div>
      </div>

      {/* Skills Grid */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-48 animate-pulse rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800"
            />
          ))}
        </div>
      ) : skills.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-800">
          <svg
            className="mx-auto h-12 w-12 text-slate-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
            />
          </svg>
          <h3 className="mt-4 text-lg font-medium text-slate-900 dark:text-white">No Skills Found</h3>
          <p className="mt-2 text-slate-500 dark:text-slate-400">
            Skills will appear here once the orchestrator is running.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {skills.map((skill) => (
            <SkillCard
              key={skill.manifest.id}
              skill={skill}
              onToggle={handleToggle}
              onConfigure={handleConfigure}
              isLoading={loadingSkillId === skill.manifest.id}
            />
          ))}
        </div>
      )}

      {/* Feature flag note */}
      <div className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
        <div className="flex items-start gap-3">
          <svg
            className="mt-0.5 h-5 w-5 text-amber-600 dark:text-amber-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <div>
            <h3 className="font-medium text-amber-800 dark:text-amber-300">Feature Flag Required</h3>
            <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
              To use the skill system, set <code className="rounded bg-amber-200/50 px-1 dark:bg-amber-700/30">USE_SKILL_SYSTEM=true</code> in your environment variables. Without this flag, the legacy context retrieval system will be used.
            </p>
          </div>
        </div>
      </div>

      {/* Config Modal */}
      {configSkill && (
        <SkillConfigModal
          skill={configSkill}
          isOpen={!!configSkill}
          onClose={() => setConfigSkill(null)}
          onSave={handleSaveConfig}
        />
      )}
    </div>
  );
}
