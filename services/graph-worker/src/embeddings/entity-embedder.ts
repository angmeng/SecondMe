/**
 * Entity Embedder - Generate and Store Embeddings for Knowledge Graph Entities
 * Part of Semantic RAG: Embeds entities during ingestion for vector search
 */

import { falkordbClient } from '../falkordb/client.js';
import { ExtractedEntity, EntityType } from '../ingestion/entity-extractor.js';

const VOYAGE_API_KEY = process.env['VOYAGE_API_KEY'];
const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings';
const VOYAGE_MODEL = 'voyage-3';
// Embedding dimension for voyage-3 model (used for vector index configuration)
export const EMBEDDING_DIMENSION = 1024;

// Batch size for embedding API calls
const EMBEDDING_BATCH_SIZE = 50;

interface VoyageEmbeddingResponse {
  object: string;
  data: Array<{
    object: string;
    embedding: number[];
    index: number;
  }>;
  model: string;
  usage: {
    total_tokens: number;
  };
}

interface EmbeddingResult {
  entityId: string;
  entityType: EntityType;
  embedding: number[];
  tokensUsed: number;
}

interface BatchEmbeddingResult {
  successful: EmbeddingResult[];
  failed: string[];
  totalTokensUsed: number;
  latencyMs: number;
}

/**
 * Check if embedding is enabled
 */
export function isEmbeddingEnabled(): boolean {
  return Boolean(VOYAGE_API_KEY);
}

/**
 * Format entity for embedding text
 * Creates a rich text representation for semantic search
 */
function formatEntityForEmbedding(entity: ExtractedEntity): string {
  const { type, name, properties } = entity;

  switch (type) {
    case 'PERSON': {
      const occupation = properties['occupation'] as string | undefined;
      const company = properties['company'] as string | undefined;
      const notes = properties['notes'] as string | undefined;
      let text = name;
      if (occupation) text += `, ${occupation}`;
      if (company) text += ` at ${company}`;
      if (notes) text += `. ${notes}`;
      return text;
    }

    case 'COMPANY': {
      const industry = properties['industry'] as string | undefined;
      const notes = properties['notes'] as string | undefined;
      let text = name;
      if (industry) text += ` in ${industry}`;
      if (notes) text += `. ${notes}`;
      return text;
    }

    case 'TOPIC': {
      const category = properties['category'] as string | undefined;
      const notes = properties['notes'] as string | undefined;
      let text = name;
      if (category) text += `. Category: ${category}`;
      if (notes) text += `. ${notes}`;
      return text;
    }

    case 'EVENT': {
      const date = properties['date'] as string | undefined;
      const description = properties['description'] as string | undefined;
      let text = name;
      if (date) text += ` on ${date}`;
      if (description) text += `. ${description}`;
      return text;
    }

    case 'LOCATION': {
      const notes = properties['notes'] as string | undefined;
      return notes ? `${name}. ${notes}` : name;
    }

    default:
      return name;
  }
}

/**
 * Generate entity ID for storage
 */
function generateEntityId(type: EntityType, name: string): string {
  const normalizedName = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const prefix = type.toLowerCase();
  return `${prefix}_${normalizedName}`;
}

/**
 * Call Voyage API for batch embeddings
 */
