/**
 * Pairing Store
 * Redis storage layer for contact approval state
 *
 * Simplified Contact Approval Mode:
 * - Unknown contacts are blocked by default
 * - First message stores them as "pending" in dashboard
 * - Optional auto-reply to unknown contacts (configurable)
 * - Admin enables/disables contacts with one click
 * - No verification codes or pairing prompts
 *
 * Redis Keys:
 * - PAIRING:pending:{contactId}  - PairingRequest JSON, no TTL
 * - PAIRING:approved:{contactId} - ApprovedContact JSON, no TTL
 * - PAIRING:denied:{contactId}   - DeniedContact JSON, TTL: 24 hours
 */

import { redisClient } from './client.js';
import { createLogger } from '../utils/logger.js';
import {
  type PairingRequest,
  type ApprovedContact,
  type DeniedContact,
  type PairingConfig,
  type ContactTier,
  type CreatePairingResult,
  DEFAULT_PAIRING_CONFIG,
  parseIntEnv,
  extractPhoneFromContactId,
  PAIRING_KEYS,
  listPendingRequests,
  listApprovedContacts,
  getPendingRequest as sharedGetPendingRequest,
  getApprovedContact as sharedGetApprovedContact,
  revokeApproval as sharedRevokeApproval,
  updateContactTier as sharedUpdateContactTier,
  REDIS_EVENTS,
} from '@secondme/shared-types';

const logger = createLogger('PairingStore');

/**
 * Configuration from environment with defaults
 */
const PAIRING_CONFIG: PairingConfig = {
  enabled: process.env['PAIRING_ENABLED'] !== 'false',
  denialCooldownHours: parseIntEnv(
    'PAIRING_DENIAL_COOLDOWN_HOURS',
    DEFAULT_PAIRING_CONFIG.denialCooldownHours
  ),
  maxPendingRequests: parseIntEnv(
    'PAIRING_MAX_PENDING',
    DEFAULT_PAIRING_CONFIG.maxPendingRequests
  ),
  autoApproveExisting: process.env['PAIRING_AUTO_APPROVE_EXISTING'] !== 'false',
  autoReplyUnknown: process.env['PAIRING_AUTO_REPLY_UNKNOWN'] === 'true',
  autoReplyMessage:
    process.env['PAIRING_AUTO_REPLY_MESSAGE'] || DEFAULT_PAIRING_CONFIG.autoReplyMessage,
};

/**
 * Lua script for atomic pairing request creation
 * Checks: not already approved, not denied (in cooldown), no existing pending
 * Creates: pending request (no TTL - stays until approved/denied)
 */
const CREATE_PAIRING_SCRIPT = `
  local approvedKey = KEYS[1]
  local deniedKey = KEYS[2]
  local pendingKey = KEYS[3]
  local requestJson = ARGV[1]

  if redis.call('EXISTS', approvedKey) == 1 then
    return {0, 'already_approved'}
  end

  if redis.call('EXISTS', deniedKey) == 1 then
    return {0, 'denied_cooldown'}
  end

  if redis.call('EXISTS', pendingKey) == 1 then
    return {0, 'already_pending'}
  end

  redis.call('SET', pendingKey, requestJson)

  return {1, 'created'}
`;

/**
 * Lua script for atomic approval
 * Sets approved, deletes pending
 */
const APPROVE_CONTACT_SCRIPT = `
  local approvedKey = KEYS[1]
  local pendingKey = KEYS[2]
  local approvedJson = ARGV[1]

  redis.call('SET', approvedKey, approvedJson)
  redis.call('DEL', pendingKey)

  return 1
`;

/**
 * Lua script for atomic denial
 * Sets denied with TTL, deletes pending
 */
const DENY_CONTACT_SCRIPT = `
  local deniedKey = KEYS[1]
  local pendingKey = KEYS[2]
  local deniedJson = ARGV[1]
  local ttlSeconds = tonumber(ARGV[2])

  redis.call('SET', deniedKey, deniedJson, 'EX', ttlSeconds)
  redis.call('DEL', pendingKey)

  return 1
`;

/**
 * Pairing Store class for managing contact approval state
 */
