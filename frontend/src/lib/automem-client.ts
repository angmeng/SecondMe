/**
 * AutoMem Client for Frontend API Routes
 * Provides typed access to AutoMem memory operations
 */

// AutoMem API configuration
const AUTOMEM_API_URL = process.env['AUTOMEM_API_URL'] || 'http://automem:8001';
const AUTOMEM_API_KEY = process.env['AUTOMEM_API_KEY'];

/**
 * Memory types supported by AutoMem
 */
export type MemoryType =
  | 'Context'
  | 'Style'
  | 'Preference'
  | 'Pattern'
  | 'Insight'
  | 'Decision'
  | 'Habit';

/**
 * Store memory request
 */
export interface StoreMemoryRequest {
  content: string;
  type: MemoryType;
  tags: string[];
  importance?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Store memory response
 */
export interface StoreMemoryResponse {
  id: string;
  success: boolean;
}

/**
 * Recall request
 */
export interface RecallRequest {
  query?: string;
  tags?: string[];
  context_types?: MemoryType[];
  limit?: number;
}

/**
 * Memory in recall response
 */
export interface RecalledMemory {
  id: string;
  content: string;
  type: MemoryType;
  tags: string[];
  importance: number;
  relevance_score: number;
  created_at: string;
  metadata?: Record<string, unknown>;
}

/**
 * Recall response
 */
export interface RecallResponse {
  memories: RecalledMemory[];
  total: number;
}

/**
 * Delete memory response
 */
export interface DeleteMemoryResponse {
  success: boolean;
  deleted: number;
}

/**
 * Persona data structure
 */
export interface Persona {
  id: string;
  name: string;
  styleGuide: string;
  tone: string;
  exampleMessages: string[];
  applicableTo: string[];
  createdAt?: number;
  updatedAt?: number;
}

/**
 * Contact metadata structure
 */
export interface ContactMetadata {
  id: string;
  name?: string;
  phoneNumber?: string;
  relationshipType?: string;
  relationshipConfidence?: number;
  relationshipSource?: string;
  botEnabled?: boolean;
  assignedPersona?: string;
  assignedPersonaName?: string;
  lastInteraction?: number;
}

/**
 * Get headers for AutoMem API requests
 */
function getHeaders(): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  if (AUTOMEM_API_KEY) {
    headers['Authorization'] = `Bearer ${AUTOMEM_API_KEY}`;
  }
  return headers;
}

/**
 * Store a memory in AutoMem
 */
export async function storeMemory(request: StoreMemoryRequest): Promise<StoreMemoryResponse> {
  const response = await fetch(`${AUTOMEM_API_URL}/memory`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`AutoMem store failed: ${error}`);
  }

  return response.json();
}

/**
 * Recall memories from AutoMem
 */
export async function recallMemories(request: RecallRequest): Promise<RecallResponse> {
  const response = await fetch(`${AUTOMEM_API_URL}/recall`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`AutoMem recall failed: ${error}`);
  }

  return response.json();
}

/**
 * Delete memories by tags
 */
