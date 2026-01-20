/**
 * Semantic Query Functions for Vector Search
 * Uses FalkorDB vector indexes for semantic context retrieval
 */

import { falkordbClient } from '../falkordb/client.js';

/**
 * Vector search result from FalkorDB
 */
export interface VectorSearchResult {
  id: string;
  name: string;
  score: number;
  category?: string;
  occupation?: string;
  company?: string;
  industry?: string;
  date?: string;
  description?: string;
  notes?: string;
}

/**
 * Contact-filtered result with relationship metadata
 */
export interface ContactFilteredResult extends VectorSearchResult {
  times?: number;
  lastMentioned?: number;
}

/**
 * Search for relevant topics using vector similarity
 * Step 1: Vector search on Topic embeddings
 * Step 2: Filter by contact relationship
 */
export async function searchRelevantTopics(
  queryEmbedding: number[],
  contactId: string,
  options: { topK?: number; minScore?: number } = {}
): Promise<ContactFilteredResult[]> {
  const { topK = 10, minScore = 0.7 } = options;

  console.log(`[Semantic Queries] Searching topics for contact ${contactId}...`);

  try {
    // Step 1: Vector search for topic candidates
    const vectorQuery = `
      CALL db.idx.vector.queryNodes('Topic', 'embedding', $topK, vecf32($embedding))
      YIELD node, score
      WHERE score >= $minScore
      RETURN node.id AS id, node.name AS name, node.category AS category,
             node.notes AS notes, score
    `;

    const candidates = await falkordbClient.query(vectorQuery, {
      embedding: queryEmbedding,
      topK,
      minScore,
    });

    if (candidates.length === 0) {
      console.log('[Semantic Queries] No topic candidates found');
      return [];
    }

    // Step 2: Filter by contact relationship
    const candidateIds = candidates.map((c: any) => c.id);
    const filterQuery = `
      UNWIND $nodeIds AS nodeId
      MATCH (c:Contact {id: $contactId})-[m:MENTIONED]->(t:Topic {id: nodeId})
      RETURN t.id AS id, t.name AS name, t.category AS category,
             t.notes AS notes, m.times AS times, m.lastMentioned AS lastMentioned
    `;

    const filtered = await falkordbClient.query(filterQuery, {
      nodeIds: candidateIds,
      contactId,
    });

    // Merge scores from vector search with relationship data
    const scoreMap = new Map(candidates.map((c: any) => [c.id, c.score]));
    const results: ContactFilteredResult[] = filtered.map((row: any) => ({
      id: row.id,
      name: row.name,
      category: row.category || undefined,
      notes: row.notes || undefined,
      score: scoreMap.get(row.id) || 0,
      times: row.times || 1,
      lastMentioned: row.lastMentioned || undefined,
    }));

    console.log(
      `[Semantic Queries] Found ${results.length} relevant topics (from ${candidates.length} candidates)`
    );

    return results;
  } catch (error) {
    console.error('[Semantic Queries] Error searching topics:', error);
    return [];
  }
}

/**
 * Search for relevant people using vector similarity
 * Step 1: Vector search on Person embeddings
 * Step 2: Filter by contact relationship (KNOWS)
 */
