/**
 * AutoMem API Client for Graph Worker
 * Handles communication with the AutoMem memory service for storing entities
 */

const AUTOMEM_API_URL = process.env['AUTOMEM_API_URL'] || 'http://localhost:8001';
const AUTOMEM_API_TOKEN = process.env['AUTOMEM_API_TOKEN'];

/**
 * Memory types supported by AutoMem
 */
export type MemoryType = 'Context' | 'Style' | 'Preference' | 'Pattern' | 'Insight' | 'Decision' | 'Habit';

/**
 * Request to store a memory
 */
export interface StoreMemoryRequest {
  content: string;
  type: MemoryType;
  tags: string[];
  importance?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Response from storing a memory
 */
export interface StoreMemoryResponse {
  id: string;
  status: 'created' | 'consolidated';
  consolidated_with?: string[];
}

/**
 * Health check response
 */
export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  services?: {
    falkordb: 'connected' | 'disconnected';
    qdrant: 'connected' | 'disconnected';
  };
}

/**
 * AutoMem API Client for Graph Worker
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
   * Close the client
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
   * Check AutoMem health
   */
  async health(): Promise<HealthResponse> {
    const response = await fetch(`${this.baseUrl}/health`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Health check failed: ${response.status}`);
    }

    return response.json() as Promise<HealthResponse>;
  }

  /**
   * Store a memory
   */
  async store(request: StoreMemoryRequest): Promise<StoreMemoryResponse> {
    const response = await fetch(`${this.baseUrl}/memory`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to store memory: ${response.status} - ${error}`);
    }

    return response.json() as Promise<StoreMemoryResponse>;
  }

  /**
   * Perform a ping to verify connection
   */
  async ping(): Promise<boolean> {
    try {
      const health = await this.health();
      return health.status !== 'unhealthy';
    } catch {
      return false;
    }
  }
}

// Export singleton instance
export const automemClient = new AutoMemClient();
