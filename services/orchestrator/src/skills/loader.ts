/**
 * Skill Loader
 * Dynamically loads external skills from a directory
 * Task 2.1.4: External Skill Loading
 */

import { readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Skill, SkillLogger } from './types.js';
import { validateSkillManifest } from './validator.js';
import type { SkillManifest } from '@secondme/shared-types';

/**
 * Skill loading result
 */
export interface SkillLoadResult {
  skillId: string;
  success: boolean;
  skill?: Skill;
  error?: string;
}

/**
 * Skill loader configuration
 */
export interface SkillLoaderConfig {
  /** Directory containing external skills */
  skillsDir: string;
  /** Whether to allow external skills at all */
  enabled: boolean;
  /** Logger instance */
  logger: SkillLogger;
}

/**
 * Load a single skill from a directory
 * Expects the directory to contain an index.js/ts with a default export
 */
export async function loadSkillFromDirectory(
  skillDir: string,
  logger: SkillLogger
): Promise<SkillLoadResult> {
  const skillPath = resolve(skillDir);
  const skillId = skillDir.split('/').pop() || 'unknown';

  try {
    // Check if directory exists
    const stats = await stat(skillPath);
    if (!stats.isDirectory()) {
      return { skillId, success: false, error: `Not a directory: ${skillPath}` };
    }

    // Try to load the skill module
    const indexPath = join(skillPath, 'index.js');
    const indexStats = await stat(indexPath).catch(() => null);
    if (!indexStats) {
      return { skillId, success: false, error: `No index.js found in ${skillPath}` };
    }

    // Dynamic import of the skill module
    const module = (await import(indexPath)) as {
      default?: new () => Skill;
      manifest?: SkillManifest;
    };

    // Check for default export (skill class constructor)
    if (!module.default || typeof module.default !== 'function') {
      return { skillId, success: false, error: 'Module does not export a default skill class' };
    }

    // Instantiate the skill
    const skill = new module.default();

    // Validate the manifest
    const validation = validateSkillManifest(skill.manifest);
    if (!validation.valid) {
      return {
        skillId,
        success: false,
        error: `Invalid manifest: ${validation.errors.join(', ')}`,
      };
    }

    logger.info(`Loaded external skill: ${skill.manifest.id}`, { path: skillPath });

    return {
      skillId: skill.manifest.id,
      success: true,
      skill,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to load skill from ${skillDir}`, { error: message });
    return { skillId, success: false, error: message };
  }
}

/**
 * Load all skills from a directory
 * Each subdirectory is treated as a skill
 */
export async function loadSkillsFromDirectory(
  config: SkillLoaderConfig
): Promise<SkillLoadResult[]> {
  const results: SkillLoadResult[] = [];

  if (!config.enabled) {
    config.logger.info('External skill loading is disabled');
    return results;
  }

  const skillsDir = resolve(config.skillsDir);

  try {
    // Check if skills directory exists
    const stats = await stat(skillsDir).catch(() => null);
    if (!stats || !stats.isDirectory()) {
      config.logger.info(`Skills directory does not exist: ${skillsDir}`);
      return results;
    }

    // Read directory contents
    const entries = await readdir(skillsDir, { withFileTypes: true });

    // Load each subdirectory as a skill
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.')) continue; // Skip hidden directories

      const skillDir = join(skillsDir, entry.name);
      const result = await loadSkillFromDirectory(skillDir, config.logger);
      results.push(result);
    }

    const successful = results.filter((r) => r.success).length;
    config.logger.info(`Loaded ${successful}/${results.length} external skills`, {
      dir: skillsDir,
    });
  } catch (error) {
    config.logger.error('Failed to scan skills directory', {
      error: error instanceof Error ? error.message : String(error),
      dir: skillsDir,
    });
  }

  return results;
}

/**
 * Hot-reload a skill by unregistering and re-loading
 * Note: ESM modules are cached by Node.js. For true hot-reload,
 * the skill would need to export a factory function.
 */
export async function reloadSkill(
  skillDir: string,
  logger: SkillLogger
): Promise<SkillLoadResult> {
  logger.info(`Reloading skill from ${skillDir}`);

  return loadSkillFromDirectory(skillDir, logger);
}
