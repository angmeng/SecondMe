/**
 * Channel Router Tests
 * Unit tests for the ChannelRouter class
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { ChannelRouter, type ChannelRouterDeps } from '../channel-router.js';
import type { ChannelManager } from '../channel-manager.js';
import type { GatewayMessageProcessor } from '../message-processor.js';
import type { ChannelLogger, MessageHandler } from '../types.js';
import type {
  Channel,
  ChannelId,
  ChannelStatus,
  ChannelContact,
  ChannelMessage,
  MessageContent,
  SendResult,
} from '@secondme/shared-types';

/**
 * Create a mock channel for testing
 */
function createMockChannel(
  id: ChannelId,
  overrides: Partial<{
    isConnected: boolean;
    contacts: Map<string, ChannelContact>;
    sendResult: SendResult;
  }> = {}
): Channel & {
  mockOnMessage: Mock;
  mockOffMessage: Mock;
  mockSendMessage: Mock;
  mockGetContact: Mock;
  registeredHandlers: MessageHandler[];
} {
  const { isConnected = true, contacts = new Map(), sendResult = { success: true } } = overrides;

  const registeredHandlers: MessageHandler[] = [];

  const mockOnMessage = vi.fn((handler: MessageHandler) => {
    registeredHandlers.push(handler);
  });

  const mockOffMessage = vi.fn((handler: MessageHandler) => {
    const index = registeredHandlers.indexOf(handler);
    if (index !== -1) {
      registeredHandlers.splice(index, 1);
    }
  });

  const mockSendMessage = vi.fn().mockResolvedValue(sendResult);

  const mockGetContact = vi.fn(async (contactId: string) => {
    return contacts.get(contactId) || null;
  });

  return {
    id,
    displayName: `${id.charAt(0).toUpperCase()}${id.slice(1)}`,
    icon: id,
    status: isConnected ? 'connected' : 'disconnected',
    connect: vi.fn(),
    disconnect: vi.fn(),
    isConnected: () => isConnected,
    sendMessage: mockSendMessage,
    sendTypingIndicator: vi.fn(),
    onMessage: mockOnMessage,
    offMessage: mockOffMessage,
    onStatusChange: vi.fn(),
    offStatusChange: vi.fn(),
    getContacts: vi.fn().mockResolvedValue(Array.from(contacts.values())),
    getContact: mockGetContact,
    normalizeContactId: vi.fn().mockReturnValue(null),
    mockOnMessage,
    mockOffMessage,
    mockSendMessage,
    mockGetContact,
    registeredHandlers,
  };
}

/**
 * Create a mock channel manager
 */
function createMockChannelManager(
  channels: Channel[]
): ChannelManager & { mockGet: Mock; mockGetAll: Mock } {
  const channelMap = new Map(channels.map((c) => [c.id, c]));

  const mockGet = vi.fn((id: ChannelId) => channelMap.get(id));
  const mockGetAll = vi.fn(() => channels);

  return {
    get: mockGet,
    getAll: mockGetAll,
    mockGet,
    mockGetAll,
  } as unknown as ChannelManager & { mockGet: Mock; mockGetAll: Mock };
}

/**
 * Create a mock message processor
 */
function createMockMessageProcessor(): GatewayMessageProcessor & { mockProcessMessage: Mock } {
  const mockProcessMessage = vi.fn().mockResolvedValue({ processed: true, reason: 'queued' });

  return {
    processMessage: mockProcessMessage,
    mockProcessMessage,
  } as unknown as GatewayMessageProcessor & { mockProcessMessage: Mock };
}

/**
 * Create a test channel message
 */