export async function deleteMemoriesByTags(tags: string[]): Promise<DeleteMemoryResponse> {
  const response = await fetch(`${AUTOMEM_API_URL}/memory`, {
    method: 'DELETE',
    headers: getHeaders(),
    body: JSON.stringify({ tags }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`AutoMem delete failed: ${error}`);
  }

  return response.json();
}

/**
 * Check AutoMem health
 */
export async function checkHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${AUTOMEM_API_URL}/health`, {
      method: 'GET',
      headers: getHeaders(),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// ============================================================================
// Persona Operations (stored as Style memories)
// ============================================================================

const DEFAULT_USER_ID = 'user-1';

/**
 * Get all personas for the user
 */
export async function getPersonas(): Promise<Persona[]> {
  const response = await recallMemories({
    tags: [`user:${DEFAULT_USER_ID}`, 'entity:persona'],
    context_types: ['Style'],
    limit: 100,
  });

  return response.memories.map((memory) => {
    const content = JSON.parse(memory.content) as Persona;
    return {
      ...content,
      id: memory.metadata?.['personaId'] as string || content.id,
    };
  });
}

/**
 * Get a single persona by ID
 */
export async function getPersonaById(personaId: string): Promise<Persona | null> {
  const response = await recallMemories({
    tags: [`persona:${personaId}`],
    context_types: ['Style'],
    limit: 1,
  });

  const memory = response.memories[0];
  if (!memory) {
    return null;
  }

  const content = JSON.parse(memory.content) as Persona;
  return {
    ...content,
    id: (memory.metadata?.['personaId'] as string) || content.id,
  };
}

/**
 * Create a new persona
 */
export async function createPersona(persona: Omit<Persona, 'id' | 'createdAt'>): Promise<string> {
  const personaId = `persona-${Date.now()}`;
  const now = Date.now();

  const personaData: Persona = {
    ...persona,
    id: personaId,
    createdAt: now,
  };

  await storeMemory({
    content: JSON.stringify(personaData),
    type: 'Style',
    tags: [
      `user:${DEFAULT_USER_ID}`,
      'entity:persona',
      `persona:${personaId}`,
    ],
    importance: 0.8,
    metadata: {
      entityType: 'persona',
      personaId,
      personaName: persona.name,
    },
  });

  return personaId;
}

/**
 * Update a persona
 * AutoMem's consolidation handles merging with existing memory
 */
export async function updatePersona(
  personaId: string,
  updates: Partial<Omit<Persona, 'id' | 'createdAt'>>
): Promise<void> {
  // Get existing persona
  const existing = await getPersonaById(personaId);
  if (!existing) {
    throw new Error('Persona not found');
  }

  const updatedPersona: Persona = {
    ...existing,
    ...updates,
    updatedAt: Date.now(),
  };

  await storeMemory({
    content: JSON.stringify(updatedPersona),
    type: 'Style',
    tags: [
      `user:${DEFAULT_USER_ID}`,
      'entity:persona',
      `persona:${personaId}`,
    ],
    importance: 0.8,
    metadata: {
      entityType: 'persona',
      personaId,
      personaName: updatedPersona.name,
    },
  });
}

/**
 * Delete a persona
 */
export async function deletePersona(personaId: string): Promise<void> {
  await deleteMemoriesByTags([`persona:${personaId}`]);
}

// ============================================================================
// Contact Metadata Operations (stored as Context memories)
// ============================================================================

/**
 * Get contact metadata
 */
export async function getContactMetadata(contactId: string): Promise<ContactMetadata | null> {
  const response = await recallMemories({
    tags: [`contact:${contactId}`, 'entity:contact-metadata'],
    context_types: ['Context'],
    limit: 1,
  });

  const memory = response.memories[0];
  if (!memory) {
    return null;
  }

  return JSON.parse(memory.content) as ContactMetadata;
}

/**
 * Update contact metadata
 * AutoMem's consolidation handles merging with existing memory
 */
export async function updateContactMetadata(
  contactId: string,
  updates: Partial<Omit<ContactMetadata, 'id'>>
): Promise<void> {
  // Get existing metadata or create new
  const existing = await getContactMetadata(contactId);

  const metadata: ContactMetadata = {
    id: contactId,
    ...existing,
    ...updates,
  };

  await storeMemory({
    content: JSON.stringify(metadata),
    type: 'Context',
    tags: [
      `contact:${contactId}`,
      'entity:contact-metadata',
    ],
    importance: 0.6,
    metadata: {
      entityType: 'contact-metadata',
      contactId,
    },
  });
}

/**
 * Get persona name by ID (for display purposes)
 */
export async function getPersonaName(personaId: string): Promise<string | null> {
  const persona = await getPersonaById(personaId);
  return persona?.name || null;
}
