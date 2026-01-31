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

// Built-in skills (will be added as they're implemented)
export { KnowledgeGraphSkill } from './built-in/knowledge-graph/index.js';
export { PersonaSkill } from './built-in/persona/index.js';
export { StyleProfileSkill } from './built-in/style-profile/index.js';
export { ConversationHistorySkill } from './built-in/conversation-history/index.js';

// Import skillRegistry for use in registerBuiltInSkills
import { skillRegistry as registry } from './registry.js';

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
