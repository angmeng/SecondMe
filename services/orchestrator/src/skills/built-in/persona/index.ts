/**
 * Persona Skill
 * Retrieves persona style guide based on relationship type or assigned persona
 */

import type {
  SkillManifest,
  SkillExecutionContext,
  SkillExecutionResult,
  SkillHealthStatus,
} from '@secondme/shared-types';
import { AbstractSkill } from '../../base-skill.js';
import { personaManifest } from './manifest.js';
import { personaCache } from '../../../redis/persona-cache.js';
import {
  getPersonaForContact,
  getDefaultPersona,
  getPersonaById,
  getContactInfo,
  type PersonaContext,
} from '../../../automem/recall.js';

// Default user ID (single-user MVP)
const DEFAULT_USER_ID = 'user-1';

/**
 * Persona Skill - retrieves persona based on relationship type
 */
export class PersonaSkill extends AbstractSkill {
  readonly manifest: SkillManifest = personaManifest;

  /**
   * Execute persona retrieval
   */
  async execute(context: SkillExecutionContext): Promise<SkillExecutionResult> {
    this.ensureActivated();
    const startTime = Date.now();

    // Get config values
    const cacheTTL = this.getConfig(context, 'cacheTTL', 1800);
    const useRelationshipFallback = this.getConfig(context, 'useRelationshipFallback', true);
    const defaultTone = this.getConfig(context, 'defaultTone', 'casual');

    try {
      // Get contact info to check for assigned persona
      const contactInfo = await getContactInfo(context.contactId);
      const assignedPersonaId = contactInfo?.assignedPersona;
      const relationshipType = context.relationshipType || contactInfo?.relationshipType || 'acquaintance';

      let persona: PersonaContext | null = null;
      let cached = false;

      // Try assigned persona first
      if (assignedPersonaId) {
        // Check cache first
        const cachedAssigned = await personaCache.get(assignedPersonaId);
        if (cachedAssigned) {
          persona = cachedAssigned;
          cached = true;
          this.logger?.debug(`Found assigned persona ${assignedPersonaId} in cache`);
        } else {
          // Fetch from AutoMem
          persona = await getPersonaById(assignedPersonaId);
          if (persona) {
            await personaCache.set(assignedPersonaId, persona, cacheTTL);
            this.logger?.debug(`Cached assigned persona ${assignedPersonaId}`);
          } else if (useRelationshipFallback) {
            this.logger?.warn(`Assigned persona ${assignedPersonaId} not found, falling back to relationship-based`);
          }
        }
      }

      // Fall back to relationship-based persona
      if (!persona && useRelationshipFallback) {
        const cacheKey = `relationship:${relationshipType}`;
        const cachedRelationship = await personaCache.get(cacheKey);

        if (cachedRelationship) {
          persona = cachedRelationship;
          cached = true;
          this.logger?.debug(`Found persona for ${relationshipType} in cache`);
        } else {
          // Fetch from AutoMem
          persona = await getPersonaForContact(DEFAULT_USER_ID, relationshipType);

          if (!persona) {
            persona = await getDefaultPersona(DEFAULT_USER_ID);
          }

          if (persona) {
            await personaCache.set(cacheKey, persona, cacheTTL);
            this.logger?.debug(`Cached persona for ${relationshipType}`);
          }
        }
      }

      // Use hardcoded fallback if nothing found
      if (!persona) {
        this.logger?.warn('No persona found, using hardcoded fallback');
        persona = {
          id: 'fallback',
          name: 'Default',
          styleGuide: 'Keep responses brief and natural. Match the energy of the conversation.',
          tone: defaultTone,
          exampleMessages: [],
          applicableTo: ['acquaintance'],
        };
      }

      // Format context for prompt
      const contextParts: string[] = [];

      contextParts.push(`**Persona: ${persona.name}**`);
      contextParts.push(`Tone: ${persona.tone}`);
      contextParts.push(`\nStyle Guide:\n${persona.styleGuide}`);

      if (persona.exampleMessages.length > 0) {
        const examples = persona.exampleMessages.slice(0, 3).map(m => `- "${m}"`).join('\n');
        contextParts.push(`\nExample messages:\n${examples}`);
      }

      this.logger?.debug('Persona retrieval completed', {
        personaId: persona.id,
        personaName: persona.name,
        cached,
        relationshipType,
      });

      return this.buildResult(startTime, {
        context: contextParts.join('\n'),
        data: {
          persona,
          personaCached: cached,
        },
        cached,
        itemCount: 1,
      });
    } catch (error) {
      this.logger?.error('Persona retrieval failed', {
        error: error instanceof Error ? error.message : String(error),
        contactId: context.contactId,
      });

      // Return fallback persona on error
      const fallbackPersona: PersonaContext = {
        id: 'fallback',
        name: 'Default',
        styleGuide: 'Keep responses brief and natural.',
        tone: defaultTone,
        exampleMessages: [],
        applicableTo: ['acquaintance'],
      };

      return this.buildResult(startTime, {
        context: `**Persona: Default**\nTone: ${defaultTone}\n\nStyle Guide:\nKeep responses brief and natural.`,
        data: {
          persona: fallbackPersona,
          personaCached: false,
        },
        cached: false,
        itemCount: 1,
      });
    }
  }

  /**
   * Health check
   */
  override async healthCheck(): Promise<SkillHealthStatus> {
    return this.activated ? 'healthy' : 'unhealthy';
  }
}
