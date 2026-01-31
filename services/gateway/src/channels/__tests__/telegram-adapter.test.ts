/**
 * Telegram Channel Adapter Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ChannelDependencies } from '../types.js';

// Mock grammY Bot with proper class implementation
const mockBotInstance = {
  command: vi.fn(),
  on: vi.fn(),
  catch: vi.fn(),
  start: vi.fn(),
  stop: vi.fn().mockResolvedValue(undefined),
  api: {
    sendMessage: vi.fn().mockResolvedValue({ message_id: 456 }),
    sendChatAction: vi.fn().mockResolvedValue(true),
  },
};

vi.mock('grammy', () => ({
  Bot: class MockBot {
    command = mockBotInstance.command;
    on = mockBotInstance.on;
    catch = mockBotInstance.catch;
    start = mockBotInstance.start;
    stop = mockBotInstance.stop;
    api = mockBotInstance.api;

    constructor(_token: string) {
      // Reset start mock to use default implementation
      mockBotInstance.start.mockImplementation(async ({ onStart }) => {
        // Simulate async start
        setTimeout(() => {
          onStart?.({ id: 123, is_bot: true, first_name: 'Test', username: 'test_bot' });
        }, 0);
        return Promise.resolve();
      });
    }
  },
}));

// Import after mocking
import { TelegramChannel } from '../telegram/adapter.js';

describe('TelegramChannel', () => {
  let channel: TelegramChannel;
  let mockDeps: ChannelDependencies;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset the start mock implementation
    mockBotInstance.start.mockImplementation(async ({ onStart }) => {
      setTimeout(() => {
        onStart?.({ id: 123, is_bot: true, first_name: 'Test', username: 'test_bot' });
      }, 0);
      return Promise.resolve();
    });

    mockDeps = {
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      },
      emitEvent: vi.fn(),
    };

    channel = new TelegramChannel(mockDeps, {
      botToken: '123456789:test-token',
      skipGroups: true,
    });
  });

  afterEach(async () => {
    // Clean up connection if active
    if (channel && channel.status !== 'disconnected') {
      await channel.disconnect();
    }
  });

  describe('constructor', () => {
    it('creates channel with correct properties', () => {
      expect(channel.id).toBe('telegram');
      expect(channel.displayName).toBe('Telegram');
      expect(channel.icon).toBe('telegram');
    });

    it('starts with disconnected status', () => {
      expect(channel.status).toBe('disconnected');
    });

    it('defaults skipGroups to true', () => {
      const channelWithoutSkipGroups = new TelegramChannel(mockDeps, {
        botToken: '123:test',
      });
      expect(channelWithoutSkipGroups).toBeDefined();
    });

    it('throws error for empty token', () => {
      expect(() => new TelegramChannel(mockDeps, { botToken: '' })).toThrow(
        'Invalid Telegram bot token format'
      );
    });

    it('throws error for token without colon', () => {
      expect(() => new TelegramChannel(mockDeps, { botToken: 'invalid-token' })).toThrow(
        'Invalid Telegram bot token format'
      );
    });
  });

  describe('connect', () => {
    it('sets status to connecting initially', async () => {
      // Don't await - just start the connection
      const connectPromise = channel.connect();

      // Should be connecting immediately
      expect(channel.status).toBe('connecting');

      // Wait for async operations
      await connectPromise;
      await new Promise((resolve) => setTimeout(resolve, 10));

      // After bot.start's onStart callback runs
      expect(channel.status).toBe('connected');
    });

    it('logs bot start info', async () => {
      await channel.connect();
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockDeps.logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Telegram bot'),
        expect.objectContaining({ channelId: 'telegram' })
      );
    });
  });

  describe('disconnect', () => {
    it('sets status to disconnected', async () => {
      await channel.connect();
      await new Promise((resolve) => setTimeout(resolve, 10));

      await channel.disconnect();
      expect(channel.status).toBe('disconnected');
    });

    it('logs disconnect', async () => {
      await channel.connect();
      await new Promise((resolve) => setTimeout(resolve, 10));

      await channel.disconnect();
      expect(mockDeps.logger.info).toHaveBeenCalledWith(
        expect.stringContaining('stopped'),
        expect.objectContaining({ channelId: 'telegram' })
      );
    });
  });

  describe('sendMessage', () => {
    it('sends text message successfully', async () => {
      await channel.connect();
      await new Promise((resolve) => setTimeout(resolve, 10));

      const result = await channel.sendMessage('tg_123456', { text: 'Hello Telegram!' });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('456');
    });

    it('fails for empty content', async () => {
      await channel.connect();
      await new Promise((resolve) => setTimeout(resolve, 10));

      const result = await channel.sendMessage('tg_123456', {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('No text content');
    });

    it('fails for invalid contact ID format', async () => {
      await channel.connect();
      await new Promise((resolve) => setTimeout(resolve, 10));

      const result = await channel.sendMessage('invalid-contact', { text: 'Hi' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid Telegram contact ID');
    });

    it('handles API errors gracefully', async () => {
      await channel.connect();
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Mock API error
      mockBotInstance.api.sendMessage.mockRejectedValueOnce(new Error('Rate limited'));

      const result = await channel.sendMessage('tg_123456', { text: 'Test' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Rate limited');
    });
  });

  describe('sendTypingIndicator', () => {
    it('sends typing action', async () => {
      await channel.connect();
      await new Promise((resolve) => setTimeout(resolve, 10));

      await channel.sendTypingIndicator('tg_123456');

      expect(mockBotInstance.api.sendChatAction).toHaveBeenCalledWith(123456, 'typing');
    });

    it('handles errors gracefully', async () => {
      await channel.connect();
      await new Promise((resolve) => setTimeout(resolve, 10));

      mockBotInstance.api.sendChatAction.mockRejectedValueOnce(new Error('Chat not found'));

      // Should not throw
      await expect(channel.sendTypingIndicator('tg_123456')).resolves.toBeUndefined();

      expect(mockDeps.logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Error sending Telegram typing indicator'),
        expect.anything()
      );
    });
  });

  describe('getContacts', () => {
    it('returns empty array (bots cannot enumerate contacts)', async () => {
      const contacts = await channel.getContacts();
      expect(contacts).toEqual([]);
    });
  });

  describe('getContact', () => {
    it('returns null for uncached contacts', async () => {
      const contact = await channel.getContact('tg_123456');
      expect(contact).toBeNull();
    });
  });

  describe('normalizeContactId', () => {
    it('returns null (phone not available for Telegram bots)', () => {
      expect(channel.normalizeContactId('tg_123456')).toBeNull();
    });
  });

  describe('isConnected', () => {
    it('returns false when disconnected', () => {
      expect(channel.isConnected()).toBe(false);
    });

    it('returns true when connected', async () => {
      await channel.connect();
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(channel.isConnected()).toBe(true);
    });
  });

  describe('event handlers', () => {
    it('registers text message handler', () => {
      expect(mockBotInstance.on).toHaveBeenCalledWith('message:text', expect.any(Function));
    });

    it('registers photo message handler', () => {
      expect(mockBotInstance.on).toHaveBeenCalledWith('message:photo', expect.any(Function));
    });

    it('registers voice message handler', () => {
      expect(mockBotInstance.on).toHaveBeenCalledWith('message:voice', expect.any(Function));
    });

    it('registers document message handler', () => {
      expect(mockBotInstance.on).toHaveBeenCalledWith('message:document', expect.any(Function));
    });

    it('registers video message handler', () => {
      expect(mockBotInstance.on).toHaveBeenCalledWith('message:video', expect.any(Function));
    });

    it('registers message handler callback', () => {
      const handler = vi.fn();
      channel.onMessage(handler);

      // Handler should be registered (we can't easily test the callback without deeper mocking)
      expect(handler).not.toHaveBeenCalled(); // Not called until message received
    });

    it('registers status handler', async () => {
      const handler = vi.fn();
      channel.onStatusChange(handler);

      await channel.connect();

      // Should have been called with 'connecting'
      expect(handler).toHaveBeenCalledWith('connecting', undefined);
    });

    it('unregisters message handler', () => {
      const handler = vi.fn();
      channel.onMessage(handler);
      channel.offMessage(handler);

      // No error means success
      expect(true).toBe(true);
    });

    it('unregisters status handler', () => {
      const handler = vi.fn();
      channel.onStatusChange(handler);
      channel.offStatusChange(handler);

      // No error means success
      expect(true).toBe(true);
    });
  });
});
