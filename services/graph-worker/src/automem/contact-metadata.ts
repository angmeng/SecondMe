/**
 * Contact Metadata Operations for AutoMem
 * Handles contact-related metadata storage
 */

import { automemClient } from './client.js';

/**
 * Record that a message was processed
 * Stored as a Context memory for tracking
 */
export async function recordProcessedMessage(
  messageId: string,
  contactId: string,
  entitiesExtracted: number,
  timestamp: number
): Promise<void> {
  await automemClient.store({
    content: JSON.stringify({
      messageId,
      contactId,
      entitiesExtracted,
      processedAt: timestamp,
    }),
    type: 'Context',
    tags: [
      `contact:${contactId}`,
      'entity:processed-message',
      `message:${messageId}`,
    ],
    importance: 0.3, // Low importance, just tracking
    metadata: {
      entityType: 'processed-message',
      messageId,
      contactId,
      entitiesExtracted,
    },
  });

  console.log(
    `[Contact Metadata] Recorded processed message ${messageId} for ${contactId}: ${entitiesExtracted} entities`
  );
}

/**
 * Update contact's last interaction timestamp
 */
export async function updateContactLastInteraction(
  contactId: string,
  timestamp: number
): Promise<void> {
  await automemClient.store({
    content: JSON.stringify({
      contactId,
      lastInteraction: timestamp,
      updatedAt: Date.now(),
    }),
    type: 'Context',
    tags: [
      `contact:${contactId}`,
      'entity:contact-metadata',
    ],
    importance: 0.5,
    metadata: {
      entityType: 'contact-metadata',
      contactId,
      lastInteraction: timestamp,
    },
  });

  console.log(
    `[Contact Metadata] Updated last interaction for ${contactId}: ${new Date(timestamp).toISOString()}`
  );
}

/**
 * Update contact's relationship type
 */
export async function updateContactRelationshipType(
  contactId: string,
  relationshipType: string,
  relationshipConfidence: number,
  relationshipSource: 'auto_detected' | 'manual_override'
): Promise<void> {
  await automemClient.store({
    content: JSON.stringify({
      contactId,
      relationshipType,
      relationshipConfidence,
      relationshipSource,
      relationshipUpdatedAt: Date.now(),
    }),
    type: 'Context',
    tags: [
      `contact:${contactId}`,
      'entity:contact-metadata',
      `relationship:${relationshipType}`,
    ],
    importance: 0.6,
    metadata: {
      entityType: 'contact-metadata',
      contactId,
      relationshipType,
      relationshipConfidence,
      relationshipSource,
    },
  });

  console.log(
    `[Contact Metadata] Updated relationship for ${contactId}: ${relationshipType} ` +
      `(${Math.round(relationshipConfidence * 100)}%, source: ${relationshipSource})`
  );
}