async function callVoyageAPI(texts: string[]): Promise<number[][]> {
  if (!VOYAGE_API_KEY) {
    throw new Error('VOYAGE_API_KEY not configured');
  }

  const response = await fetch(VOYAGE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({
      model: VOYAGE_MODEL,
      input: texts,
      input_type: 'document',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Voyage API error ${response.status}: ${errorText}`);
  }

  const data = (await response.json()) as VoyageEmbeddingResponse;
  return data.data.map((d) => d.embedding);
}

/**
 * Store embedding in FalkorDB for a specific entity type
 */
async function storeEmbedding(
  entityType: EntityType,
  entityId: string,
  embedding: number[]
): Promise<void> {
  // Map entity type to FalkorDB label
  const labelMap: Record<EntityType, string> = {
    PERSON: 'Person',
    COMPANY: 'Company',
    TOPIC: 'Topic',
    EVENT: 'Event',
    LOCATION: 'Location',
  };

  const label = labelMap[entityType];
  if (!label) {
    console.warn(`[Entity Embedder] Unknown entity type: ${entityType}`);
    return;
  }

  // Update the entity with embedding
  // Note: FalkorDB stores vectors as arrays
  const query = `
    MATCH (n:${label} {id: $entityId})
    SET n.embedding = $embedding,
        n.embeddingUpdatedAt = timestamp()
    RETURN n.id
  `;

  await falkordbClient.query(query, {
    entityId,
    embedding,
  });
}

/**
 * Embed a batch of entities
 * Processes entities in batches to optimize API calls
 */
export async function embedEntities(entities: ExtractedEntity[]): Promise<BatchEmbeddingResult> {
  const startTime = Date.now();

  if (!isEmbeddingEnabled()) {
    console.warn('[Entity Embedder] Embedding disabled - VOYAGE_API_KEY not set');
    return {
      successful: [],
      failed: entities.map((e) => e.name),
      totalTokensUsed: 0,
      latencyMs: Date.now() - startTime,
    };
  }

  if (entities.length === 0) {
    return {
      successful: [],
      failed: [],
      totalTokensUsed: 0,
      latencyMs: 0,
    };
  }

  const successful: EmbeddingResult[] = [];
  const failed: string[] = [];
  let totalTokensUsed = 0;

  // Process in batches
  for (let i = 0; i < entities.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = entities.slice(i, i + EMBEDDING_BATCH_SIZE);
    const texts = batch.map((e) => formatEntityForEmbedding(e));

    try {
      const embeddings = await callVoyageAPI(texts);

      // Store each embedding
      for (let j = 0; j < batch.length; j++) {
        const entity = batch[j];
        const embedding = embeddings[j];

        if (!entity || !embedding) continue;

        const entityId = generateEntityId(entity.type, entity.name);

        try {
          await storeEmbedding(entity.type, entityId, embedding);
          successful.push({
            entityId,
            entityType: entity.type,
            embedding,
            tokensUsed: 0, // Voyage doesn't return per-item tokens
          });
        } catch (storeError) {
          console.error(
            `[Entity Embedder] Failed to store embedding for ${entity.name}:`,
            storeError
          );
          failed.push(entity.name);
        }
      }

      // Estimate tokens (rough approximation)
      totalTokensUsed += texts.reduce((sum, t) => sum + Math.ceil(t.length / 4), 0);
    } catch (apiError) {
      console.error('[Entity Embedder] Voyage API batch failed:', apiError);
      failed.push(...batch.map((e) => e.name));
    }
  }

  const latencyMs = Date.now() - startTime;

  console.log(
    `[Entity Embedder] Embedded ${successful.length}/${entities.length} entities in ${latencyMs}ms ` +
      `(~${totalTokensUsed} tokens)`
  );

  return {
    successful,
    failed,
    totalTokensUsed,
    latencyMs,
  };
}

/**
 * Embed a single entity (convenience function)
 */
export async function embedEntity(entity: ExtractedEntity): Promise<EmbeddingResult | null> {
  const result = await embedEntities([entity]);
  return result.successful[0] || null;
}

/**
 * Check if an entity already has an embedding
 */
export async function hasEmbedding(entityType: EntityType, entityId: string): Promise<boolean> {
  const labelMap: Record<EntityType, string> = {
    PERSON: 'Person',
    COMPANY: 'Company',
    TOPIC: 'Topic',
    EVENT: 'Event',
    LOCATION: 'Location',
  };

  const label = labelMap[entityType];
  if (!label) return false;

  const query = `
    MATCH (n:${label} {id: $entityId})
    WHERE n.embedding IS NOT NULL
    RETURN count(n) AS hasEmb
  `;

  try {
    const results = await falkordbClient.query(query, { entityId });
    return results.length > 0 && results[0].hasEmb > 0;
  } catch {
    return false;
  }
}

/**
 * Get entities that need embeddings (for backfill)
 */
export async function getEntitiesWithoutEmbeddings(
  entityType: EntityType,
  limit: number = 100
): Promise<Array<{ id: string; name: string; properties: Record<string, any> }>> {
  const labelMap: Record<EntityType, string> = {
    PERSON: 'Person',
    COMPANY: 'Company',
    TOPIC: 'Topic',
    EVENT: 'Event',
    LOCATION: 'Location',
  };

  const label = labelMap[entityType];
  if (!label) return [];

  const query = `
    MATCH (n:${label})
    WHERE n.embedding IS NULL
    RETURN n.id AS id, n.name AS name, n AS properties
    LIMIT $limit
  `;

  try {
    const results = await falkordbClient.query(query, { limit });
    return results.map((r: any) => ({
      id: r.id,
      name: r.name,
      properties: r.properties || {},
    }));
  } catch (error) {
    console.error(`[Entity Embedder] Error getting entities without embeddings:`, error);
    return [];
  }
}

/**
 * Backfill embeddings for existing entities
 * Processes entities without embeddings in batches
 */
export async function backfillEmbeddings(
  entityType: EntityType,
  batchSize: number = 50,
  maxEntities: number = 1000
): Promise<{ processed: number; failed: number }> {
  let processed = 0;
  let failed = 0;

  while (processed + failed < maxEntities) {
    const entities = await getEntitiesWithoutEmbeddings(entityType, batchSize);

    if (entities.length === 0) {
      console.log(`[Entity Embedder] No more ${entityType} entities to embed`);
      break;
    }

    // Convert to ExtractedEntity format
    const extractedEntities: ExtractedEntity[] = entities.map((e) => ({
      type: entityType,
      name: e.name,
      properties: e.properties,
      relationships: [],
      confidence: 1.0,
      sourceMessages: [],
    }));

    const result = await embedEntities(extractedEntities);
    processed += result.successful.length;
    failed += result.failed.length;

    console.log(
      `[Entity Embedder] Backfill progress: ${processed} processed, ${failed} failed`
    );
  }

  return { processed, failed };
}
