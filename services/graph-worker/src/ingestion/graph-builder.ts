/**
 * Graph Builder - Converts extracted entities to graph mutations
 * User Story 2: Transforms entity extraction results into FalkorDB operations
 */

import { ExtractedEntity, ExtractedRelationship } from './entity-extractor.js';
import { falkordbClient } from '../falkordb/client.js';

/**
 * Graph mutation result
 */
export interface GraphMutationResult {
  nodesCreated: number;
  nodesUpdated: number;
  relationshipsCreated: number;
  errors: string[];
  latencyMs: number;
}

/**
 * Graph Builder class - handles entity-to-graph conversion
 */
class GraphBuilder {
  /**
   * Build graph from extracted entities for a contact
   */
  async buildGraphFromEntities(
    contactId: string,
    entities: ExtractedEntity[]
  ): Promise<GraphMutationResult> {
    const startTime = Date.now();
    const result: GraphMutationResult = {
      nodesCreated: 0,
      nodesUpdated: 0,
      relationshipsCreated: 0,
      errors: [],
      latencyMs: 0,
    };

    console.log(`[Graph Builder] Building graph for ${contactId} with ${entities.length} entities`);

    // Ensure contact exists
    try {
      await falkordbClient.ensureContactExists(contactId);
    } catch (error: any) {
      result.errors.push(`Failed to ensure contact exists: ${error.message}`);
      return result;
    }

    // Process each entity
    for (const entity of entities) {
      try {
        await this.processEntity(contactId, entity, result);
      } catch (error: any) {
        console.error(`[Graph Builder] Error processing entity ${entity.name}:`, error);
        result.errors.push(`Error processing ${entity.type} "${entity.name}": ${error.message}`);
      }
    }

    result.latencyMs = Date.now() - startTime;

    console.log(
      `[Graph Builder] Completed in ${result.latencyMs}ms: ${result.nodesCreated} nodes created, ${result.nodesUpdated} updated, ${result.relationshipsCreated} relationships`
    );

    return result;
  }

  /**
   * Process a single entity and its relationships
   */
  private async processEntity(
    contactId: string,
    entity: ExtractedEntity,
    result: GraphMutationResult
  ): Promise<void> {
    // Create or update the node based on entity type
    switch (entity.type) {
      case 'PERSON':
        await this.processPerson(contactId, entity, result);
        break;
      case 'COMPANY':
        await this.processCompany(entity, result);
        break;
      case 'TOPIC':
        await this.processTopic(contactId, entity, result);
        break;
      case 'EVENT':
        await this.processEvent(contactId, entity, result);
        break;
      case 'LOCATION':
        await this.processLocation(entity, result);
        break;
      default:
        console.warn(`[Graph Builder] Unknown entity type: ${entity.type}`);
    }

    // Process relationships
    for (const rel of entity.relationships) {
      try {
        await this.processRelationship(entity, rel, result);
      } catch (error: any) {
        result.errors.push(
          `Error creating relationship ${entity.name} -[${rel.type}]-> ${rel.targetName}: ${error.message}`
        );
      }
    }
  }

  /**
   * Process PERSON entity
   */
  private async processPerson(
    contactId: string,
    entity: ExtractedEntity,
    result: GraphMutationResult
  ): Promise<void> {
    const occupation = entity.properties['occupation'] as string | undefined;

    await falkordbClient.createOrUpdatePerson(entity.name, occupation);
    result.nodesUpdated++;

    // Link contact to person (KNOWS relationship)
    await falkordbClient.linkContactToPerson(contactId, entity.name);
    result.relationshipsCreated++;
  }

  /**
   * Process COMPANY entity
   */
  private async processCompany(
    entity: ExtractedEntity,
    result: GraphMutationResult
  ): Promise<void> {
    const industry = entity.properties['industry'] as string | undefined;

    await falkordbClient.createOrUpdateCompany(entity.name, industry);
    result.nodesUpdated++;
  }

