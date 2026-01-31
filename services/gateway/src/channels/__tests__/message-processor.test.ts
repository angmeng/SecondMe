/**
 * Tests for GatewayMessageProcessor
 */

import { describe, it, expect, vi } from 'vitest';
import { GatewayMessageProcessor, type MessageProcessorDeps } from '../message-processor.js';
import type { ChannelMessage } from '@secondme/shared-types';
import type { RateLimiter } from '../rate-limiter.js';

// Create mock factories
function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

function createMockRateLimiter(overrides: Partial<RateLimiter> = {}): RateLimiter {
  return {
    check: vi.fn().mockResolvedValue({
      allowed: true,
      currentCount: 1,
      threshold: 10,
      windowSeconds: 60,
      autoPaused: false,
    }),
    reset: vi.fn().mockResolvedValue(undefined),
    getCount: vi.fn().mockResolvedValue(0),
    getConfig: vi.fn().mockReturnValue({
      threshold: 10,
      windowSeconds: 60,
      autoPause: true,
    }),
    ...overrides,
  } as unknown as RateLimiter;
}

function createMockPairingStore() {
  return {
    isApproved: vi.fn().mockResolvedValue(true),
    isDenied: vi.fn().mockResolvedValue(false),
    isAutoApproveExistingEnabled: vi.fn().mockReturnValue(false),
    isAutoReplyUnknownEnabled: vi.fn().mockReturnValue(false),
    getAutoReplyMessage: vi.fn().mockReturnValue('Hello! Your message has been received.'),
    hasConversationHistory: vi.fn().mockResolvedValue(false),
    approveContact: vi.fn().mockResolvedValue({ contactId: 'test@c.us' }),
    createPairingRequest: vi.fn().mockResolvedValue({ success: true }),
  };
}

function createMockHistoryStore() {
  return {
    addMessage: vi.fn().mockResolvedValue(true),
  };
}

function createMockRedisClient() {
  return {
    isPaused: vi.fn().mockResolvedValue(false),
    queueMessage: vi.fn().mockResolvedValue(undefined),
    publish: vi.fn().mockResolvedValue(undefined),
    client: {
      set: vi.fn().mockResolvedValue('OK'),
    },
  };
}

function createTestMessage(overrides: Partial<ChannelMessage> = {}): ChannelMessage {
  return {
    id: 'msg-123',
    version: 2,
    channelId: 'whatsapp',
    contactId: '1234567890@c.us',
    content: 'Hello, world!',
    timestamp: Date.now(),
    ...overrides,
  };
}

function createDeps(overrides: Partial<MessageProcessorDeps> = {}): MessageProcessorDeps {
  return {
    rateLimiter: createMockRateLimiter(),
    pairingStore: createMockPairingStore(),
    historyStore: createMockHistoryStore(),
    redisClient: createMockRedisClient(),
    logger: createMockLogger(),
    emitEvent: vi.fn(),
    ...overrides,
  };
}

