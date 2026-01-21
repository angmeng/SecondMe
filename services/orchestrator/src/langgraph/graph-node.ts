/**
 * Graph Query Node - Knowledge Graph Context Retrieval
 * User Story 2: Retrieves relevant context from AutoMem for substantive messages
 */

import { WorkflowState } from './workflow.js';
import {
  getContactContext,
  getContactInfo,
  getPersonaForContact,
  getDefaultPersona,
  getPersonaById,
  getContactStyleProfile,
  type PersonaContext,
} from '../automem/recall.js';
import { personaCache } from '../redis/persona-cache.js';
import { getStyleProfileWithCache } from '../redis/style-cache.js';
import { retrieveContext, isSemanticRagEnabled } from '../retrieval/index.js';

// Default user ID (single-user MVP)
const DEFAULT_USER_ID = 'user-1';

/**
 * Graph query node - retrieves context from AutoMem
 * Only called for substantive messages that need context
 */
export async function graphQueryNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
  console.log(`[Graph Node] Retrieving context for ${state.contactId}...`);

  const startTime = Date.now();

  try {
    // Get contact info first to determine relationship type
    const contactInfo = await getContactInfo(state.contactId);

    if (!contactInfo) {
      console.log(`[Graph Node] Contact ${state.contactId} not found in graph, using defaults`);
      return {
        relationshipType: 'acquaintance',
        graphContext: { people: [], topics: [], events: [] },
        graphQueryLatency: Date.now() - startTime,
      };
    }

    // Get graph context (people, topics, events related to contact)
    const graphContext = await getContactContext(state.contactId);

    const latency = Date.now() - startTime;
    console.log(
      `[Graph Node] Context retrieved in ${latency}ms: ${graphContext.people.length} people, ${graphContext.topics.length} topics, ${graphContext.events.length} events`
    );

    return {
      contactInfo,
      relationshipType: contactInfo.relationshipType || 'acquaintance',
      graphContext,
      graphQueryLatency: latency,
    };
  } catch (error: any) {
    console.error('[Graph Node] Error retrieving context:', error);
    return {
      graphContext: { people: [], topics: [], events: [] },
      graphQueryLatency: Date.now() - startTime,
      error: error.message || 'Graph query failed',
    };
  }
}

/**
 * Persona retrieval node - gets persona based on relationship type
 * Checks Redis cache first, then falls back to AutoMem
 */
export async function personaNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
  console.log(`[Persona Node] Getting persona for relationship type: ${state.relationshipType || 'unknown'}...`);

  const relationshipType = state.relationshipType || 'acquaintance';

  try {
    // Check if contact has an assigned persona override
    const assignedPersonaId = state.contactInfo?.assignedPersona;

    if (assignedPersonaId) {
      // Check cache first for assigned persona
      const cached = await personaCache.get(assignedPersonaId);
      if (cached) {
        console.log(`[Persona Node] Found assigned persona ${assignedPersonaId} in cache`);
        return {
          persona: cached,
          personaCached: true,
        };
      }

      // Query AutoMem for assigned persona by ID
      const assignedPersona = await getPersonaById(assignedPersonaId);
      if (assignedPersona) {
        // Cache the assigned persona
        await personaCache.set(assignedPersonaId, assignedPersona);
        console.log(`[Persona Node] Cached assigned persona ${assignedPersonaId}`);
        return {
          persona: assignedPersona,
          personaCached: false,
        };
      }

      // Assigned persona not found - log warning and fall back
      console.warn(
        `[Persona Node] Assigned persona ${assignedPersonaId} not found, falling back to relationship-based`
      );
    }

    // Check cache for relationship-based persona
    const cacheKey = `relationship:${relationshipType}`;
    const cached = await personaCache.get(cacheKey);

    if (cached) {
      console.log(`[Persona Node] Found persona for ${relationshipType} in cache`);
      return {
        persona: cached,
        personaCached: true,
      };
    }

    // Query AutoMem for persona
    let persona = await getPersonaForContact(DEFAULT_USER_ID, relationshipType);

    if (!persona) {
      console.log(`[Persona Node] No persona found for ${relationshipType}, using default`);
      persona = await getDefaultPersona(DEFAULT_USER_ID);
    }

    if (persona) {
      // Cache the persona
      await personaCache.set(cacheKey, persona);
      console.log(`[Persona Node] Cached persona for ${relationshipType}`);
    } else {
      // Return a hardcoded fallback persona
      console.warn('[Persona Node] No personas found in graph, using hardcoded fallback');
      persona = {
        id: 'fallback',
        name: 'Default',
        styleGuide: 'Keep responses brief and natural. Match the energy of the conversation.',
        tone: 'casual',
        exampleMessages: [],
        applicableTo: ['acquaintance'],
      };
    }

    return {
      persona,
      personaCached: false,
    };
  } catch (error: any) {
    console.error('[Persona Node] Error getting persona:', error);

    // Return fallback persona on error
    return {
      persona: {
        id: 'fallback',
        name: 'Default',
        styleGuide: 'Keep responses brief and natural.',
        tone: 'casual',
        exampleMessages: [],
        applicableTo: ['acquaintance'],
      },
      personaCached: false,
      error: error.message || 'Persona retrieval failed',
    };
  }
}

