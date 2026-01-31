/**
 * Channel Type Guards Tests
 * Unit tests for channel-related runtime type guards
 */

import { describe, it, expect } from 'vitest';
import { isChannelId, isChannelMessage, isQueuedMessage } from '../guards.js';

describe('isChannelId', () => {
  it('should return true for valid channel IDs', () => {
    expect(isChannelId('whatsapp')).toBe(true);
    expect(isChannelId('telegram')).toBe(true);
    expect(isChannelId('discord')).toBe(true);
    expect(isChannelId('slack')).toBe(true);
  });

  it('should return false for invalid channel IDs', () => {
    expect(isChannelId('invalid')).toBe(false);
    expect(isChannelId('messenger')).toBe(false);
    expect(isChannelId('sms')).toBe(false);
    expect(isChannelId('')).toBe(false);
  });

  it('should return false for non-string values', () => {
    expect(isChannelId(null)).toBe(false);
    expect(isChannelId(undefined)).toBe(false);
    expect(isChannelId(123)).toBe(false);
    expect(isChannelId({})).toBe(false);
    expect(isChannelId([])).toBe(false);
  });
});

describe('isChannelMessage', () => {
  const validMessage = {
    id: 'msg_123',
    version: 2,
    channelId: 'whatsapp',
    contactId: '1234567890@c.us',
    content: 'Hello, world!',
    timestamp: Date.now(),
  };

  it('should return true for valid channel message', () => {
    expect(isChannelMessage(validMessage)).toBe(true);
  });

  it('should return true for message with all optional fields', () => {
    const fullMessage = {
      ...validMessage,
      normalizedContactId: '+1234567890',
      mediaType: 'image' as const,
      mediaUrl: 'https://example.com/image.jpg',
      replyTo: 'msg_122',
      metadata: { key: 'value' },
    };
    expect(isChannelMessage(fullMessage)).toBe(true);
  });

  it('should return false for missing required fields', () => {
    // Missing id
    expect(isChannelMessage({ ...validMessage, id: undefined })).toBe(false);

    // Missing version
    expect(isChannelMessage({ ...validMessage, version: undefined })).toBe(false);

    // Missing channelId
    expect(isChannelMessage({ ...validMessage, channelId: undefined })).toBe(false);

    // Missing contactId
    expect(isChannelMessage({ ...validMessage, contactId: undefined })).toBe(false);

    // Missing content
    expect(isChannelMessage({ ...validMessage, content: undefined })).toBe(false);

    // Missing timestamp
    expect(isChannelMessage({ ...validMessage, timestamp: undefined })).toBe(false);
  });

  it('should return false for wrong version', () => {
    expect(isChannelMessage({ ...validMessage, version: 1 })).toBe(false);
    expect(isChannelMessage({ ...validMessage, version: 3 })).toBe(false);
    expect(isChannelMessage({ ...validMessage, version: '2' })).toBe(false);
  });

  it('should return false for invalid channel ID', () => {
    expect(isChannelMessage({ ...validMessage, channelId: 'invalid' })).toBe(false);
  });

  it('should return false for invalid media type', () => {
    expect(isChannelMessage({ ...validMessage, mediaType: 'invalid' })).toBe(false);
  });

  it('should return true for all valid media types', () => {
    expect(isChannelMessage({ ...validMessage, mediaType: 'text' })).toBe(true);
    expect(isChannelMessage({ ...validMessage, mediaType: 'image' })).toBe(true);
    expect(isChannelMessage({ ...validMessage, mediaType: 'audio' })).toBe(true);
    expect(isChannelMessage({ ...validMessage, mediaType: 'video' })).toBe(true);
    expect(isChannelMessage({ ...validMessage, mediaType: 'document' })).toBe(true);
  });

  it('should return false for non-object values', () => {
    expect(isChannelMessage(null)).toBe(false);
    expect(isChannelMessage(undefined)).toBe(false);
    expect(isChannelMessage('string')).toBe(false);
    expect(isChannelMessage(123)).toBe(false);
    expect(isChannelMessage([])).toBe(false);
  });

  it('should return false for empty string id or contactId', () => {
    expect(isChannelMessage({ ...validMessage, id: '' })).toBe(false);
    expect(isChannelMessage({ ...validMessage, contactId: '' })).toBe(false);
  });

  it('should return false for null metadata', () => {
    expect(isChannelMessage({ ...validMessage, metadata: null })).toBe(false);
  });
});

