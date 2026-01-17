/**
 * FalkorDB Client for Graph Worker Service
 * Handles graph mutations for knowledge extraction
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
        console.log(`[Graph Worker FalkorDB] Retrying connection... (${times})`);
        return delay;
      },
      maxRetriesPerRequest: 3,
    });

    this.client.on('connect', () => {
      console.log('[Graph Worker FalkorDB] Connected to FalkorDB');
    });

    this.client.on('error', (err: Error) => {
      console.error('[Graph Worker FalkorDB] FalkorDB client error:', err);
    });

    this.client.on('close', () => {
      console.log('[Graph Worker FalkorDB] FalkorDB connection closed');
    });
  }

  async connect(): Promise<void> {
    await this.client.ping();
    console.log('[Graph Worker FalkorDB] FalkorDB client connected');
  }

  async quit(): Promise<void> {
    await this.client.quit();
    console.log('[Graph Worker FalkorDB] FalkorDB client disconnected');
  }

  /**
   * Execute a Cypher query with parameters
   */
  async query(cypherQuery: string, params: Record<string, any> = {}): Promise<any[]> {
    try {
      const paramsJson = JSON.stringify(params);
      const result = await this.client.call(
        'GRAPH.QUERY',
        GRAPH_NAME,
        cypherQuery,
        '--params',
        paramsJson
      );

      return this.parseGraphResult(result);
    } catch (error) {
      console.error('[Graph Worker FalkorDB] Query error:', error);
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
        return value.map((v) => this.parseValue(v));
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
   * Create or update a Person node
   */
  async createOrUpdatePerson(
    personName: string,
    occupation?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    const query = `
      MERGE (p:Person {name: $personName})
      ON CREATE SET p.occupation = $occupation, p.createdAt = $timestamp
      ON MATCH SET p.occupation = COALESCE($occupation, p.occupation), p.updatedAt = $timestamp
      RETURN p.name
    `;

    await this.query(query, {
      personName,
      occupation: occupation || null,
      timestamp: Date.now(),
      ...metadata,
    });

    console.log(`[Graph Worker FalkorDB] Person node created/updated: ${personName}`);
  }

  /**
   * Create or update a Company node
   */
  async createOrUpdateCompany(
    companyName: string,
    industry?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    const query = `
      MERGE (c:Company {name: $companyName})
      ON CREATE SET c.industry = $industry, c.createdAt = $timestamp
      ON MATCH SET c.industry = COALESCE($industry, c.industry), c.updatedAt = $timestamp
      RETURN c.name
    `;

    await this.query(query, {
      companyName,
      industry: industry || null,
      timestamp: Date.now(),
      ...metadata,
    });

    console.log(`[Graph Worker FalkorDB] Company node created/updated: ${companyName}`);
  }

  /**
   * Create or update a Topic node
   */
  async createOrUpdateTopic(
    topicName: string,
    category?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    const query = `
      MERGE (t:Topic {name: $topicName})
      ON CREATE SET t.category = $category, t.createdAt = $timestamp
      ON MATCH SET t.category = COALESCE($category, t.category), t.updatedAt = $timestamp
      RETURN t.name
    `;

    await this.query(query, {
      topicName,
      category: category || null,
      timestamp: Date.now(),
      ...metadata,
    });

    console.log(`[Graph Worker FalkorDB] Topic node created/updated: ${topicName}`);
  }

  /**
   * Link Contact to Person (KNOWS relationship)
   */
  async linkContactToPerson(contactId: string, personName: string): Promise<void> {
    const query = `
      MATCH (c:Contact {id: $contactId})
      MERGE (p:Person {name: $personName})
      MERGE (c)-[:KNOWS]->(p)
      RETURN c.id, p.name
    `;

    await this.query(query, { contactId, personName });

    console.log(`[Graph Worker FalkorDB] Linked ${contactId} KNOWS ${personName}`);
  }

  /**
   * Link Person to Company (WORKS_AT relationship)
   */
  async linkPersonToCompany(personName: string, companyName: string): Promise<void> {
    const query = `
      MATCH (p:Person {name: $personName})
      MERGE (c:Company {name: $companyName})
      MERGE (p)-[:WORKS_AT]->(c)
      RETURN p.name, c.name
    `;

    await this.query(query, { personName, companyName });

    console.log(`[Graph Worker FalkorDB] Linked ${personName} WORKS_AT ${companyName}`);
  }

  /**
   * Link Contact to Topic (MENTIONED relationship with times tracking)
   */
  async linkContactToTopic(contactId: string, topicName: string, timestamp: number): Promise<void> {
    const query = `
      MATCH (c:Contact {id: $contactId})
      MERGE (t:Topic {name: $topicName})
      MERGE (c)-[m:MENTIONED]->(t)
      ON CREATE SET m.times = 1, m.firstMentioned = $timestamp, m.lastMentioned = $timestamp
      ON MATCH SET m.times = m.times + 1, m.lastMentioned = $timestamp
      RETURN c.id, t.name, m.times
    `;

    await this.query(query, { contactId, topicName, timestamp });

    console.log(`[Graph Worker FalkorDB] Linked ${contactId} MENTIONED ${topicName}`);
  }

  /**
   * Get or create Contact node (helper for ingestion)
   */
  async ensureContactExists(
    contactId: string,
    name?: string,
    phoneNumber?: string
  ): Promise<void> {
    const query = `
      MERGE (c:Contact {id: $contactId})
      ON CREATE SET c.name = $name, c.phoneNumber = $phoneNumber, c.createdAt = $timestamp
      ON MATCH SET c.name = COALESCE($name, c.name), c.phoneNumber = COALESCE($phoneNumber, c.phoneNumber)
      RETURN c.id
    `;

    await this.query(query, {
      contactId,
      name: name || null,
      phoneNumber: phoneNumber || null,
      timestamp: Date.now(),
    });
  }
}

// Export singleton instance
export const falkordbClient = new FalkorDBClient();