class PairingStore {
  private config: PairingConfig;

  constructor(config: PairingConfig = PAIRING_CONFIG) {
    this.config = config;
  }

  /**
   * Check if pairing mode is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Check if auto-approve existing contacts is enabled
   */
  isAutoApproveExistingEnabled(): boolean {
    return this.config.autoApproveExisting;
  }

  /**
   * Check if auto-reply to unknown contacts is enabled
   */
  isAutoReplyUnknownEnabled(): boolean {
    return this.config.autoReplyUnknown;
  }

  /**
   * Get the auto-reply message for unknown contacts
   */
  getAutoReplyMessage(): string {
    return this.config.autoReplyMessage;
  }

  /**
   * Check if a contact has existing conversation history
   * Used for auto-approving existing contacts when pairing mode is enabled
   */
  async hasConversationHistory(contactId: string): Promise<boolean> {
    const historyKey = `HISTORY:${contactId}`;
    const exists = await redisClient.client.exists(historyKey);
    return exists === 1;
  }

  /**
   * Extract phone number from platform-specific contact ID
   */
  private extractPhoneNumber(contactId: string): string {
    return extractPhoneFromContactId(contactId);
  }

  /**
   * Run a Lua script atomically
   */
  private async runScript(
    script: string,
    numKeys: number,
    ...args: string[]
  ): Promise<unknown> {
    return redisClient.client.call('EVAL', script, numKeys, ...args);
  }

  /**
   * Create a pairing request for an unknown contact
   * Stores contact info for admin approval - no code, no expiry
   */
  async createPairingRequest(
    contactId: string,
    displayName?: string,
    profilePicUrl?: string,
    channelId?: string,
    firstMessage?: string
  ): Promise<CreatePairingResult> {
    const now = Date.now();

    const request: PairingRequest = {
      contactId,
      phoneNumber: this.extractPhoneNumber(contactId),
      ...(displayName !== undefined && { displayName }),
      ...(profilePicUrl !== undefined && { profilePicUrl }),
      ...(channelId !== undefined && { channelId }),
      ...(firstMessage !== undefined && { firstMessage }),
      requestedAt: now,
      status: 'pending',
    };

    const result = (await this.runScript(
      CREATE_PAIRING_SCRIPT,
      3,
      PAIRING_KEYS.approved(contactId),
      PAIRING_KEYS.denied(contactId),
      PAIRING_KEYS.pending(contactId),
      JSON.stringify(request)
    )) as [number, string];

    if (result[0] === 1) {
      logger.info(`Created pairing request for ${contactId}`);
      return { success: true, request };
    } else {
      logger.info(
        `Pairing request not created for ${contactId}: ${result[1]}`
      );
      return {
        success: false,
        reason: result[1] as 'already_approved' | 'already_pending' | 'denied_cooldown',
      };
    }
  }

  /**
   * Check if a contact is approved
   */
  async isApproved(contactId: string): Promise<boolean> {
    const exists = await redisClient.client.exists(PAIRING_KEYS.approved(contactId));
    return exists === 1;
  }

  /**
   * Check if a contact is denied (in cooldown period)
   */
  async isDenied(contactId: string): Promise<boolean> {
    const exists = await redisClient.client.exists(PAIRING_KEYS.denied(contactId));
    return exists === 1;
  }

  /**
   * Get pending pairing request for a contact.
   * Delegates to the shared implementation (includes type-guard validation).
   */
  async getPendingRequest(contactId: string): Promise<PairingRequest | null> {
    return sharedGetPendingRequest(redisClient.client, contactId);
  }

  /**
   * Get approved contact record.
   * Delegates to the shared implementation (includes type-guard validation).
   */
  async getApprovedContact(contactId: string): Promise<ApprovedContact | null> {
    return sharedGetApprovedContact(redisClient.client, contactId);
  }