export async function searchRelevantPeople(
  queryEmbedding: number[],
  contactId: string,
  options: { topK?: number; minScore?: number } = {}
): Promise<ContactFilteredResult[]> {
  const { topK = 10, minScore = 0.65 } = options;

  console.log(`[Semantic Queries] Searching people for contact ${contactId}...`);

  try {
    // Step 1: Vector search for person candidates
    const vectorQuery = `
      CALL db.idx.vector.queryNodes('Person', 'embedding', $topK, vecf32($embedding))
      YIELD node, score
      WHERE score >= $minScore
      RETURN node.id AS id, node.name AS name, node.occupation AS occupation,
             node.notes AS notes, score
    `;

    const candidates = await falkordbClient.query(vectorQuery, {
      embedding: queryEmbedding,
      topK,
      minScore,
    });

    if (candidates.length === 0) {
      console.log('[Semantic Queries] No person candidates found');
      return [];
    }

    // Step 2: Filter by contact relationship and get company info
    const candidateIds = candidates.map((c: any) => c.id);
    const filterQuery = `
      UNWIND $nodeIds AS nodeId
      MATCH (c:Contact {id: $contactId})-[:KNOWS]->(p:Person {id: nodeId})
      OPTIONAL MATCH (p)-[:WORKS_AT]->(comp:Company)
      RETURN p.id AS id, p.name AS name, p.occupation AS occupation,
             p.notes AS notes, p.lastMentioned AS lastMentioned,
             comp.name AS company, comp.industry AS industry
    `;

    const filtered = await falkordbClient.query(filterQuery, {
      nodeIds: candidateIds,
      contactId,
    });

    // Merge scores from vector search with relationship data
    const scoreMap = new Map(candidates.map((c: any) => [c.id, c.score]));
    const results: ContactFilteredResult[] = filtered.map((row: any) => ({
      id: row.id,
      name: row.name,
      occupation: row.occupation || undefined,
      company: row.company || undefined,
      industry: row.industry || undefined,
      notes: row.notes || undefined,
      score: scoreMap.get(row.id) || 0,
      lastMentioned: row.lastMentioned || undefined,
    }));

    console.log(
      `[Semantic Queries] Found ${results.length} relevant people (from ${candidates.length} candidates)`
    );

    return results;
  } catch (error) {
    console.error('[Semantic Queries] Error searching people:', error);
    return [];
  }
}

/**
 * Search for relevant events using vector similarity
 * Step 1: Vector search on Event embeddings
 * Step 2: Filter by contact relationship (ATTENDING or MENTIONED)
 */
export async function searchRelevantEvents(
  queryEmbedding: number[],
  contactId: string,
  options: { topK?: number; minScore?: number } = {}
): Promise<ContactFilteredResult[]> {
  const { topK = 5, minScore = 0.7 } = options;

  console.log(`[Semantic Queries] Searching events for contact ${contactId}...`);

  try {
    // Step 1: Vector search for event candidates
    const vectorQuery = `
      CALL db.idx.vector.queryNodes('Event', 'embedding', $topK, vecf32($embedding))
      YIELD node, score
      WHERE score >= $minScore
      RETURN node.id AS id, node.name AS name, node.date AS date,
             node.description AS description, node.notes AS notes, score
    `;

    const candidates = await falkordbClient.query(vectorQuery, {
      embedding: queryEmbedding,
      topK,
      minScore,
    });

    if (candidates.length === 0) {
      console.log('[Semantic Queries] No event candidates found');
      return [];
    }

    // Step 2: Filter by contact relationship
    const candidateIds = candidates.map((c: any) => c.id);
    const filterQuery = `
      UNWIND $nodeIds AS nodeId
      MATCH (c:Contact {id: $contactId})-[:ATTENDING|:MENTIONED]->(e:Event {id: nodeId})
      RETURN e.id AS id, e.name AS name, e.date AS date,
             e.description AS description, e.notes AS notes
    `;

    const filtered = await falkordbClient.query(filterQuery, {
      nodeIds: candidateIds,
      contactId,
    });

    // Merge scores from vector search
    const scoreMap = new Map(candidates.map((c: any) => [c.id, c.score]));
    const results: ContactFilteredResult[] = filtered.map((row: any) => ({
      id: row.id,
      name: row.name,
      date: row.date || undefined,
      description: row.description || undefined,
      notes: row.notes || undefined,
      score: scoreMap.get(row.id) || 0,
    }));

    console.log(
      `[Semantic Queries] Found ${results.length} relevant events (from ${candidates.length} candidates)`
    );

    return results;
  } catch (error) {
    console.error('[Semantic Queries] Error searching events:', error);
    return [];
  }
}

/**
 * Check if vector indexes exist for semantic search
 * Returns false if indexes are not available (fallback to keyword search)
 */
export async function checkVectorIndexesExist(): Promise<boolean> {
  try {
    // Try a simple vector query to see if index exists
    const testQuery = `
      CALL db.idx.vector.queryNodes('Topic', 'embedding', 1, vecf32($embedding))
      YIELD node, score
      RETURN count(node) AS count
    `;

    // Use a zero vector for testing
    const zeroEmbedding = new Array(1024).fill(0);
    await falkordbClient.query(testQuery, { embedding: zeroEmbedding });

    return true;
  } catch (error: any) {
    // Index doesn't exist or other error
    console.warn('[Semantic Queries] Vector indexes not available:', error.message);
    return false;
  }
}
