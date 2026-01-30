/**
 * Shared Pairing Types
 * Single source of truth for contact pairing/approval types used by Gateway and Frontend
 *
 * Pairing Mode protects against unauthorized access by requiring approval for unknown contacts.
 */

/**
 * Contact approval tier levels
 * - trusted: Full access, no restrictions
 * - standard: Normal access (default for approved contacts)
 * - restricted: Limited access (future: may have message limits)
 */
export type ContactTier = 'trusted' | 'standard' | 'restricted';

/**
 * Pairing request status
 */
export type PairingStatus = 'pending' | 'approved' | 'denied' | 'expired';

/**
 * Pairing request from an unknown contact
 * Stored in Redis until approved/denied
 * Note: No code or expiry - admin approves directly from dashboard
 */
export interface PairingRequest {
  /** WhatsApp contact ID (e.g., "1234567890@c.us") */
  contactId: string;
  /** Phone number extracted from contactId */
  phoneNumber: string;
  /** Contact's display name (pushname) if available */
  displayName?: string;
  /** Profile picture URL for dashboard display */
  profilePicUrl?: string;
  /** Channel identifier for future multi-channel support */
  channelId?: string;
  /** Unix timestamp when request was created (ms) */
  requestedAt: number;
  /** Current request status */
  status: PairingStatus;
  /** Admin who approved (if approved) */
  approvedBy?: string;
  /** Unix timestamp when approved (ms) */
  approvedAt?: number;
  /** First message content from the contact (for admin context) */
  firstMessage?: string;
}

/**
 * Approved contact record
 * Stored in Redis with no TTL (permanent until revoked)
 */
export interface ApprovedContact {
  /** WhatsApp contact ID */
  contactId: string;
  /** Phone number */
  phoneNumber: string;
  /** Contact's display name */
  displayName?: string;
  /** Profile picture URL */
  profilePicUrl?: string;
  /** Channel identifier for future multi-channel support */
  channelId?: string;
  /** Unix timestamp when approved (ms) */
  approvedAt: number;
  /** Who approved this contact */
  approvedBy: string;
  /** Access tier level */
  tier: ContactTier;
  /** Optional admin notes */
  notes?: string;
}

/**
 * Denied contact record
 * Stored in Redis with TTL (cooldown period before re-pairing allowed)
 */
export interface DeniedContact {
  /** WhatsApp contact ID */
  contactId: string;
  /** Phone number */
  phoneNumber: string;
  /** Contact's display name */
  displayName?: string;
  /** Unix timestamp when denied (ms) */
  deniedAt: number;
  /** Who denied this contact */
  deniedBy: string;
  /** Optional denial reason */
  reason?: string;
  /** Unix timestamp when cooldown expires (ms) */
  expiresAt: number;
}

/**
 * Pairing feature configuration
 */
export interface PairingConfig {
  /** Master switch to enable/disable pairing mode */
  enabled: boolean;
  /** Hours until denied contact can request again (default: 24) */
  denialCooldownHours: number;
  /** Maximum pending requests to keep in Redis (default: 100) */
  maxPendingRequests: number;
  /** Auto-approve contacts with existing conversation history */
  autoApproveExisting: boolean;
  /** Send auto-reply to unknown contacts when they first message */
  autoReplyUnknown: boolean;
  /** Message to send to unknown contacts (if autoReplyUnknown is enabled) */
  autoReplyMessage: string;
}

/**
 * Default pairing configuration values
 */
export const DEFAULT_PAIRING_CONFIG: PairingConfig = {
  enabled: true,
  denialCooldownHours: 24,
  maxPendingRequests: 100,
  autoApproveExisting: true,
  autoReplyUnknown: false,
  autoReplyMessage: 'Your message has been received. Please wait for approval.',
};

/**
 * Result of pairing request creation
 */
export type CreatePairingResult =
  | { success: true; request: PairingRequest }
  | { success: false; reason: 'already_approved' | 'already_pending' | 'denied_cooldown' };
