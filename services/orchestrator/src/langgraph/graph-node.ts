/**
 * Graph Query Node - Knowledge Graph Context Retrieval
 * User Story 2: Retrieves relevant context from FalkorDB for substantive messages
 */

import { WorkflowState } from './workflow.js';
import {
  getContactContext,
  getContactInfo,
  getPersonaForContact,
  getDefaultPersona,
  PersonaContext,
} from '../falkordb/queries.js';
import { personaCache } from '../redis/persona-cache.js';

// Default user ID (single-user MVP)
const DEFAULT_USER_ID = 'user-1';

/**
 * Graph query node - retrieves context from FalkorDB
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
 * Checks Redis cache first, then falls back to FalkorDB
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

      // Query FalkorDB for assigned persona (would need to implement getPersonaById)
      // For now, fall through to relationship-based persona
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

    // Query FalkorDB for persona
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
    const relationshipType = contactInfo?.relationshipType || 'acquaintance';

    // Run graph query and persona retrieval in parallel
    const [graphContext, personaResult] = await Promise.all([
      getContactContext(state.contactId),
      getPersonaWithCache(relationshipType, contactInfo?.assignedPersona),
    ]);

    const latency = Date.now() - startTime;

    console.log(
      `[Graph+Persona Node] Retrieved in ${latency}ms: ${graphContext.people.length} people, ${graphContext.topics.length} topics, persona: ${personaResult.persona?.name}`
    );

    return {
      ...(contactInfo && { contactInfo }),
      relationshipType,
      graphContext,
      graphQueryLatency: latency,
      ...(personaResult.persona && { persona: personaResult.persona }),
      personaCached: personaResult.cached,
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
 */
async function getPersonaWithCache(
  relationshipType: string,
  assignedPersonaId?: string
): Promise<{ persona: PersonaContext | null; cached: boolean }> {
  // Check cache first
  const cacheKey = assignedPersonaId || `relationship:${relationshipType}`;
  const cached = await personaCache.get(cacheKey);

  if (cached) {
    return { persona: cached, cached: true };
  }

  // Query FalkorDB
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
