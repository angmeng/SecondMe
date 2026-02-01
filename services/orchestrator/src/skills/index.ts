/**
 * Skills Module
 * Central exports for the skill system
 */

// Types
export type { Skill, SkillDependencies, SkillLogger, RegisteredSkill } from './types.js';

// Base class
export { AbstractSkill } from './base-skill.js';

// Registry
export { SkillRegistry, skillRegistry } from './registry.js';

// Loader (Task 2.1.4)
export { loadSkillsFromDirectory, loadSkillFromDirectory, reloadSkill } from './loader.js';
export type { SkillLoadResult, SkillLoaderConfig } from './loader.js';

// Validator (Task 2.1.4)
export { validateSkillManifest, hasPermission, getPermissions } from './validator.js';
export type { ValidationResult } from './validator.js';

// Security (Task 2.1.4)
export { createRestrictedRedis, RestrictedRedis } from './security.js';

// Built-in skills (will be added as they're implemented)
export { KnowledgeGraphSkill } from './built-in/knowledge-graph/index.js';
export { PersonaSkill } from './built-in/persona/index.js';
export { StyleProfileSkill } from './built-in/style-profile/index.js';
export { ConversationHistorySkill } from './built-in/conversation-history/index.js';

// Import skillRegistry for use in registerBuiltInSkills
import { skillRegistry as registry } from './registry.js';
import { loadSkillsFromDirectory } from './loader.js';
import type { SkillLogger } from './types.js';

/**
 * Register all built-in skills
 * Called during orchestrator initialization
 */
export async function registerBuiltInSkills(): Promise<void> {
  const { KnowledgeGraphSkill } = await import('./built-in/knowledge-graph/index.js');
  const { PersonaSkill } = await import('./built-in/persona/index.js');
  const { StyleProfileSkill } = await import('./built-in/style-profile/index.js');
  const { ConversationHistorySkill } = await import('./built-in/conversation-history/index.js');

  await registry.register(new KnowledgeGraphSkill());
  await registry.register(new PersonaSkill());
  await registry.register(new StyleProfileSkill());
  await registry.register(new ConversationHistorySkill());
}

/**
 * Register external skills from a directory
 * Task 2.1.4: External Skill Loading
 *
 * @param skillsDir - Path to the directory containing external skills
 * @param logger - Logger instance for skill operations
 * @returns Number of successfully loaded skills
 */
export async function registerExternalSkills(
  skillsDir: string,
  logger: SkillLogger
): Promise<number> {
  const enabled = process.env['LOAD_EXTERNAL_SKILLS'] === 'true';

  if (!enabled) {
    logger.info('External skill loading is disabled (set LOAD_EXTERNAL_SKILLS=true to enable)');
    return 0;
  }

  const results = await loadSkillsFromDirectory({
    skillsDir,
    enabled,
    logger,
  });

  let successCount = 0;

  for (const result of results) {
    if (result.success && result.skill) {
      try {
        await registry.register(result.skill);
        successCount++;
      } catch (error) {
        logger.error(`Failed to register external skill: ${result.skillId}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } else if (!result.success) {
      logger.warn(`Skipped invalid skill: ${result.skillId}`, {
        error: result.error,
      });
    }
  }

  return successCount;
}