describe('isQueuedMessage', () => {
  const validQueuedMessage = {
    version: 2,
    messageId: 'msg_123',
    channelId: 'whatsapp',
    contactId: '1234567890@c.us',
    content: 'Hello, world!',
    timestamp: Date.now(),
  };

  it('should return true for valid v2 queued message', () => {
    expect(isQueuedMessage(validQueuedMessage)).toBe(true);
  });

  it('should return true for valid v1 queued message (legacy)', () => {
    const v1Message = {
      version: 1,
      messageId: 'msg_123',
      contactId: '1234567890@c.us',
      content: 'Hello, world!',
      timestamp: Date.now(),
    };
    expect(isQueuedMessage(v1Message)).toBe(true);
  });

  it('should return true for message without version (legacy v1)', () => {
    const legacyMessage = {
      messageId: 'msg_123',
      contactId: '1234567890@c.us',
      content: 'Hello, world!',
      timestamp: Date.now(),
    };
    expect(isQueuedMessage(legacyMessage)).toBe(true);
  });

  it('should return true for message with all optional fields', () => {
    const fullMessage = {
      ...validQueuedMessage,
      normalizedContactId: '+1234567890',
      contactName: 'John Doe',
      metadata: { source: 'test' },
    };
    expect(isQueuedMessage(fullMessage)).toBe(true);
  });

  it('should return false for missing required fields', () => {
    // Missing messageId
    expect(isQueuedMessage({ ...validQueuedMessage, messageId: undefined })).toBe(false);

    // Missing contactId
    expect(isQueuedMessage({ ...validQueuedMessage, contactId: undefined })).toBe(false);

    // Missing content
    expect(isQueuedMessage({ ...validQueuedMessage, content: undefined })).toBe(false);

    // Missing timestamp
    expect(isQueuedMessage({ ...validQueuedMessage, timestamp: undefined })).toBe(false);
  });

  it('should return false for invalid version', () => {
    expect(isQueuedMessage({ ...validQueuedMessage, version: 3 })).toBe(false);
    expect(isQueuedMessage({ ...validQueuedMessage, version: 0 })).toBe(false);
    expect(isQueuedMessage({ ...validQueuedMessage, version: '2' })).toBe(false);
  });

  it('should return false for non-object values', () => {
    expect(isQueuedMessage(null)).toBe(false);
    expect(isQueuedMessage(undefined)).toBe(false);
    expect(isQueuedMessage('string')).toBe(false);
    expect(isQueuedMessage(123)).toBe(false);
    expect(isQueuedMessage([])).toBe(false);
  });

  it('should return false for v2 message without channelId', () => {
    const v2WithoutChannel = {
      version: 2,
      messageId: 'msg_123',
      contactId: '1234567890@c.us',
      content: 'Hello, world!',
      timestamp: Date.now(),
      // channelId is missing - should fail for v2
    };
    expect(isQueuedMessage(v2WithoutChannel)).toBe(false);
  });

  it('should return false for v2 message with invalid channelId', () => {
    const v2InvalidChannel = {
      version: 2,
      messageId: 'msg_123',
      channelId: 'invalid_channel',
      contactId: '1234567890@c.us',
      content: 'Hello, world!',
      timestamp: Date.now(),
    };
    expect(isQueuedMessage(v2InvalidChannel)).toBe(false);
  });

  it('should return false for empty string messageId or contactId', () => {
    expect(isQueuedMessage({ ...validQueuedMessage, messageId: '' })).toBe(false);
    expect(isQueuedMessage({ ...validQueuedMessage, contactId: '' })).toBe(false);
  });

  it('should return false for null metadata', () => {
    expect(isQueuedMessage({ ...validQueuedMessage, metadata: null })).toBe(false);
  });
});
