/**
 * FalkorDB Client for Orchestrator Service
 * Handles graph database queries for knowledge retrieval and context
 */

import { Redis } from 'ioredis';

const FALKORDB_HOST = process.env['FALKORDB_HOST'] || 'localhost';
const FALKORDB_PORT = parseInt(process.env['FALKORDB_PORT'] || '6379', 10);
const FALKORDB_PASSWORD = process.env['FALKORDB_PASSWORD'];
const GRAPH_NAME = 'knowledge_graph';

class FalkorDBClient {
  private client: Redis;

  constructor() {
    this.client = new Redis({
      host: FALKORDB_HOST,
      port: FALKORDB_PORT,
      ...(FALKORDB_PASSWORD && { password: FALKORDB_PASSWORD }),
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        console.log(`[Orchestrator FalkorDB] Retrying connection... (${times})`);
        return delay;
      },
      maxRetriesPerRequest: 3,
    });

    this.client.on('connect', () => {
      console.log('[Orchestrator FalkorDB] Connected to FalkorDB');
    });

    this.client.on('error', (err: Error) => {
      console.error('[Orchestrator FalkorDB] FalkorDB client error:', err);
    });

    this.client.on('close', () => {
      console.log('[Orchestrator FalkorDB] FalkorDB connection closed');
    });
  }

  async connect(): Promise<void> {
    await this.client.ping();
    console.log('[Orchestrator FalkorDB] FalkorDB client connected');
  }

  async quit(): Promise<void> {
    await this.client.quit();
    console.log('[Orchestrator FalkorDB] FalkorDB client disconnected');
  }

  /**
   * Execute a Cypher query with parameters
   * Uses CYPHER prefix syntax for parameter passing (--params flag doesn't work with ioredis)
   */
  async query(cypherQuery: string, params: Record<string, any> = {}): Promise<any[]> {
    try {
      // Build CYPHER prefix for parameters (correct FalkorDB syntax with ioredis)
      const cypherPrefix = Object.entries(params)
        .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
        .join(' ');

      const fullQuery = cypherPrefix ? `CYPHER ${cypherPrefix} ${cypherQuery}` : cypherQuery;

      const result = await this.client.call('GRAPH.QUERY', GRAPH_NAME, fullQuery);

      return this.parseGraphResult(result);
    } catch (error) {
      console.error('[Orchestrator FalkorDB] Query error:', error);
      throw error;
    }
  }

  /**
   * Parse FalkorDB result into readable format
   */
  private parseGraphResult(result: any): any[] {
    if (!result || !Array.isArray(result) || result.length === 0) {
      return [];
    }

    // Result format: [header, data[], statistics]
    const [header, data, _statistics] = result;

    if (!data || data.length === 0) {
      return [];
    }

    // Map data rows to objects using header column names
    const rows = data.map((row: any[]) => {
      const obj: Record<string, any> = {};
      header.forEach((colName: string, index: number) => {
        obj[colName] = this.parseValue(row[index]);
      });
      return obj;
    });

    return rows;
  }

  /**
   * Parse individual value from FalkorDB response
   */
  private parseValue(value: any): any {
    if (!value) return null;

    // Handle different data types
    if (Array.isArray(value)) {
      // Could be a node, relationship, or array
      if (value[0] === 1) {
        // Node: [1, id, labels, properties]
        return this.parseNode(value);
      } else if (value[0] === 2) {
        // Relationship: [2, id, type, srcId, destId, properties]
        return this.parseRelationship(value);
      } else {
        // Regular array
        return value.map(v => this.parseValue(v));
      }
    }

    return value;
  }

  /**
   * Parse node from FalkorDB response
   */
  private parseNode(nodeArray: any[]): any {
    // Node format: [1, id, [labels], [[propKey, propValue], ...]]
    const [, id, labels, properties] = nodeArray;

    const node: any = { _id: id, _labels: labels };

    if (properties && Array.isArray(properties)) {
      properties.forEach(([key, value]: [string, any]) => {
        node[key] = value;
      });
    }

    return node;
  }

  /**
   * Parse relationship from FalkorDB response
   */
  private parseRelationship(relArray: any[]): any {
    // Relationship format: [2, id, type, srcId, destId, [[propKey, propValue], ...]]
    const [, id, type, srcId, destId, properties] = relArray;

    const rel: any = {
      _id: id,
      _type: type,
      _srcId: srcId,
      _destId: destId,
    };

    if (properties && Array.isArray(properties)) {
      properties.forEach(([key, value]: [string, any]) => {
        rel[key] = value;
      });
    }

    return rel;
  }

  /**
   * Get contact context (2-hop traversal for relationships and topics)
   */
  async getContactContext(contactId: string): Promise<{
    people: any[];
    topics: any[];
  }> {
    // Query 1: Get people and companies related to contact
    const peopleQuery = `
      MATCH (c:Contact {id: $contactId})-[:KNOWS]->(p:Person)-[:WORKS_AT]->(comp:Company)
      RETURN p.name AS personName, p.occupation, comp.name AS companyName, comp.industry
      LIMIT 10
    `;

    const people = await this.query(peopleQuery, { contactId });

    // Query 2: Get topics discussed with contact
    const topicsQuery = `
      MATCH (c:Contact {id: $contactId})-[m:MENTIONED]->(t:Topic)
      RETURN t.name AS topicName, t.category, m.times, m.lastMentioned
      ORDER BY m.lastMentioned DESC
      LIMIT 5
    `;

    const topics = await this.query(topicsQuery, { contactId });

    return { people, topics };
  }

  /**
   * Get persona for contact's relationship type
   */
  async getPersonaForContact(userId: string, relationshipType: string): Promise<any | null> {
    const query = `
      MATCH (u:User {id: $userId})-[:HAS_PERSONA]->(p:Persona)
      WHERE $relationshipType IN p.applicableTo
      RETURN p.id, p.name, p.styleGuide, p.tone, p.exampleMessages
      LIMIT 1
    `;

    const results = await this.query(query, { userId, relationshipType });

    return results.length > 0 ? results[0] : null;
  }

  /**
   * Get contact information
   */
  async getContact(contactId: string): Promise<any | null> {
    const query = `
      MATCH (c:Contact {id: $contactId})
      RETURN c.id, c.name, c.phoneNumber, c.relationshipType, c.botEnabled, c.assignedPersona
      LIMIT 1
    `;

    const results = await this.query(query, { contactId });

    return results.length > 0 ? results[0] : null;
  }

  /**
   * Get user information
   */
  async getUser(userId: string = 'user-1'): Promise<any | null> {
    const query = `
      MATCH (u:User {id: $userId})
      RETURN u.id, u.phoneNumber, u.defaultPersona, u.sleepHoursStart, u.sleepHoursEnd
      LIMIT 1
    `;

    const results = await this.query(query, { userId });

    return results.length > 0 ? results[0] : null;
  }
}

// Export singleton instance
export const falkordbClient = new FalkorDBClient();