describe('GatewayMessageProcessor', () => {
  describe('processMessage', () => {
    describe('approved contacts', () => {
      it('should process message from approved contact and queue it', async () => {
        const deps = createDeps();
        const processor = new GatewayMessageProcessor(deps);
        const message = createTestMessage();

        const result = await processor.processMessage(message, 'John');

        expect(result).toEqual({ processed: true, reason: 'queued' });
        expect(deps.pairingStore.isApproved).toHaveBeenCalledWith('1234567890@c.us');
        expect(deps.historyStore.addMessage).toHaveBeenCalledWith('1234567890@c.us', {
          id: 'msg-123',
          role: 'user',
          content: 'Hello, world!',
          timestamp: expect.any(Number),
          type: 'incoming',
        });
        expect(deps.redisClient.isPaused).toHaveBeenCalledWith('1234567890@c.us');
        expect(deps.rateLimiter.check).toHaveBeenCalledWith('1234567890@c.us', {
          channelId: 'whatsapp',
        });
        expect(deps.redisClient.queueMessage).toHaveBeenCalledWith({
          messageId: 'msg-123',
          contactId: '1234567890@c.us',
          contactName: 'John',
          content: 'Hello, world!',
          timestamp: expect.any(Number),
          hasMedia: false,
          type: 'text',
        });
        expect(deps.emitEvent).toHaveBeenCalledWith('message_received', {
          channelId: 'whatsapp',
          contactId: '1234567890@c.us',
          contactName: 'John',
          timestamp: expect.any(Number),
          preview: 'Hello, world!',
        });
      });

      it('should use "Unknown" as default contact name', async () => {
        const deps = createDeps();
        const processor = new GatewayMessageProcessor(deps);
        const message = createTestMessage();

        await processor.processMessage(message);

        expect(deps.redisClient.queueMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            contactName: 'Unknown',
          })
        );
      });

      it('should detect media messages', async () => {
        const deps = createDeps();
        const processor = new GatewayMessageProcessor(deps);
        const message = createTestMessage({ mediaType: 'image' });

        await processor.processMessage(message, 'John');

        expect(deps.redisClient.queueMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            hasMedia: true,
            type: 'image',
          })
        );
      });

      it('should skip message if contact is paused', async () => {
        const redisClient = createMockRedisClient();
        redisClient.isPaused.mockResolvedValue(true);
        const deps = createDeps({ redisClient });
        const processor = new GatewayMessageProcessor(deps);
        const message = createTestMessage();

        const result = await processor.processMessage(message, 'John');

        expect(result).toEqual({ processed: true, reason: 'paused' });
        expect(deps.historyStore.addMessage).toHaveBeenCalled(); // History still stored
        expect(deps.redisClient.queueMessage).not.toHaveBeenCalled();
        expect(deps.emitEvent).not.toHaveBeenCalledWith('message_received', expect.anything());
      });

      it('should skip message if rate limited', async () => {
        const rateLimiter = createMockRateLimiter({
          check: vi.fn().mockResolvedValue({
            allowed: false,
            currentCount: 11,
            threshold: 10,
            windowSeconds: 60,
            autoPaused: true,
          }),
        });
        const deps = createDeps({ rateLimiter });
        const processor = new GatewayMessageProcessor(deps);
        const message = createTestMessage();

        const result = await processor.processMessage(message, 'John');

        expect(result).toEqual({ processed: true, reason: 'rate_limited' });
        expect(deps.historyStore.addMessage).toHaveBeenCalled(); // History still stored
        expect(deps.redisClient.queueMessage).not.toHaveBeenCalled();
      });

      it('should truncate preview to 50 characters', async () => {
        const deps = createDeps();
        const processor = new GatewayMessageProcessor(deps);
        const longContent = 'A'.repeat(100);
        const message = createTestMessage({ content: longContent });

        await processor.processMessage(message, 'John');

        expect(deps.emitEvent).toHaveBeenCalledWith(
          'message_received',
          expect.objectContaining({
            preview: 'A'.repeat(50),
          })
        );
      });
    });

    describe('unapproved contacts', () => {
      it('should create pending request for unapproved contact', async () => {
        const pairingStore = createMockPairingStore();
        pairingStore.isApproved.mockResolvedValue(false);
        const deps = createDeps({ pairingStore });
        const processor = new GatewayMessageProcessor(deps);
        const message = createTestMessage();

        const result = await processor.processMessage(message, 'John');

        expect(result).toEqual({ processed: true, reason: 'unapproved', pairingRequest: true });
        expect(deps.historyStore.addMessage).not.toHaveBeenCalled(); // No history for unapproved
        expect(deps.redisClient.queueMessage).not.toHaveBeenCalled();
        expect(pairingStore.createPairingRequest).toHaveBeenCalledWith(
          '1234567890@c.us',
          'John',
          undefined,
          'whatsapp',
          'Hello, world!'
        );
        expect(deps.emitEvent).toHaveBeenCalledWith('pairing_request', {
          channelId: 'whatsapp',
          contactId: '1234567890@c.us',
          displayName: 'John',
          phoneNumber: '1234567890',
          firstMessage: 'Hello, world!',
          timestamp: expect.any(Number),
        });
      });

      it('should ignore denied contact in cooldown', async () => {
        const pairingStore = createMockPairingStore();
        pairingStore.isApproved.mockResolvedValue(false);
        pairingStore.isDenied.mockResolvedValue(true);
        const deps = createDeps({ pairingStore });
        const processor = new GatewayMessageProcessor(deps);
        const message = createTestMessage();

        const result = await processor.processMessage(message, 'John');

        expect(result).toEqual({ processed: true, reason: 'denied' });
        expect(pairingStore.createPairingRequest).not.toHaveBeenCalled();
        expect(deps.emitEvent).not.toHaveBeenCalledWith('pairing_request', expect.anything());
      });

      it('should auto-approve existing contact with history', async () => {
        const pairingStore = createMockPairingStore();
        pairingStore.isApproved.mockResolvedValue(false);
        pairingStore.isAutoApproveExistingEnabled.mockReturnValue(true);
        pairingStore.hasConversationHistory.mockResolvedValue(true);
        const deps = createDeps({ pairingStore });
        const processor = new GatewayMessageProcessor(deps);
        const message = createTestMessage();

        const result = await processor.processMessage(message, 'John');

        expect(result).toEqual({ processed: true, reason: 'auto_approved', autoApproved: true });
        expect(pairingStore.approveContact).toHaveBeenCalledWith(
          '1234567890@c.us',
          'system:auto-approve',
          'standard'
        );
        expect(deps.historyStore.addMessage).toHaveBeenCalled();
        expect(deps.redisClient.queueMessage).toHaveBeenCalled();
        expect(deps.emitEvent).toHaveBeenCalledWith('message_received', expect.anything());
      });

      it('should not auto-approve if no history exists', async () => {
        const pairingStore = createMockPairingStore();
        pairingStore.isApproved.mockResolvedValue(false);
        pairingStore.isAutoApproveExistingEnabled.mockReturnValue(true);
        pairingStore.hasConversationHistory.mockResolvedValue(false);
        const deps = createDeps({ pairingStore });
        const processor = new GatewayMessageProcessor(deps);
        const message = createTestMessage();

        const result = await processor.processMessage(message, 'John');

        expect(result).toEqual({ processed: true, reason: 'unapproved', pairingRequest: true });
        expect(pairingStore.approveContact).not.toHaveBeenCalled();
        expect(pairingStore.createPairingRequest).toHaveBeenCalled();
      });

      it('should send auto-reply if enabled', async () => {
        const pairingStore = createMockPairingStore();
        pairingStore.isApproved.mockResolvedValue(false);
        pairingStore.isAutoReplyUnknownEnabled.mockReturnValue(true);
        const sendMessage = vi.fn().mockResolvedValue(undefined);
        const deps = createDeps({ pairingStore, sendMessage });
        const processor = new GatewayMessageProcessor(deps);
        const message = createTestMessage();

        await processor.processMessage(message, 'John');

        expect(sendMessage).toHaveBeenCalledWith(
          '1234567890@c.us',
          'Hello! Your message has been received.'
        );
      });

      it('should not fail if auto-reply fails', async () => {
        const pairingStore = createMockPairingStore();
        pairingStore.isApproved.mockResolvedValue(false);
        pairingStore.isAutoReplyUnknownEnabled.mockReturnValue(true);
        const sendMessage = vi.fn().mockRejectedValue(new Error('Send failed'));
        const deps = createDeps({ pairingStore, sendMessage });
        const processor = new GatewayMessageProcessor(deps);
        const message = createTestMessage();

        const result = await processor.processMessage(message, 'John');

        expect(result).toEqual({ processed: true, reason: 'unapproved', pairingRequest: true });
        expect(deps.logger.error).toHaveBeenCalled();
      });

      it('should handle already_pending status', async () => {
        const pairingStore = createMockPairingStore();
        pairingStore.isApproved.mockResolvedValue(false);
        pairingStore.createPairingRequest.mockResolvedValue({
          success: false,
          reason: 'already_pending',
        });
        const deps = createDeps({ pairingStore });
        const processor = new GatewayMessageProcessor(deps);
        const message = createTestMessage();

        const result = await processor.processMessage(message, 'John');

        expect(result).toEqual({ processed: true, reason: 'unapproved', pairingRequest: false });
        expect(deps.emitEvent).not.toHaveBeenCalledWith('pairing_request', expect.anything());
      });

      it('should handle already_approved race condition', async () => {
        const pairingStore = createMockPairingStore();
        // First call: not approved, then becomes approved during processing
        pairingStore.isApproved
          .mockResolvedValueOnce(false)
          .mockResolvedValueOnce(true);
        pairingStore.createPairingRequest.mockResolvedValue({
          success: false,
          reason: 'already_approved',
        });
        const deps = createDeps({ pairingStore });
        const processor = new GatewayMessageProcessor(deps);
        const message = createTestMessage();

        const result = await processor.processMessage(message, 'John');

        // Should have re-processed and queued
        expect(result).toEqual({ processed: true, reason: 'queued' });
        expect(deps.redisClient.queueMessage).toHaveBeenCalled();
      });

      it('should handle denied_cooldown from createPairingRequest', async () => {
        const pairingStore = createMockPairingStore();
        pairingStore.isApproved.mockResolvedValue(false);
        pairingStore.isDenied.mockResolvedValue(false); // Not denied initially
        pairingStore.createPairingRequest.mockResolvedValue({
          success: false,
          reason: 'denied_cooldown',
        });
        const deps = createDeps({ pairingStore });
        const processor = new GatewayMessageProcessor(deps);
        const message = createTestMessage();

        const result = await processor.processMessage(message, 'John');

        expect(result).toEqual({ processed: true, reason: 'denied' });
      });
    });

    describe('phone number extraction', () => {
      it('should extract phone number from @c.us format', async () => {
        const pairingStore = createMockPairingStore();
        pairingStore.isApproved.mockResolvedValue(false);
        const deps = createDeps({ pairingStore });
        const processor = new GatewayMessageProcessor(deps);
        const message = createTestMessage({ contactId: '1234567890@c.us' });

        await processor.processMessage(message, 'John');

        expect(deps.emitEvent).toHaveBeenCalledWith(
          'pairing_request',
          expect.objectContaining({
            phoneNumber: '1234567890',
          })
        );
      });

      it('should extract phone number from @s.whatsapp.net format', async () => {
        const pairingStore = createMockPairingStore();
        pairingStore.isApproved.mockResolvedValue(false);
        const deps = createDeps({ pairingStore });
        const processor = new GatewayMessageProcessor(deps);
        const message = createTestMessage({ contactId: '1234567890@s.whatsapp.net' });

        await processor.processMessage(message, 'John');

        expect(deps.emitEvent).toHaveBeenCalledWith(
          'pairing_request',
          expect.objectContaining({
            phoneNumber: '1234567890',
          })
        );
      });
    });
  });

  describe('handleFromMe', () => {
    it('should store message in history and auto-pause contact', async () => {
      const deps = createDeps();
      const processor = new GatewayMessageProcessor(deps);

      await processor.handleFromMe('1234567890@c.us', 'msg-123', 'Hi there!', 'whatsapp');

      expect(deps.historyStore.addMessage).toHaveBeenCalledWith('1234567890@c.us', {
        id: 'msg-123',
        role: 'assistant',
        content: 'Hi there!',
        timestamp: expect.any(Number),
        type: 'fromMe',
      });

      expect(deps.redisClient.client.set).toHaveBeenCalledWith(
        'PAUSE:1234567890@c.us',
        expect.stringContaining('"reason":"fromMe"')
      );

      expect(deps.redisClient.publish).toHaveBeenCalledWith(
        'events:pause',
        expect.stringContaining('"action":"pause"')
      );

      expect(deps.emitEvent).toHaveBeenCalledWith('pause_update', {
        channelId: 'whatsapp',
        contactId: '1234567890@c.us',
        action: 'pause',
        reason: 'fromMe',
        pausedAt: expect.any(Number),
        timestamp: expect.any(Number),
      });
    });

    it('should include channelId in events', async () => {
      const deps = createDeps();
      const processor = new GatewayMessageProcessor(deps);

      await processor.handleFromMe('1234567890@c.us', 'msg-123', 'Hi!', 'telegram');

      expect(deps.emitEvent).toHaveBeenCalledWith(
        'pause_update',
        expect.objectContaining({
          channelId: 'telegram',
        })
      );

      expect(deps.redisClient.publish).toHaveBeenCalledWith(
        'events:pause',
        expect.stringContaining('"channelId":"telegram"')
      );
    });
  });

  describe('logging', () => {
    it('should mask contact ID in logs', async () => {
      const deps = createDeps();
      const processor = new GatewayMessageProcessor(deps);
      const message = createTestMessage({ contactId: '1234567890@c.us' });

      await processor.processMessage(message, 'John');

      expect(deps.logger.info).toHaveBeenCalledWith(
        expect.stringContaining('1234****90@c.us'),
        expect.anything()
      );
    });

    it('should not mask short contact IDs', async () => {
      const deps = createDeps();
      const processor = new GatewayMessageProcessor(deps);
      const message = createTestMessage({ contactId: '12345@c.us' });

      await processor.processMessage(message, 'John');

      expect(deps.logger.info).toHaveBeenCalledWith(
        expect.stringContaining('12345@c.us'),
        expect.anything()
      );
    });
  });

  describe('auto-approved contact flow', () => {
    it('should respect pause state for auto-approved contacts', async () => {
      const pairingStore = createMockPairingStore();
      pairingStore.isApproved.mockResolvedValue(false);
      pairingStore.isAutoApproveExistingEnabled.mockReturnValue(true);
      pairingStore.hasConversationHistory.mockResolvedValue(true);
      const redisClient = createMockRedisClient();
      redisClient.isPaused.mockResolvedValue(true);
      const deps = createDeps({ pairingStore, redisClient });
      const processor = new GatewayMessageProcessor(deps);
      const message = createTestMessage();

      const result = await processor.processMessage(message, 'John');

      expect(result).toEqual({ processed: true, reason: 'paused', autoApproved: true });
      expect(pairingStore.approveContact).toHaveBeenCalled();
      expect(deps.historyStore.addMessage).toHaveBeenCalled();
      expect(deps.redisClient.queueMessage).not.toHaveBeenCalled();
    });

    it('should respect rate limit for auto-approved contacts', async () => {
      const pairingStore = createMockPairingStore();
      pairingStore.isApproved.mockResolvedValue(false);
      pairingStore.isAutoApproveExistingEnabled.mockReturnValue(true);
      pairingStore.hasConversationHistory.mockResolvedValue(true);
      const rateLimiter = createMockRateLimiter({
        check: vi.fn().mockResolvedValue({
          allowed: false,
          currentCount: 11,
          threshold: 10,
          windowSeconds: 60,
          autoPaused: true,
        }),
      });
      const deps = createDeps({ pairingStore, rateLimiter });
      const processor = new GatewayMessageProcessor(deps);
      const message = createTestMessage();

      const result = await processor.processMessage(message, 'John');

      expect(result).toEqual({ processed: true, reason: 'rate_limited', autoApproved: true });
      expect(pairingStore.approveContact).toHaveBeenCalled();
      expect(deps.historyStore.addMessage).toHaveBeenCalled();
      expect(deps.redisClient.queueMessage).not.toHaveBeenCalled();
    });
  });
});
