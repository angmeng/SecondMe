/**
 * Security Event Types
 * Types for security-relevant event logging across services
 */

/**
 * Security event types that can be logged
 */
export type SecurityEventType =
  | 'pairing_request' // New contact attempted access
  | 'pairing_approved' // Admin approved contact
  | 'pairing_denied' // Admin denied contact
  | 'pairing_code_attempt' // Code verification attempt (success/failure)
  | 'pairing_revoked' // Admin revoked access
  | 'rate_limit_triggered' // Contact exceeded rate limit
  | 'pause_activated' // Pause triggered
  | 'kill_switch_activated' // Master kill switch
  | 'suspicious_content' // Content flagged by analyzer
  | 'auth_session_created' // WhatsApp session established
  | 'auth_session_expired'; // WhatsApp session lost

/**
 * Security event severity levels
 */
export type SecuritySeverity = 'debug' | 'info' | 'warn' | 'error';

/**
 * Security event data structure
 */
export interface SecurityEvent {
  /** Type of security event */
  event: SecurityEventType;
  /** Contact ID (masked in logs for privacy) */
  contactId?: string;
  /** Additional event-specific details */
  details?: Record<string, unknown>;
  /** Event severity level */
  severity: SecuritySeverity;
}

/**
 * Security event log entry (as stored in logs)
 */
export interface SecurityLogEntry {
  /** ISO timestamp */
  timestamp: string;
  /** Log level */
  level: SecuritySeverity;
  /** Always 'security' for security events */
  category: 'security';
  /** Security event type */
  event: SecurityEventType;
  /** Masked contact ID for privacy */
  contactId?: string;
  /** Additional event details */
  [key: string]: unknown;
}

/**
 * Content analysis flag types
 */
export type ContentFlagType =
  | 'url_suspicious' // URL matches known phishing domains
  | 'url_shortener' // URL uses shortener service
  | 'control_chars' // Contains control characters
  | 'excessive_length' // Exceeds max length threshold
  | 'repeated_pattern' // Contains suspicious repetition
  | 'potential_injection'; // Contains injection-like patterns

/**
 * Content analysis flag
 */
export interface ContentFlag {
  /** Type of content flag */
  type: ContentFlagType;
  /** Description of what was flagged */
  details: string;
  /** Character position in content (if applicable) */
  position?: number;
}

/**
 * Result of content analysis
 */
export interface ContentAnalysis {
  /** Original content (unmodified) */
  original: string;
  /** Flags raised during analysis */
  flags: ContentFlag[];
  /** Aggregated risk score (0-1) */
  riskScore: number;
  /** Whether this content should be logged */
  shouldLog: boolean;
}
