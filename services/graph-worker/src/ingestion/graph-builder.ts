/**
 * Graph Builder - Converts extracted entities to AutoMem memories
 * User Story 2: Transforms entity extraction results into AutoMem storage
 * AutoMem handles vector embeddings internally via Qdrant
 */

import type { ExtractedEntity } from './entity-extractor.js';
import { storeEntities } from '../automem/index.js';

/**
 * Graph mutation result
 */
export interface GraphMutationResult {
  entitiesStored: number;
  entitiesFailed: number;
  errors: string[];
  latencyMs: number;
}

/**
 * Graph Builder class - handles entity-to-AutoMem conversion
 * AutoMem automatically handles:
 * - Graph relationships via internal FalkorDB
 * - Vector embeddings via internal Qdrant
 * - Memory consolidation and deduplication
 */
class GraphBuilder {
  /**
   * Build graph from extracted entities for a contact
   * Stores entities as AutoMem memories with appropriate tags
   */
  async buildGraphFromEntities(
    contactId: string,
    entities: ExtractedEntity[]
  ): Promise<GraphMutationResult> {
    const startTime = Date.now();

    console.log(`[Graph Builder] Storing ${entities.length} entities for ${contactId} to AutoMem`);

    // Store all entities to AutoMem
    const storageResult = await storeEntities(contactId, entities);

    const result: GraphMutationResult = {
      entitiesStored: storageResult.stored,
      entitiesFailed: storageResult.failed,
      errors: storageResult.errors,
      latencyMs: Date.now() - startTime,
    };

    console.log(
      `[Graph Builder] Completed in ${result.latencyMs}ms: ${result.entitiesStored} entities stored, ${result.entitiesFailed} failed`
    );

    return result;
  }
}

// Export singleton instance
export const graphBuilder = new GraphBuilder();

/**
 * Build graph from entities (convenience function)
 */
export async function buildGraphFromEntities(
  contactId: string,
  entities: ExtractedEntity[]
): Promise<GraphMutationResult> {
  return graphBuilder.buildGraphFromEntities(contactId, entities);
}