function createTestMessage(overrides: Partial<ChannelMessage> = {}): ChannelMessage {
  return {
    id: 'msg123',
    version: 2,
    channelId: 'whatsapp',
    contactId: '1234567890@c.us',
    content: 'Hello',
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('ChannelRouter', () => {
  let mockLogger: ChannelLogger;
  let mockChannelManager: ChannelManager & { mockGet: Mock; mockGetAll: Mock };
  let mockMessageProcessor: GatewayMessageProcessor & { mockProcessMessage: Mock };
  let deps: ChannelRouterDeps;

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };

    mockChannelManager = createMockChannelManager([]);
    mockMessageProcessor = createMockMessageProcessor();

    deps = {
      channelManager: mockChannelManager,
      messageProcessor: mockMessageProcessor,
      logger: mockLogger,
    };
  });

  describe('setupRoutes', () => {
    it('should register message handlers on all channels', () => {
      const whatsapp = createMockChannel('whatsapp');
      const telegram = createMockChannel('telegram');

      mockChannelManager = createMockChannelManager([whatsapp, telegram]);
      deps.channelManager = mockChannelManager;

      const router = new ChannelRouter(deps);
      router.setupRoutes();

      expect(whatsapp.mockOnMessage).toHaveBeenCalledTimes(1);
      expect(telegram.mockOnMessage).toHaveBeenCalledTimes(1);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Routes set up for 2 channel(s)',
        expect.objectContaining({ channels: ['whatsapp', 'telegram'] })
      );
    });

    it('should route incoming messages to processor', async () => {
      const contacts = new Map<string, ChannelContact>([
        ['1234567890@c.us', { id: '1234567890@c.us', channelId: 'whatsapp', displayName: 'John' }],
      ]);
      const whatsapp = createMockChannel('whatsapp', { contacts });

      mockChannelManager = createMockChannelManager([whatsapp]);
      deps.channelManager = mockChannelManager;

      const router = new ChannelRouter(deps);
      router.setupRoutes();

      // Simulate incoming message
      const testMessage = createTestMessage();
      await whatsapp.registeredHandlers[0]?.(testMessage);

      expect(mockMessageProcessor.mockProcessMessage).toHaveBeenCalledWith(testMessage, 'John');
    });

    it('should include contact name lookup', async () => {
      const contacts = new Map<string, ChannelContact>([
        ['1234567890@c.us', { id: '1234567890@c.us', channelId: 'whatsapp', displayName: 'Alice' }],
      ]);
      const whatsapp = createMockChannel('whatsapp', { contacts });

      mockChannelManager = createMockChannelManager([whatsapp]);
      deps.channelManager = mockChannelManager;

      const router = new ChannelRouter(deps);
      router.setupRoutes();

      const testMessage = createTestMessage({ contactId: '1234567890@c.us' });
      await whatsapp.registeredHandlers[0]?.(testMessage);

      expect(whatsapp.mockGetContact).toHaveBeenCalledWith('1234567890@c.us');
      expect(mockMessageProcessor.mockProcessMessage).toHaveBeenCalledWith(testMessage, 'Alice');
    });

    it('should use "Unknown" when contact not found', async () => {
      const whatsapp = createMockChannel('whatsapp');

      mockChannelManager = createMockChannelManager([whatsapp]);
      deps.channelManager = mockChannelManager;

      const router = new ChannelRouter(deps);
      router.setupRoutes();

      const testMessage = createTestMessage();
      await whatsapp.registeredHandlers[0]?.(testMessage);

      expect(mockMessageProcessor.mockProcessMessage).toHaveBeenCalledWith(testMessage, 'Unknown');
    });

    it('should handle channel errors gracefully', async () => {
      const whatsapp = createMockChannel('whatsapp');
      mockMessageProcessor.mockProcessMessage.mockRejectedValue(new Error('Process failed'));

      mockChannelManager = createMockChannelManager([whatsapp]);
      deps.channelManager = mockChannelManager;

      const router = new ChannelRouter(deps);
      router.setupRoutes();

      const testMessage = createTestMessage();

      // Should not throw
      await expect(whatsapp.registeredHandlers[0]?.(testMessage)).resolves.toBeUndefined();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error processing message from whatsapp',
        expect.objectContaining({ error: 'Process failed' })
      );
    });

    it('should log when no channels registered', () => {
      mockChannelManager = createMockChannelManager([]);
      deps.channelManager = mockChannelManager;

      const router = new ChannelRouter(deps);
      router.setupRoutes();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Routes set up for 0 channel(s)',
        expect.objectContaining({ channels: [] })
      );
    });
  });

  describe('removeRoutes', () => {
    it('should remove all registered handlers', () => {
      const whatsapp = createMockChannel('whatsapp');
      const telegram = createMockChannel('telegram');

      mockChannelManager = createMockChannelManager([whatsapp, telegram]);
      deps.channelManager = mockChannelManager;

      const router = new ChannelRouter(deps);
      router.setupRoutes();

      expect(whatsapp.registeredHandlers).toHaveLength(1);
      expect(telegram.registeredHandlers).toHaveLength(1);

      router.removeRoutes();

      expect(whatsapp.mockOffMessage).toHaveBeenCalled();
      expect(telegram.mockOffMessage).toHaveBeenCalled();
      expect(whatsapp.registeredHandlers).toHaveLength(0);
      expect(telegram.registeredHandlers).toHaveLength(0);
    });

    it('should handle missing channels gracefully', () => {
      const whatsapp = createMockChannel('whatsapp');

      mockChannelManager = createMockChannelManager([whatsapp]);
      deps.channelManager = mockChannelManager;

      const router = new ChannelRouter(deps);
      router.setupRoutes();

      // Simulate channel being unregistered
      mockChannelManager.mockGet.mockReturnValue(undefined);

      // Should not throw
      expect(() => router.removeRoutes()).not.toThrow();
    });
  });

  describe('routeOutgoing', () => {
    it('should send to correct channel', async () => {
      const whatsapp = createMockChannel('whatsapp', {
        sendResult: { success: true, messageId: 'sent123' },
      });

      mockChannelManager = createMockChannelManager([whatsapp]);
      deps.channelManager = mockChannelManager;

      const router = new ChannelRouter(deps);
      const content: MessageContent = { text: 'Hello' };
      const result = await router.routeOutgoing('whatsapp', '123@c.us', content);

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('sent123');
      expect(whatsapp.mockSendMessage).toHaveBeenCalledWith('123@c.us', content);
    });

    it('should return error if channel not found', async () => {
      mockChannelManager = createMockChannelManager([]);
      deps.channelManager = mockChannelManager;

      const router = new ChannelRouter(deps);
      const result = await router.routeOutgoing('whatsapp', '123@c.us', { text: 'Hello' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Channel not found: whatsapp');
    });

    it('should return error if channel disconnected', async () => {
      const whatsapp = createMockChannel('whatsapp', { isConnected: false });

      mockChannelManager = createMockChannelManager([whatsapp]);
      deps.channelManager = mockChannelManager;

      const router = new ChannelRouter(deps);
      const result = await router.routeOutgoing('whatsapp', '123@c.us', { text: 'Hello' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Channel not connected: whatsapp');
    });

    it('should handle send errors gracefully', async () => {
      const whatsapp = createMockChannel('whatsapp');
      whatsapp.mockSendMessage.mockRejectedValue(new Error('Send failed'));

      mockChannelManager = createMockChannelManager([whatsapp]);
      deps.channelManager = mockChannelManager;

      const router = new ChannelRouter(deps);
      const result = await router.routeOutgoing('whatsapp', '123@c.us', { text: 'Hello' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Send failed');
    });

    it('should handle failed send result', async () => {
      const whatsapp = createMockChannel('whatsapp', {
        sendResult: { success: false, error: 'Message rejected' },
      });

      mockChannelManager = createMockChannelManager([whatsapp]);
      deps.channelManager = mockChannelManager;

      const router = new ChannelRouter(deps);
      const result = await router.routeOutgoing('whatsapp', '123@c.us', { text: 'Hello' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Message rejected');
    });
  });

  describe('getContactName', () => {
    it('should lookup contact from correct channel', async () => {
      const contacts = new Map<string, ChannelContact>([
        ['123@c.us', { id: '123@c.us', channelId: 'whatsapp', displayName: 'Bob' }],
      ]);
      const whatsapp = createMockChannel('whatsapp', { contacts });

      mockChannelManager = createMockChannelManager([whatsapp]);
      deps.channelManager = mockChannelManager;

      const router = new ChannelRouter(deps);
      const name = await router.getContactName('whatsapp', '123@c.us');

      expect(name).toBe('Bob');
    });

    it('should return "Unknown" if contact not found', async () => {
      const whatsapp = createMockChannel('whatsapp');

      mockChannelManager = createMockChannelManager([whatsapp]);
      deps.channelManager = mockChannelManager;

      const router = new ChannelRouter(deps);
      const name = await router.getContactName('whatsapp', 'unknown@c.us');

      expect(name).toBe('Unknown');
    });

    it('should return "Unknown" if channel not found', async () => {
      mockChannelManager = createMockChannelManager([]);
      deps.channelManager = mockChannelManager;

      const router = new ChannelRouter(deps);
      const name = await router.getContactName('whatsapp', '123@c.us');

      expect(name).toBe('Unknown');
    });

    it('should return "Unknown" on error', async () => {
      const whatsapp = createMockChannel('whatsapp');
      whatsapp.mockGetContact.mockRejectedValue(new Error('Lookup failed'));

      mockChannelManager = createMockChannelManager([whatsapp]);
      deps.channelManager = mockChannelManager;

      const router = new ChannelRouter(deps);
      const name = await router.getContactName('whatsapp', '123@c.us');

      expect(name).toBe('Unknown');
    });

    it('should return "Unknown" if contact has no displayName', async () => {
      const contacts = new Map<string, ChannelContact>([
        ['123@c.us', { id: '123@c.us', channelId: 'whatsapp' }], // No displayName
      ]);
      const whatsapp = createMockChannel('whatsapp', { contacts });

      mockChannelManager = createMockChannelManager([whatsapp]);
      deps.channelManager = mockChannelManager;

      const router = new ChannelRouter(deps);
      const name = await router.getContactName('whatsapp', '123@c.us');

      expect(name).toBe('Unknown');
    });
  });

  describe('getChannelFromContactId', () => {
    it('should return whatsapp for @c.us format', () => {
      expect(ChannelRouter.getChannelFromContactId('1234567890@c.us')).toBe('whatsapp');
    });

    it('should return whatsapp for @s.whatsapp.net format', () => {
      expect(ChannelRouter.getChannelFromContactId('1234567890@s.whatsapp.net')).toBe('whatsapp');
    });

    it('should return telegram for tg_ format', () => {
      expect(ChannelRouter.getChannelFromContactId('tg_123456789')).toBe('telegram');
      expect(ChannelRouter.getChannelFromContactId('tg_1')).toBe('telegram');
    });

    it('should return whatsapp as default for unknown format', () => {
      expect(ChannelRouter.getChannelFromContactId('unknown-format')).toBe('whatsapp');
      expect(ChannelRouter.getChannelFromContactId('telegram:123456')).toBe('whatsapp');
      expect(ChannelRouter.getChannelFromContactId('')).toBe('whatsapp');
    });
  });

  describe('contact ID masking', () => {
    it('should mask contact IDs in logs', async () => {
      const whatsapp = createMockChannel('whatsapp');

      mockChannelManager = createMockChannelManager([whatsapp]);
      deps.channelManager = mockChannelManager;

      const router = new ChannelRouter(deps);
      router.setupRoutes();

      const testMessage = createTestMessage({ contactId: '1234567890@c.us' });
      await whatsapp.registeredHandlers[0]?.(testMessage);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Routing incoming message from whatsapp',
        expect.objectContaining({
          contactId: '1234****90@c.us',
        })
      );
    });

    it('should not mask short contact IDs', async () => {
      const whatsapp = createMockChannel('whatsapp');

      mockChannelManager = createMockChannelManager([whatsapp]);
      deps.channelManager = mockChannelManager;

      const router = new ChannelRouter(deps);
      router.setupRoutes();

      const testMessage = createTestMessage({ contactId: '123@c.us' });
      await whatsapp.registeredHandlers[0]?.(testMessage);

      // Short IDs should not be masked
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Routing incoming message from whatsapp',
        expect.objectContaining({
          contactId: '123@c.us',
        })
      );
    });
  });

  describe('multiple channels', () => {
    it('should route messages from multiple channels', async () => {
      const whatsappContacts = new Map<string, ChannelContact>([
        ['wa123@c.us', { id: 'wa123@c.us', channelId: 'whatsapp', displayName: 'WhatsApp User' }],
      ]);
      const telegramContacts = new Map<string, ChannelContact>([
        ['tg123', { id: 'tg123', channelId: 'telegram', displayName: 'Telegram User' }],
      ]);

      const whatsapp = createMockChannel('whatsapp', { contacts: whatsappContacts });
      const telegram = createMockChannel('telegram', { contacts: telegramContacts });

      mockChannelManager = createMockChannelManager([whatsapp, telegram]);
      deps.channelManager = mockChannelManager;

      const router = new ChannelRouter(deps);
      router.setupRoutes();

      // Message from WhatsApp
      const waMessage = createTestMessage({
        channelId: 'whatsapp',
        contactId: 'wa123@c.us',
      });
      await whatsapp.registeredHandlers[0]?.(waMessage);

      expect(mockMessageProcessor.mockProcessMessage).toHaveBeenCalledWith(
        waMessage,
        'WhatsApp User'
      );

      // Message from Telegram
      const tgMessage = createTestMessage({
        channelId: 'telegram',
        contactId: 'tg123',
      });
      await telegram.registeredHandlers[0]?.(tgMessage);

      expect(mockMessageProcessor.mockProcessMessage).toHaveBeenCalledWith(
        tgMessage,
        'Telegram User'
      );
    });
  });
});