/**
 * Combined graph + persona node for efficiency
 * Runs graph query and persona retrieval in parallel
 */
export async function graphAndPersonaNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
  console.log(`[Graph+Persona Node] Retrieving context and persona for ${state.contactId}...`);

  const startTime = Date.now();

  try {
    // Get contact info first (needed for persona selection)
    const contactInfo = await getContactInfo(state.contactId);

    // Determine relationship type:
    // 1. High-confidence signal from router (real-time detection) takes precedence for THIS request
    // 2. Fall back to stored relationship type from AutoMem
    // 3. Default to 'acquaintance' if nothing found
    let relationshipType = contactInfo?.relationshipType || 'acquaintance';

    // Check if we have a high-confidence signal from the router
    // This enables optimistic persona selection based on real-time detection
    if (state.relationshipSignal && state.relationshipSignal.confidence >= 0.9) {
      console.log(
        `[Graph+Persona Node] Using high-confidence signal: ${state.relationshipSignal.type} ` +
          `(${Math.round(state.relationshipSignal.confidence * 100)}%) instead of stored: ${relationshipType}`
      );
      relationshipType = state.relationshipSignal.type;
    }

    // Run graph query, persona retrieval, and style profile in parallel
    // Use semantic retrieval if enabled, otherwise fall back to legacy
    const [retrievalResult, personaResult, styleProfile] = await Promise.all([
      retrieveContext(state.content, state.contactId),
      getPersonaWithCache(relationshipType, contactInfo?.assignedPersona),
      getStyleProfileWithCache(state.contactId, () => getContactStyleProfile(state.contactId)),
    ]);

    const graphContext = retrievalResult.context;
    const latency = Date.now() - startTime;

    // Log retrieval method and stats
    const methodInfo = isSemanticRagEnabled()
      ? `method: ${retrievalResult.method}, cached: ${retrievalResult.stats?.embeddingCached ?? 'n/a'}`
      : 'method: legacy (semantic disabled)';

    const styleInfo = styleProfile ? `style: ${styleProfile.sampleCount} samples` : 'style: none';

    console.log(
      `[Graph+Persona Node] Retrieved in ${latency}ms (${methodInfo}): ` +
        `${graphContext.people.length} people, ${graphContext.topics.length} topics, ` +
        `${graphContext.events.length} events, persona: ${personaResult.persona?.name}, ${styleInfo}`
    );

    return {
      ...(contactInfo && { contactInfo }),
      relationshipType,
      graphContext,
      graphQueryLatency: latency,
      ...(personaResult.persona && { persona: personaResult.persona }),
      personaCached: personaResult.cached,
      ...(styleProfile && { styleProfile }),
    };
  } catch (error: any) {
    console.error('[Graph+Persona Node] Error:', error);
    return {
      graphContext: { people: [], topics: [], events: [] },
      graphQueryLatency: Date.now() - startTime,
      persona: {
        id: 'fallback',
        name: 'Default',
        styleGuide: 'Keep responses brief and natural.',
        tone: 'casual',
        exampleMessages: [],
        applicableTo: ['acquaintance'],
      },
      personaCached: false,
      error: error.message || 'Context retrieval failed',
    };
  }
}

/**
 * Helper to get persona with cache check
 * Prioritizes assigned persona over relationship-based selection
 */
async function getPersonaWithCache(
  relationshipType: string,
  assignedPersonaId?: string
): Promise<{ persona: PersonaContext | null; cached: boolean }> {
  // If contact has an assigned persona, use it
  if (assignedPersonaId) {
    // Check cache first for assigned persona
    const cached = await personaCache.get(assignedPersonaId);
    if (cached) {
      console.log(`[Persona Cache] Found assigned persona ${assignedPersonaId} in cache`);
      return { persona: cached, cached: true };
    }

    // Query AutoMem for assigned persona by ID
    const assignedPersona = await getPersonaById(assignedPersonaId);
    if (assignedPersona) {
      // Cache the assigned persona
      await personaCache.set(assignedPersonaId, assignedPersona);
      console.log(`[Persona Cache] Cached assigned persona ${assignedPersonaId}`);
      return { persona: assignedPersona, cached: false };
    }

    // Assigned persona not found in AutoMem - log warning and fall back to relationship-based
    console.warn(
      `[Persona Cache] Assigned persona ${assignedPersonaId} not found in DB, falling back to relationship-based selection`
    );
  }

  // Relationship-based persona selection
  const cacheKey = `relationship:${relationshipType}`;
  const cached = await personaCache.get(cacheKey);

  if (cached) {
    return { persona: cached, cached: true };
  }

  // Query AutoMem for relationship-based persona
  let persona = await getPersonaForContact(DEFAULT_USER_ID, relationshipType);

  if (!persona) {
    persona = await getDefaultPersona(DEFAULT_USER_ID);
  }

  // Cache if found
  if (persona) {
    await personaCache.set(cacheKey, persona);
  }

  return { persona: persona || null, cached: false };
}