  /**
   * Approve a contact (admin action)
   */
  async approveContact(
    contactId: string,
    approvedBy: string,
    tier: ContactTier = 'standard',
    notes?: string
  ): Promise<ApprovedContact> {
    // Get pending request to preserve contact info
    const pending = await this.getPendingRequest(contactId);

    const now = Date.now();
    const approved: ApprovedContact = {
      contactId,
      phoneNumber: pending?.phoneNumber ?? this.extractPhoneNumber(contactId),
      ...(pending?.displayName !== undefined && { displayName: pending.displayName }),
      ...(pending?.profilePicUrl !== undefined && { profilePicUrl: pending.profilePicUrl }),
      ...(pending?.channelId !== undefined && { channelId: pending.channelId }),
      approvedAt: now,
      approvedBy,
      tier,
      ...(notes !== undefined && { notes }),
    };

    await this.runScript(
      APPROVE_CONTACT_SCRIPT,
      2,
      PAIRING_KEYS.approved(contactId),
      PAIRING_KEYS.pending(contactId),
      JSON.stringify(approved)
    );

    logger.info(`Contact ${contactId} approved by ${approvedBy} (tier: ${tier})`);

    // Publish event for real-time updates
    await redisClient.publish(
      REDIS_EVENTS.PAIRING,
      JSON.stringify({
        action: 'approved',
        contactId,
        approvedBy,
        tier,
        timestamp: now,
      })
    );

    return approved;
  }

  /**
   * Deny a contact (admin action) - sets cooldown period
   */
  async denyContact(contactId: string, deniedBy: string, reason?: string): Promise<void> {
    const pending = await this.getPendingRequest(contactId);

    const now = Date.now();
    const expiresAt = now + this.config.denialCooldownHours * 60 * 60 * 1000;
    const ttlSeconds = this.config.denialCooldownHours * 60 * 60;

    const denied: DeniedContact = {
      contactId,
      phoneNumber: pending?.phoneNumber ?? this.extractPhoneNumber(contactId),
      ...(pending?.displayName !== undefined && { displayName: pending.displayName }),
      deniedAt: now,
      deniedBy,
      ...(reason !== undefined && { reason }),
      expiresAt,
    };

    await this.runScript(
      DENY_CONTACT_SCRIPT,
      2,
      PAIRING_KEYS.denied(contactId),
      PAIRING_KEYS.pending(contactId),
      JSON.stringify(denied),
      ttlSeconds.toString()
    );

    logger.info(
      `Contact ${contactId} denied by ${deniedBy} (cooldown: ${this.config.denialCooldownHours}h)`
    );

    // Publish event
    await redisClient.publish(
      REDIS_EVENTS.PAIRING,
      JSON.stringify({
        action: 'denied',
        contactId,
        deniedBy,
        reason,
        timestamp: now,
      })
    );
  }

  /**
   * Revoke approval (admin action).
   * Delegates key deletion to the shared implementation, then publishes a
   * real-time event.
   */
  async revokeApproval(contactId: string): Promise<void> {
    await sharedRevokeApproval(redisClient.client, contactId);

    logger.info(`Approval revoked for ${contactId}`);

    // Publish event
    await redisClient.publish(
      REDIS_EVENTS.PAIRING,
      JSON.stringify({
        action: 'revoked',
        contactId,
        timestamp: Date.now(),
      })
    );
  }

  /**
   * List pending pairing requests.
   * Delegates to the shared implementation.
   */
  async listPending(limit: number = 100): Promise<PairingRequest[]> {
    return listPendingRequests(redisClient.client, limit);
  }

  /**
   * List approved contacts.
   * Delegates to the shared implementation.
   */
  async listApproved(limit: number = 1000): Promise<ApprovedContact[]> {
    return listApprovedContacts(redisClient.client, limit);
  }

  /**
   * Update approved contact tier.
   * Delegates to the shared implementation.
   */
  async updateTier(contactId: string, tier: ContactTier): Promise<ApprovedContact | null> {
    const contact = await sharedUpdateContactTier(redisClient.client, contactId, tier);
    if (contact) {
      logger.info(`Updated tier for ${contactId} to ${tier}`);
    }
    return contact;
  }

  /**
   * Get pairing configuration
   */
  getConfig(): PairingConfig {
    return { ...this.config };
  }
}

// Export singleton instance
export const pairingStore = new PairingStore();

// Export class for testing
export { PairingStore };