  /**
   * Process TOPIC entity
   */
  private async processTopic(
    contactId: string,
    entity: ExtractedEntity,
    result: GraphMutationResult
  ): Promise<void> {
    const category = entity.properties['category'] as string | undefined;

    await falkordbClient.createOrUpdateTopic(entity.name, category);
    result.nodesUpdated++;

    // Link contact to topic (MENTIONED relationship)
    await falkordbClient.linkContactToTopic(contactId, entity.name, Date.now());
    result.relationshipsCreated++;
  }

  /**
   * Process EVENT entity
   */
  private async processEvent(
    contactId: string,
    entity: ExtractedEntity,
    result: GraphMutationResult
  ): Promise<void> {
    const date = entity.properties['date'] as string | undefined;
    const location = entity.properties['location'] as string | undefined;
    const description = entity.properties['description'] as string | undefined;

    // Create event node
    const query = `
      MERGE (e:Event {name: $name})
      ON CREATE SET e.date = $date, e.location = $location, e.description = $description, e.createdAt = timestamp()
      ON MATCH SET e.date = COALESCE($date, e.date), e.location = COALESCE($location, e.location), e.description = COALESCE($description, e.description), e.updatedAt = timestamp()
      RETURN e.name
    `;

    await falkordbClient.query(query, {
      name: entity.name,
      date: date || null,
      location: location || null,
      description: description || null,
    });
    result.nodesUpdated++;

    // Link contact to event
    const linkQuery = `
      MATCH (c:Contact {id: $contactId})
      MATCH (e:Event {name: $eventName})
      MERGE (c)-[:MENTIONED]->(e)
      RETURN c.id
    `;

    await falkordbClient.query(linkQuery, { contactId, eventName: entity.name });
    result.relationshipsCreated++;
  }

  /**
   * Process LOCATION entity
   */
  private async processLocation(
    entity: ExtractedEntity,
    result: GraphMutationResult
  ): Promise<void> {
    const type = entity.properties['type'] as string | undefined;
    const address = entity.properties['address'] as string | undefined;

    const query = `
      MERGE (l:Location {name: $name})
      ON CREATE SET l.type = $type, l.address = $address, l.createdAt = timestamp()
      ON MATCH SET l.type = COALESCE($type, l.type), l.address = COALESCE($address, l.address), l.updatedAt = timestamp()
      RETURN l.name
    `;

    await falkordbClient.query(query, {
      name: entity.name,
      type: type || null,
      address: address || null,
    });
    result.nodesUpdated++;
  }

  /**
   * Process relationship between entities
   */
  private async processRelationship(
    sourceEntity: ExtractedEntity,
    relationship: ExtractedRelationship,
    result: GraphMutationResult
  ): Promise<void> {
    // Map relationship types to Cypher patterns
    const relType = relationship.type.toUpperCase().replace(/\s+/g, '_');

    // Build query based on source and target types
    const sourceLabel = sourceEntity.type === 'PERSON' ? 'Person' :
                        sourceEntity.type === 'COMPANY' ? 'Company' :
                        sourceEntity.type === 'TOPIC' ? 'Topic' :
                        sourceEntity.type === 'EVENT' ? 'Event' :
                        sourceEntity.type === 'LOCATION' ? 'Location' : 'Entity';

    const targetLabel = relationship.targetType === 'PERSON' ? 'Person' :
                        relationship.targetType === 'COMPANY' ? 'Company' :
                        relationship.targetType === 'TOPIC' ? 'Topic' :
                        relationship.targetType === 'EVENT' ? 'Event' :
                        relationship.targetType === 'LOCATION' ? 'Location' : 'Entity';

    // Handle WORKS_AT specially as it's common
    if (relType === 'WORKS_AT' && sourceEntity.type === 'PERSON' && relationship.targetType === 'COMPANY') {
      await falkordbClient.linkPersonToCompany(sourceEntity.name, relationship.targetName);
      result.relationshipsCreated++;
      return;
    }

    // Generic relationship creation
    const query = `
      MATCH (s:${sourceLabel} {name: $sourceName})
      MERGE (t:${targetLabel} {name: $targetName})
      MERGE (s)-[:${relType}]->(t)
      RETURN s.name, t.name
    `;

    await falkordbClient.query(query, {
      sourceName: sourceEntity.name,
      targetName: relationship.targetName,
    });
    result.relationshipsCreated++;
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
