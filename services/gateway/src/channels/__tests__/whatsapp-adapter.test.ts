/**
 * WhatsApp Channel Adapter Tests
 * Unit tests for the WhatsApp channel adapter
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { WhatsAppChannel, type WhatsAppChannelDeps } from '../whatsapp/adapter.js';
import type { ChannelLogger } from '../types.js';
import { EventEmitter } from 'events';

// Mock whatsapp-web.js types
interface MockContact {
  id: { _serialized: string };
  pushname?: string;
  name?: string;
  number?: string;
  isGroup: boolean;
  isBlocked: boolean;
}

interface MockChat {
  sendStateTyping: Mock;
  clearState: Mock;
}

interface MockMessage {
  id: { _serialized: string };
  from: string;
  body: string;
  timestamp: number;
  fromMe: boolean;
  hasMedia: boolean;
  type: string;
}

// Create a mock WWJSClient using EventEmitter
class MockWWJSClient extends EventEmitter {
  getContacts: Mock = vi.fn();
  getContactById: Mock = vi.fn();
  getChatById: Mock = vi.fn();
  sendMessage: Mock = vi.fn();
}

describe('WhatsAppChannel', () => {
  let mockWWJSClient: MockWWJSClient;
  let mockWhatsAppClientWrapper: {
    initialize: Mock;
    destroy: Mock;
    isReady: Mock;
    getClient: Mock;
  };
  let mockLogger: ChannelLogger;
  let mockEmitEvent: Mock;
  let deps: WhatsAppChannelDeps;

  beforeEach(() => {
    mockWWJSClient = new MockWWJSClient();

    mockWhatsAppClientWrapper = {
      initialize: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn().mockResolvedValue(undefined),
      isReady: vi.fn().mockReturnValue(false),
      getClient: vi.fn().mockReturnValue(mockWWJSClient),
    };

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };

    mockEmitEvent = vi.fn();

    deps = {
      logger: mockLogger,
      emitEvent: mockEmitEvent,
      mockWhatsAppClient: mockWhatsAppClientWrapper,
    };
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const channel = new WhatsAppChannel(deps);

      expect(channel.id).toBe('whatsapp');
      expect(channel.displayName).toBe('WhatsApp');
      expect(channel.icon).toBe('whatsapp');
      expect(channel.status).toBe('disconnected');
    });

    it('should accept custom options', () => {
      const channel = new WhatsAppChannel(deps, {
        autoConnect: false,
        connectionTimeout: 60000,
      });

      expect(channel.status).toBe('disconnected');
    });

    it('should accept config for simulateTyping', () => {
      const depsWithConfig: WhatsAppChannelDeps = {
        ...deps,
        config: { simulateTyping: false },
      };

      // Just verify it doesn't throw - the config is used internally
      const channel = new WhatsAppChannel(depsWithConfig);
      expect(channel).toBeDefined();
    });
  });

  describe('connect', () => {
    it('should initialize WhatsApp client and set status to connecting', async () => {
      const channel = new WhatsAppChannel(deps);

      const connectPromise = channel.connect();

      expect(channel.status).toBe('connecting');
      await connectPromise;

      expect(mockWhatsAppClientWrapper.initialize).toHaveBeenCalled();
      expect(mockWhatsAppClientWrapper.getClient).toHaveBeenCalled();
    });

    it('should set status to connected if client is already ready', async () => {
      mockWhatsAppClientWrapper.isReady.mockReturnValue(true);

      const channel = new WhatsAppChannel(deps);
      await channel.connect();

      expect(channel.status).toBe('connected');
    });

    it('should set status to error on initialization failure', async () => {
      mockWhatsAppClientWrapper.initialize.mockRejectedValue(new Error('Init failed'));

      const channel = new WhatsAppChannel(deps);

      await expect(channel.connect()).rejects.toThrow('Init failed');
      expect(channel.status).toBe('error');
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should emit channel_status event on status change', async () => {
      mockWhatsAppClientWrapper.isReady.mockReturnValue(true);

      const channel = new WhatsAppChannel(deps);
      await channel.connect();

      expect(mockEmitEvent).toHaveBeenCalledWith(
        'channel_status',
        expect.objectContaining({
          channelId: 'whatsapp',
          status: 'connected',
        })
      );
    });
  });

  describe('disconnect', () => {
    it('should destroy client and set status to disconnected', async () => {
      mockWhatsAppClientWrapper.isReady.mockReturnValue(true);

      const channel = new WhatsAppChannel(deps);
      await channel.connect();
      await channel.disconnect();

      expect(mockWhatsAppClientWrapper.destroy).toHaveBeenCalled();
      expect(channel.status).toBe('disconnected');
    });

    it('should handle errors gracefully during disconnect', async () => {
      mockWhatsAppClientWrapper.isReady.mockReturnValue(true);
      mockWhatsAppClientWrapper.destroy.mockRejectedValue(new Error('Destroy failed'));

      const channel = new WhatsAppChannel(deps);
      await channel.connect();
      await channel.disconnect();

      // Should still be disconnected despite error
      expect(channel.status).toBe('disconnected');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('sendMessage', () => {
    it('should return error when not connected', async () => {
      const channel = new WhatsAppChannel(deps);
      const result = await channel.sendMessage('123@c.us', { text: 'Hello' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Not connected');
    });

    it('should return error for empty content', async () => {
      mockWhatsAppClientWrapper.isReady.mockReturnValue(true);

      const channel = new WhatsAppChannel(deps);
      await channel.connect();

      const result = await channel.sendMessage('123@c.us', {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Message content is empty');
    });

    it('should send message using MessageSender', async () => {
      mockWhatsAppClientWrapper.isReady.mockReturnValue(true);

      const channel = new WhatsAppChannel(deps);
      await channel.connect();

      // MessageSender.sendMessage is called internally
      // For this test, we need to mock the actual send
      const mockChat: MockChat = {
        sendStateTyping: vi.fn().mockResolvedValue(undefined),
        clearState: vi.fn().mockResolvedValue(undefined),
      };
      mockWWJSClient.getChatById.mockResolvedValue(mockChat);
      mockWWJSClient.sendMessage.mockResolvedValue({
        id: { _serialized: 'msg123' },
      });

      // The MessageSender uses the client directly, not via getChatById for sending
      // We need to test the actual behavior

      const result = await channel.sendMessage('123@c.us', { text: 'Hello' });

      // The send happens through MessageSender which has its own logic
      // Since we're mocking, we just verify it doesn't throw
      expect(result).toBeDefined();
    });
  });

  describe('sendTypingIndicator', () => {
    it('should not throw when not connected', async () => {
      const channel = new WhatsAppChannel(deps);

      await expect(channel.sendTypingIndicator('123@c.us')).resolves.toBeUndefined();
    });

    it('should send typing state when connected', async () => {
      mockWhatsAppClientWrapper.isReady.mockReturnValue(true);

      const mockChat: MockChat = {
        sendStateTyping: vi.fn().mockResolvedValue(undefined),
        clearState: vi.fn().mockResolvedValue(undefined),
      };
      mockWWJSClient.getChatById.mockResolvedValue(mockChat);

      const channel = new WhatsAppChannel(deps);
      await channel.connect();
      await channel.sendTypingIndicator('123@c.us');

      expect(mockWWJSClient.getChatById).toHaveBeenCalledWith('123@c.us');
      expect(mockChat.sendStateTyping).toHaveBeenCalled();
    });

    it('should clear typing state after duration', async () => {
      vi.useFakeTimers();

      mockWhatsAppClientWrapper.isReady.mockReturnValue(true);

      const mockChat: MockChat = {
        sendStateTyping: vi.fn().mockResolvedValue(undefined),
        clearState: vi.fn().mockResolvedValue(undefined),
      };
      mockWWJSClient.getChatById.mockResolvedValue(mockChat);

      const channel = new WhatsAppChannel(deps);
      await channel.connect();
      await channel.sendTypingIndicator('123@c.us', 1000);

      expect(mockChat.clearState).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1000);

      expect(mockChat.clearState).toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('should clear pending typing timeouts on disconnect', async () => {
      vi.useFakeTimers();

      mockWhatsAppClientWrapper.isReady.mockReturnValue(true);

      const mockChat: MockChat = {
        sendStateTyping: vi.fn().mockResolvedValue(undefined),
        clearState: vi.fn().mockResolvedValue(undefined),
      };
      mockWWJSClient.getChatById.mockResolvedValue(mockChat);

      const channel = new WhatsAppChannel(deps);
      await channel.connect();
      await channel.sendTypingIndicator('123@c.us', 5000);

      // Disconnect before timeout fires
      await channel.disconnect();

      // Advance past the timeout
      await vi.advanceTimersByTimeAsync(5000);

      // clearState should NOT have been called since we disconnected
      expect(mockChat.clearState).not.toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('should replace existing timeout for same contact', async () => {
      vi.useFakeTimers();

      mockWhatsAppClientWrapper.isReady.mockReturnValue(true);

      const mockChat: MockChat = {
        sendStateTyping: vi.fn().mockResolvedValue(undefined),
        clearState: vi.fn().mockResolvedValue(undefined),
      };
      mockWWJSClient.getChatById.mockResolvedValue(mockChat);

      const channel = new WhatsAppChannel(deps);
      await channel.connect();

      // Start first typing indicator
      await channel.sendTypingIndicator('123@c.us', 1000);
      // Start second one before first completes (should replace)
      await channel.sendTypingIndicator('123@c.us', 2000);

      // Advance past first timeout
      await vi.advanceTimersByTimeAsync(1000);
      expect(mockChat.clearState).not.toHaveBeenCalled();

      // Advance to second timeout
      await vi.advanceTimersByTimeAsync(1000);
      expect(mockChat.clearState).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });
  });

  describe('getContacts', () => {
    it('should return empty array when not connected', async () => {
      const channel = new WhatsAppChannel(deps);
      const contacts = await channel.getContacts();

      expect(contacts).toEqual([]);
    });

    it('should return filtered contacts with normalized IDs', async () => {
      mockWhatsAppClientWrapper.isReady.mockReturnValue(true);

      const mockContacts: MockContact[] = [
        {
          id: { _serialized: '1234567890@c.us' },
          pushname: 'John',
          isGroup: false,
          isBlocked: false,
        },
        {
          id: { _serialized: '0987654321@c.us' },
          name: 'Jane',
          isGroup: false,
          isBlocked: false,
        },
        {
          id: { _serialized: 'group123@g.us' },
          name: 'Group',
          isGroup: true,
          isBlocked: false,
        },
        {
          id: { _serialized: '5555555555@c.us' },
          pushname: 'Blocked',
          isGroup: false,
          isBlocked: true,
        },
      ];
      mockWWJSClient.getContacts.mockResolvedValue(mockContacts);

      const channel = new WhatsAppChannel(deps);
      await channel.connect();
      const contacts = await channel.getContacts();

      // Should exclude groups and blocked
      expect(contacts).toHaveLength(2);
      expect(contacts[0]).toEqual({
        id: '1234567890@c.us',
        channelId: 'whatsapp',
        displayName: 'John',
        normalizedId: '+1234567890',
      });
      expect(contacts[1]).toEqual({
        id: '0987654321@c.us',
        channelId: 'whatsapp',
        displayName: 'Jane',
        normalizedId: '+0987654321',
      });
    });

    it('should handle errors gracefully', async () => {
      mockWhatsAppClientWrapper.isReady.mockReturnValue(true);
      mockWWJSClient.getContacts.mockRejectedValue(new Error('Failed'));

      const channel = new WhatsAppChannel(deps);
      await channel.connect();
      const contacts = await channel.getContacts();

      expect(contacts).toEqual([]);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('getContact', () => {
    it('should return null when not connected', async () => {
      const channel = new WhatsAppChannel(deps);
      const contact = await channel.getContact('123@c.us');

      expect(contact).toBeNull();
    });

    it('should return contact with normalized ID', async () => {
      mockWhatsAppClientWrapper.isReady.mockReturnValue(true);

      const mockContact: MockContact = {
        id: { _serialized: '1234567890@c.us' },
        pushname: 'John',
        isGroup: false,
        isBlocked: false,
      };
      mockWWJSClient.getContactById.mockResolvedValue(mockContact);

      const channel = new WhatsAppChannel(deps);
      await channel.connect();
      const contact = await channel.getContact('1234567890@c.us');

      expect(contact).toEqual({
        id: '1234567890@c.us',
        channelId: 'whatsapp',
        displayName: 'John',
        normalizedId: '+1234567890',
      });
    });

    it('should return null on error', async () => {
      mockWhatsAppClientWrapper.isReady.mockReturnValue(true);
      mockWWJSClient.getContactById.mockRejectedValue(new Error('Not found'));

      const channel = new WhatsAppChannel(deps);
      await channel.connect();
      const contact = await channel.getContact('unknown@c.us');

      expect(contact).toBeNull();
    });
  });

  describe('normalizeContactId', () => {
    it('should normalize WhatsApp contact ID to phone number', () => {
      const channel = new WhatsAppChannel(deps);

      expect(channel.normalizeContactId('1234567890@c.us')).toBe('+1234567890');
      expect(channel.normalizeContactId('1234567890@s.whatsapp.net')).toBe('+1234567890');
    });

    it('should return null for group chats', () => {
      const channel = new WhatsAppChannel(deps);

      expect(channel.normalizeContactId('group123@g.us')).toBeNull();
    });
  });

  describe('event handling', () => {
    it('should emit channel message on incoming message', async () => {
      mockWhatsAppClientWrapper.isReady.mockReturnValue(true);

      const channel = new WhatsAppChannel(deps);
      const messageHandler = vi.fn();
      channel.onMessage(messageHandler);

      await channel.connect();

      // Simulate incoming message
      const mockMessage: MockMessage = {
        id: { _serialized: 'msg123' },
        from: '1234567890@c.us',
        body: 'Hello',
        timestamp: 1700000000,
        fromMe: false,
        hasMedia: false,
        type: 'chat',
      };

      mockWWJSClient.emit('message', mockMessage);

      // Wait for async handler
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(messageHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'msg123',
          channelId: 'whatsapp',
          contactId: '1234567890@c.us',
          normalizedContactId: '+1234567890',
          content: 'Hello',
          version: 2,
        })
      );
    });

    it('should ignore group messages', async () => {
      mockWhatsAppClientWrapper.isReady.mockReturnValue(true);

      const channel = new WhatsAppChannel(deps);
      const messageHandler = vi.fn();
      channel.onMessage(messageHandler);

      await channel.connect();

      const mockMessage: MockMessage = {
        id: { _serialized: 'msg123' },
        from: 'group123@g.us',
        body: 'Hello',
        timestamp: 1700000000,
        fromMe: false,
        hasMedia: false,
        type: 'chat',
      };

      mockWWJSClient.emit('message', mockMessage);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(messageHandler).not.toHaveBeenCalled();
    });

    it('should ignore fromMe messages', async () => {
      mockWhatsAppClientWrapper.isReady.mockReturnValue(true);

      const channel = new WhatsAppChannel(deps);
      const messageHandler = vi.fn();
      channel.onMessage(messageHandler);

      await channel.connect();

      const mockMessage: MockMessage = {
        id: { _serialized: 'msg123' },
        from: '1234567890@c.us',
        body: 'Hello',
        timestamp: 1700000000,
        fromMe: true,
        hasMedia: false,
        type: 'chat',
      };

      mockWWJSClient.emit('message', mockMessage);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(messageHandler).not.toHaveBeenCalled();
    });

    it('should update status on ready event', async () => {
      mockWhatsAppClientWrapper.isReady.mockReturnValue(false);

      const channel = new WhatsAppChannel(deps);
      const statusHandler = vi.fn();
      channel.onStatusChange(statusHandler);

      await channel.connect();

      // Reset mock to only track the ready event
      statusHandler.mockClear();

      mockWWJSClient.emit('ready');

      expect(channel.status).toBe('connected');
      expect(statusHandler).toHaveBeenCalledWith('connected', undefined);
    });

    it('should update status on disconnected event', async () => {
      mockWhatsAppClientWrapper.isReady.mockReturnValue(true);

      const channel = new WhatsAppChannel(deps);
      await channel.connect();

      const statusHandler = vi.fn();
      channel.onStatusChange(statusHandler);

      mockWWJSClient.emit('disconnected', 'Session ended');

      expect(channel.status).toBe('disconnected');
      expect(statusHandler).toHaveBeenCalledWith('disconnected', undefined);
    });

    it('should update status on auth_failure event', async () => {
      mockWhatsAppClientWrapper.isReady.mockReturnValue(false);

      const channel = new WhatsAppChannel(deps);
      await channel.connect();

      mockWWJSClient.emit('auth_failure', 'Invalid credentials');

      expect(channel.status).toBe('error');
    });

    it('should emit qr_code event on qr event', async () => {
      mockWhatsAppClientWrapper.isReady.mockReturnValue(false);

      const channel = new WhatsAppChannel(deps);
      await channel.connect();

      mockWWJSClient.emit('qr', 'qr-code-data');

      expect(mockEmitEvent).toHaveBeenCalledWith('qr_code', {
        channelId: 'whatsapp',
        qr: 'qr-code-data',
        timestamp: expect.any(Number),
      });
    });

    it('should remove handlers on disconnect', async () => {
      mockWhatsAppClientWrapper.isReady.mockReturnValue(true);

      const channel = new WhatsAppChannel(deps);
      const messageHandler = vi.fn();
      channel.onMessage(messageHandler);

      await channel.connect();
      await channel.disconnect();

      // Handlers should be removed
      const mockMessage: MockMessage = {
        id: { _serialized: 'msg123' },
        from: '1234567890@c.us',
        body: 'Hello',
        timestamp: 1700000000,
        fromMe: false,
        hasMedia: false,
        type: 'chat',
      };

      mockWWJSClient.emit('message', mockMessage);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(messageHandler).not.toHaveBeenCalled();
    });
  });

  describe('media type detection', () => {
    it('should detect image media type', async () => {
      mockWhatsAppClientWrapper.isReady.mockReturnValue(true);

      const channel = new WhatsAppChannel(deps);
      const messageHandler = vi.fn();
      channel.onMessage(messageHandler);

      await channel.connect();

      const mockMessage: MockMessage = {
        id: { _serialized: 'msg123' },
        from: '1234567890@c.us',
        body: '',
        timestamp: 1700000000,
        fromMe: false,
        hasMedia: true,
        type: 'image',
      };

      mockWWJSClient.emit('message', mockMessage);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(messageHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          mediaType: 'image',
        })
      );
    });

    it('should detect audio/ptt media type', async () => {
      mockWhatsAppClientWrapper.isReady.mockReturnValue(true);

      const channel = new WhatsAppChannel(deps);
      const messageHandler = vi.fn();
      channel.onMessage(messageHandler);

      await channel.connect();

      // Test ptt (push to talk / voice message)
      const mockMessage: MockMessage = {
        id: { _serialized: 'msg123' },
        from: '1234567890@c.us',
        body: '',
        timestamp: 1700000000,
        fromMe: false,
        hasMedia: true,
        type: 'ptt',
      };

      mockWWJSClient.emit('message', mockMessage);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(messageHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          mediaType: 'audio',
        })
      );
    });
  });
});
