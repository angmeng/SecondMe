/**
 * AutoMem API Client
 * Handles communication with the AutoMem memory service
 */

import type {
  StoreMemoryRequest,
  StoreMemoryResponse,
  RecallQuery,
  RecallResponse,
  HealthResponse,
  MemoryType,
} from './memory-types.js';

const AUTOMEM_API_URL = process.env['AUTOMEM_API_URL'] || 'http://localhost:8001';
const AUTOMEM_API_TOKEN = process.env['AUTOMEM_API_TOKEN'];

/**
 * AutoMem API Client
 * Provides methods for storing and recalling memories
 */
class AutoMemClient {
  private baseUrl: string;
  private token: string | undefined;
  private isConnected: boolean = false;

  constructor() {
    this.baseUrl = AUTOMEM_API_URL;
    this.token = AUTOMEM_API_TOKEN;
  }

  /**
   * Initialize connection and verify health
   */
  async connect(): Promise<void> {
    try {
      const health = await this.health();
      if (health.status === 'healthy') {
        this.isConnected = true;
        console.log('[AutoMem Client] Connected to AutoMem');
      } else {
        console.warn(`[AutoMem Client] AutoMem status: ${health.status}`);
        this.isConnected = health.status !== 'unhealthy';
      }
    } catch (error) {
      console.error('[AutoMem Client] Failed to connect:', error);
      throw error;
    }
  }

  /**
   * Close the client (no-op for HTTP client, but maintains interface parity)
   */
  async quit(): Promise<void> {
    this.isConnected = false;
    console.log('[AutoMem Client] Disconnected from AutoMem');
  }

  /**
   * Check if client is connected
   */
  get connected(): boolean {
    return this.isConnected;
  }

  /**
   * Build headers for API requests
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    return headers;
  }

  /**
   * Check AutoMem service health
   */
  async health(): Promise<HealthResponse> {
    const response = await fetch(`${this.baseUrl}/health`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Health check failed: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<HealthResponse>;
  }

  /**
   * Store a new memory
   */
  async store(request: StoreMemoryRequest): Promise<StoreMemoryResponse> {
    const response = await fetch(`${this.baseUrl}/memory`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to store memory: ${response.status} ${errorText}`);
    }

    return response.json() as Promise<StoreMemoryResponse>;
  }

  /**
   * Recall memories based on query parameters
   */
  async recall(query: RecallQuery): Promise<RecallResponse> {
    const params = new URLSearchParams();

    if (query.query) {
      params.append('query', query.query);
    }
    if (query.tags && query.tags.length > 0) {
      for (const tag of query.tags) {
        params.append('tags', tag);
      }
    }
    if (query.tag_mode) {
      params.append('tag_mode', query.tag_mode);
    }
    if (query.tag_match) {
      params.append('tag_match', query.tag_match);
    }
    if (query.limit) {
      params.append('limit', query.limit.toString());
    }
    if (query.time_query) {
      params.append('time_query', query.time_query);
    }
    if (query.start) {
      params.append('start', query.start);
    }
    if (query.end) {
      params.append('end', query.end);
    }
    if (query.context_types && query.context_types.length > 0) {
      params.append('context_types', query.context_types.join(','));
    }
    if (query.context_tags && query.context_tags.length > 0) {
      params.append('context_tags', query.context_tags.join(','));
    }
    if (query.expand_relations !== undefined) {
      params.append('expand_relations', query.expand_relations.toString());
    }
    if (query.expand_entities !== undefined) {
      params.append('expand_entities', query.expand_entities.toString());
    }

    const url = `${this.baseUrl}/recall?${params.toString()}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to recall memories: ${response.status} ${errorText}`);
    }

    return response.json() as Promise<RecallResponse>;
  }

  /**
   * Recall memories by contact ID
   * Convenience method for retrieving all memories associated with a contact
   */
  async recallByContact(
    contactId: string,
    options?: {
      query?: string;
      types?: MemoryType[];
      limit?: number;
    }
  ): Promise<RecallResponse> {
    const query: RecallQuery = {
      tags: [`contact:${contactId}`],
      tag_mode: 'any',
      tag_match: 'prefix',
      limit: options?.limit || 20,
    };
    if (options?.query) {
      query.query = options.query;
    }
    if (options?.types) {
      query.context_types = options.types;
    }
    return this.recall(query);
  }

  /**
   * Recall persona memories by relationship type
   */
  async recallPersona(relationshipType: string): Promise<RecallResponse> {
    return this.recall({
      tags: [`relationship:${relationshipType.toLowerCase()}`],
      context_types: ['Style'],
      tag_mode: 'any',
      tag_match: 'prefix',
      limit: 1,
    });
  }

  /**
   * Recall persona by ID
   */
  async recallPersonaById(personaId: string): Promise<RecallResponse> {
    return this.recall({
      tags: [`persona:${personaId}`],
      context_types: ['Style'],
      tag_mode: 'all',
      tag_match: 'exact',
      limit: 1,
    });
  }

  /**
   * Recall all personas for a user
   */
  async recallAllPersonas(): Promise<RecallResponse> {
    return this.recall({
      tags: ['persona:'],
      tag_match: 'prefix',
      context_types: ['Style'],
      limit: 50,
    });
  }

  /**
   * Recall style profile for a contact
   */
  async recallStyleProfile(contactId: string): Promise<RecallResponse> {
    return this.recall({
      tags: [`contact:${contactId}`, 'style:communication'],
      tag_mode: 'all',
      tag_match: 'exact',
      context_types: ['Preference'],
      limit: 1,
    });
  }

  /**
   * Recall contact information
   */
  async recallContact(contactId: string): Promise<RecallResponse> {
    return this.recall({
      tags: [`contact:${contactId}`, 'entity:contact'],
      tag_mode: 'all',
      tag_match: 'exact',
      context_types: ['Context'],
      limit: 1,
    });
  }

  /**
   * Recall people associated with a contact
   */
  async recallPeople(contactId: string, limit: number = 10): Promise<RecallResponse> {
    return this.recall({
      tags: [`contact:${contactId}`, 'entity:person'],
      tag_mode: 'all',
      tag_match: 'exact',
      context_types: ['Context'],
      limit,
    });
  }

  /**
   * Recall topics discussed with a contact
   */
  async recallTopics(contactId: string, limit: number = 8): Promise<RecallResponse> {
    return this.recall({
      tags: [`contact:${contactId}`, 'entity:topic'],
      tag_mode: 'all',
      tag_match: 'exact',
      context_types: ['Context'],
      limit,
    });
  }

  /**
   * Recall events associated with a contact
   */
  async recallEvents(contactId: string, limit: number = 5): Promise<RecallResponse> {
    return this.recall({
      tags: [`contact:${contactId}`, 'entity:event'],
      tag_mode: 'all',
      tag_match: 'exact',
      context_types: ['Context'],
      limit,
    });
  }

  /**
   * Semantic search for relevant memories
   */
  async semanticSearch(
    queryText: string,
    contactId?: string,
    options?: {
      types?: MemoryType[];
      limit?: number;
      expand_relations?: boolean;
    }
  ): Promise<RecallResponse> {
    const query: RecallQuery = {
      query: queryText,
      tag_mode: 'any',
      tag_match: 'prefix',
      limit: options?.limit || 10,
    };
    if (contactId) {
      query.tags = [`contact:${contactId}`];
    }
    if (options?.types) {
      query.context_types = options.types;
    }
    if (options?.expand_relations !== undefined) {
      query.expand_relations = options.expand_relations;
    }
    return this.recall(query);
  }
}

// Export singleton instance
export const automemClient = new AutoMemClient();
