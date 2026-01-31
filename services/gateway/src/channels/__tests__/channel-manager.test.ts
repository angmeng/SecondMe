/**
 * Channel Manager Tests
 * Unit tests for the ChannelManager class
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { ChannelManager, type ChannelManagerDeps } from '../channel-manager.js';
import type { ChannelLogger } from '../types.js';
import type {
  Channel,
  ChannelId,
  ChannelStatus,
  ChannelContact,
  ChannelMessage,
  MessageContent,
  SendResult,
  ChannelManagerConfig,
} from '@secondme/shared-types';

/**
 * Create a mock channel for testing
 */
function createMockChannel(
  id: ChannelId,
  overrides: Partial<{
    status: ChannelStatus;
    isConnected: boolean;
    connectError: Error | null;
    disconnectError: Error | null;
    contacts: ChannelContact[];
  }> = {}
): Channel & { mockConnect: Mock; mockDisconnect: Mock } {
  const {
    status = 'disconnected',
    isConnected = false,
    connectError = null,
    disconnectError = null,
    contacts = [],
  } = overrides;

  let currentStatus: ChannelStatus = status;
  let connected = isConnected;

  const mockConnect = vi.fn().mockImplementation(async () => {
    if (connectError) throw connectError;
    connected = true;
    currentStatus = 'connected';
  });

  const mockDisconnect = vi.fn().mockImplementation(async () => {
    if (disconnectError) throw disconnectError;
    connected = false;
    currentStatus = 'disconnected';
  });

  return {
    id,
    displayName: `${id.charAt(0).toUpperCase()}${id.slice(1)}`,
    icon: id,
    get status() {
      return currentStatus;
    },
    connect: mockConnect,
    disconnect: mockDisconnect,
    isConnected: () => connected,
    sendMessage: vi.fn().mockResolvedValue({ success: true } as SendResult),
    sendTypingIndicator: vi.fn().mockResolvedValue(undefined),
    onMessage: vi.fn(),
    offMessage: vi.fn(),
    onStatusChange: vi.fn(),
    offStatusChange: vi.fn(),
    getContacts: vi.fn().mockResolvedValue(contacts),
    getContact: vi.fn().mockResolvedValue(null),
    normalizeContactId: vi.fn().mockReturnValue(null),
    mockConnect,
    mockDisconnect,
  };
}

describe('ChannelManager', () => {
  let mockLogger: ChannelLogger;
  let mockEmitEvent: Mock;
  let deps: ChannelManagerDeps;
  let config: ChannelManagerConfig;

  beforeEach(() => {
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
    };

    config = {
      enabled: true,
      contactLinkingEnabled: false,
      defaultChannel: 'whatsapp',
    };
  });

  describe('register/unregister', () => {
    it('should register a channel', () => {
      const manager = new ChannelManager(deps, config);
      const channel = createMockChannel('whatsapp');

      manager.register(channel);

      expect(manager.get('whatsapp')).toBe(channel);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Channel registered: whatsapp',
        expect.objectContaining({ channelId: 'whatsapp' })
      );
    });

    it('should emit status update after registration', () => {
      const manager = new ChannelManager(deps, config);
      const channel = createMockChannel('whatsapp');

      manager.register(channel);

      expect(mockEmitEvent).toHaveBeenCalledWith(
        'channel_manager_status',
        expect.objectContaining({
          channels: expect.arrayContaining([
            expect.objectContaining({
              id: 'whatsapp',
              enabled: false,
            }),
          ]),
        })
      );
    });

    it('should throw if channel already registered', () => {
      const manager = new ChannelManager(deps, config);
      const channel = createMockChannel('whatsapp');

      manager.register(channel);

      expect(() => manager.register(channel)).toThrow('Channel whatsapp is already registered');
    });

    it('should unregister a channel', async () => {
      const manager = new ChannelManager(deps, config);
      const channel = createMockChannel('whatsapp');

      manager.register(channel);
      await manager.unregister('whatsapp');

      expect(manager.get('whatsapp')).toBeUndefined();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Channel unregistered: whatsapp',
        expect.objectContaining({ channelId: 'whatsapp' })
      );
    });

    it('should disconnect channel when unregistering if connected', async () => {
      const manager = new ChannelManager(deps, config);
      const channel = createMockChannel('whatsapp', { isConnected: true });

      manager.register(channel);
      await manager.unregister('whatsapp');

      expect(channel.mockDisconnect).toHaveBeenCalled();
    });

    it('should handle unregister of unknown channel gracefully', async () => {
      const manager = new ChannelManager(deps, config);

      await manager.unregister('whatsapp');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Cannot unregister unknown channel: whatsapp',
        expect.objectContaining({ channelId: 'whatsapp' })
      );
    });

    it('should handle disconnect error during unregister gracefully', async () => {
      const manager = new ChannelManager(deps, config);
      const channel = createMockChannel('whatsapp', {
        isConnected: true,
        disconnectError: new Error('Disconnect failed'),
      });

      manager.register(channel);
      await manager.unregister('whatsapp');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error disconnecting channel during unregister: whatsapp',
        expect.objectContaining({
          channelId: 'whatsapp',
          error: 'Disconnect failed',
        })
      );
      // Should still unregister despite error
      expect(manager.get('whatsapp')).toBeUndefined();
    });
  });

  describe('enable/disable', () => {
    it('should connect channel when enabled', async () => {
      const manager = new ChannelManager(deps, config);
      const channel = createMockChannel('whatsapp');

      manager.register(channel);
      await manager.enable('whatsapp');

      expect(channel.mockConnect).toHaveBeenCalled();
      expect(manager.isEnabled('whatsapp')).toBe(true);
    });

    it('should emit status event on enable', async () => {
      const manager = new ChannelManager(deps, config);
      const channel = createMockChannel('whatsapp');

      manager.register(channel);
      mockEmitEvent.mockClear();
      await manager.enable('whatsapp');

      expect(mockEmitEvent).toHaveBeenCalledWith(
        'channel_manager_status',
        expect.objectContaining({
          channels: expect.arrayContaining([
            expect.objectContaining({
              id: 'whatsapp',
              enabled: true,
            }),
          ]),
        })
      );
    });

    it('should throw when enabling unregistered channel', async () => {
      const manager = new ChannelManager(deps, config);

      await expect(manager.enable('whatsapp')).rejects.toThrow(
        'Cannot enable unregistered channel: whatsapp'
      );
    });

    it('should handle enable of already enabled channel', async () => {
      const manager = new ChannelManager(deps, config);
      const channel = createMockChannel('whatsapp');

      manager.register(channel);
      await manager.enable('whatsapp');
      await manager.enable('whatsapp');

      // Should only connect once
      expect(channel.mockConnect).toHaveBeenCalledTimes(1);
    });

    it('should handle connect error during enable', async () => {
      const manager = new ChannelManager(deps, config);
      const channel = createMockChannel('whatsapp', {
        connectError: new Error('Connection failed'),
      });

      manager.register(channel);
      await manager.enable('whatsapp');

      // Should be enabled despite error
      expect(manager.isEnabled('whatsapp')).toBe(true);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to connect channel during enable: whatsapp',
        expect.objectContaining({
          channelId: 'whatsapp',
          error: 'Connection failed',
        })
      );
    });

    it('should disconnect channel when disabled', async () => {
      const manager = new ChannelManager(deps, config);
      const channel = createMockChannel('whatsapp', { isConnected: true });

      manager.register(channel);
      await manager.enable('whatsapp');
      await manager.disable('whatsapp');

      expect(channel.mockDisconnect).toHaveBeenCalled();
      expect(manager.isEnabled('whatsapp')).toBe(false);
    });

    it('should emit status event on disable', async () => {
      const manager = new ChannelManager(deps, config);
      const channel = createMockChannel('whatsapp', { isConnected: true });

      manager.register(channel);
      await manager.enable('whatsapp');
      mockEmitEvent.mockClear();
      await manager.disable('whatsapp');

      expect(mockEmitEvent).toHaveBeenCalledWith(
        'channel_manager_status',
        expect.objectContaining({
          channels: expect.arrayContaining([
            expect.objectContaining({
              id: 'whatsapp',
              enabled: false,
            }),
          ]),
        })
      );
    });

    it('should handle disable of unknown channel', async () => {
      const manager = new ChannelManager(deps, config);

      await manager.disable('whatsapp');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Cannot disable unknown channel: whatsapp',
        expect.objectContaining({ channelId: 'whatsapp' })
      );
    });

    it('should handle disable of already disabled channel', async () => {
      const manager = new ChannelManager(deps, config);
      const channel = createMockChannel('whatsapp');

      manager.register(channel);
      await manager.disable('whatsapp');

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Channel whatsapp is already disabled',
        expect.objectContaining({ channelId: 'whatsapp' })
      );
    });
  });

  describe('get/getAll', () => {
    it('should return undefined for unknown channel', () => {
      const manager = new ChannelManager(deps, config);

      expect(manager.get('whatsapp')).toBeUndefined();
    });

    it('should return all registered channels', () => {
      const manager = new ChannelManager(deps, config);
      const whatsapp = createMockChannel('whatsapp');
      const telegram = createMockChannel('telegram');

      manager.register(whatsapp);
      manager.register(telegram);

      const all = manager.getAll();
      expect(all).toHaveLength(2);
      expect(all).toContain(whatsapp);
      expect(all).toContain(telegram);
    });

    it('should return empty array when no channels registered', () => {
      const manager = new ChannelManager(deps, config);

      expect(manager.getAll()).toEqual([]);
    });
  });

  describe('getStatus', () => {
    it('should return status of all channels', async () => {
      const manager = new ChannelManager(deps, config);
      const whatsapp = createMockChannel('whatsapp', {
        status: 'connected',
        isConnected: true,
        contacts: [
          { id: '123@c.us', channelId: 'whatsapp' },
          { id: '456@c.us', channelId: 'whatsapp' },
        ],
      });

      manager.register(whatsapp);
      await manager.enable('whatsapp');

      const status = await manager.getStatus();

      expect(status).toHaveLength(1);
      expect(status[0]).toEqual(
        expect.objectContaining({
          id: 'whatsapp',
          displayName: 'Whatsapp',
          icon: 'whatsapp',
          status: 'connected',
          contactCount: 2,
          enabled: true,
        })
      );
    });

    it('should include enabled flag', async () => {
      const manager = new ChannelManager(deps, config);
      const whatsapp = createMockChannel('whatsapp');
      const telegram = createMockChannel('telegram');

      manager.register(whatsapp);
      manager.register(telegram);
      await manager.enable('whatsapp');

      const status = await manager.getStatus();

      const whatsappStatus = status.find((s) => s.id === 'whatsapp');
      const telegramStatus = status.find((s) => s.id === 'telegram');

      expect(whatsappStatus?.enabled).toBe(true);
      expect(telegramStatus?.enabled).toBe(false);
    });

    it('should return zero contacts for disconnected channels', async () => {
      const manager = new ChannelManager(deps, config);
      const whatsapp = createMockChannel('whatsapp', {
        status: 'disconnected',
        isConnected: false,
      });

      manager.register(whatsapp);

      const status = await manager.getStatus();

      expect(status[0]?.contactCount).toBe(0);
    });

    it('should handle error getting contacts gracefully', async () => {
      const manager = new ChannelManager(deps, config);
      const whatsapp = createMockChannel('whatsapp', {
        status: 'connected',
        isConnected: true,
      });
      (whatsapp.getContacts as Mock).mockRejectedValue(new Error('Failed to get contacts'));

      manager.register(whatsapp);

      const status = await manager.getStatus();

      expect(status[0]?.contactCount).toBe(0);
    });
  });

  describe('getStatusSync', () => {
    it('should return status without contact counts', () => {
      const manager = new ChannelManager(deps, config);
      const whatsapp = createMockChannel('whatsapp', { status: 'connected' });

      manager.register(whatsapp);

      const status = manager.getStatusSync();

      expect(status).toHaveLength(1);
      expect(status[0]).toEqual(
        expect.objectContaining({
          id: 'whatsapp',
          status: 'connected',
          contactCount: 0,
          enabled: false,
        })
      );
    });
  });

  describe('connectAll/disconnectAll', () => {
    it('should only connect enabled channels', async () => {
      const manager = new ChannelManager(deps, config);
      const whatsapp = createMockChannel('whatsapp');
      const telegram = createMockChannel('telegram');

      manager.register(whatsapp);
      manager.register(telegram);
      await manager.enable('whatsapp');

      // Clear the connect call from enable
      whatsapp.mockConnect.mockClear();

      await manager.connectAll();

      // Only whatsapp should be connected (it was already connected by enable)
      expect(whatsapp.mockConnect).toHaveBeenCalled();
      expect(telegram.mockConnect).not.toHaveBeenCalled();
    });

    it('should log when no enabled channels', async () => {
      const manager = new ChannelManager(deps, config);
      const whatsapp = createMockChannel('whatsapp');

      manager.register(whatsapp);

      await manager.connectAll();

      expect(mockLogger.info).toHaveBeenCalledWith('No enabled channels to connect');
    });

    it('should handle individual channel failures gracefully', async () => {
      const manager = new ChannelManager(deps, config);
      const whatsapp = createMockChannel('whatsapp', {
        connectError: new Error('WhatsApp failed'),
      });
      const telegram = createMockChannel('telegram');

      manager.register(whatsapp);
      manager.register(telegram);
      await manager.enable('whatsapp');
      await manager.enable('telegram');

      // Clear mocks from enable calls
      whatsapp.mockConnect.mockClear();
      telegram.mockConnect.mockClear();

      await manager.connectAll();

      // Both should have been attempted
      expect(whatsapp.mockConnect).toHaveBeenCalled();
      expect(telegram.mockConnect).toHaveBeenCalled();

      // Error should be logged
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to connect channel: whatsapp',
        expect.objectContaining({ error: 'WhatsApp failed' })
      );
    });

    it('should disconnect all channels in parallel', async () => {
      const manager = new ChannelManager(deps, config);
      const whatsapp = createMockChannel('whatsapp', { isConnected: true });
      const telegram = createMockChannel('telegram', { isConnected: true });

      manager.register(whatsapp);
      manager.register(telegram);

      await manager.disconnectAll();

      expect(whatsapp.mockDisconnect).toHaveBeenCalled();
      expect(telegram.mockDisconnect).toHaveBeenCalled();
    });

    it('should only disconnect connected channels', async () => {
      const manager = new ChannelManager(deps, config);
      const whatsapp = createMockChannel('whatsapp', { isConnected: true });
      const telegram = createMockChannel('telegram', { isConnected: false });

      manager.register(whatsapp);
      manager.register(telegram);

      await manager.disconnectAll();

      expect(whatsapp.mockDisconnect).toHaveBeenCalled();
      expect(telegram.mockDisconnect).not.toHaveBeenCalled();
    });

    it('should handle disconnect errors gracefully', async () => {
      const manager = new ChannelManager(deps, config);
      const whatsapp = createMockChannel('whatsapp', {
        isConnected: true,
        disconnectError: new Error('Disconnect failed'),
      });

      manager.register(whatsapp);

      await manager.disconnectAll();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error disconnecting channel: whatsapp',
        expect.objectContaining({ error: 'Disconnect failed' })
      );
    });
  });

  describe('shutdown', () => {
    it('should disconnect all channels', async () => {
      const manager = new ChannelManager(deps, config);
      const whatsapp = createMockChannel('whatsapp', { isConnected: true });

      manager.register(whatsapp);

      await manager.shutdown();

      expect(whatsapp.mockDisconnect).toHaveBeenCalled();
    });

    it('should clear all registrations', async () => {
      const manager = new ChannelManager(deps, config);
      const whatsapp = createMockChannel('whatsapp');

      manager.register(whatsapp);
      await manager.enable('whatsapp');

      await manager.shutdown();

      expect(manager.get('whatsapp')).toBeUndefined();
      expect(manager.getAll()).toEqual([]);
      expect(manager.isEnabled('whatsapp')).toBe(false);
    });

    it('should log shutdown messages', async () => {
      const manager = new ChannelManager(deps, config);

      await manager.shutdown();

      expect(mockLogger.info).toHaveBeenCalledWith('Channel manager shutting down...');
      expect(mockLogger.info).toHaveBeenCalledWith('Channel manager shutdown complete');
    });
  });

  describe('getConfig', () => {
    it('should return a copy of the configuration', () => {
      const manager = new ChannelManager(deps, config);

      const returnedConfig = manager.getConfig();

      expect(returnedConfig).toEqual(config);
      expect(returnedConfig).not.toBe(config); // Should be a copy
    });
  });

  describe('multiple channels', () => {
    it('should manage multiple channels independently', async () => {
      const manager = new ChannelManager(deps, config);
      const whatsapp = createMockChannel('whatsapp');
      const telegram = createMockChannel('telegram');
      const discord = createMockChannel('discord');

      manager.register(whatsapp);
      manager.register(telegram);
      manager.register(discord);

      await manager.enable('whatsapp');
      await manager.enable('telegram');

      expect(manager.isEnabled('whatsapp')).toBe(true);
      expect(manager.isEnabled('telegram')).toBe(true);
      expect(manager.isEnabled('discord')).toBe(false);

      const status = manager.getStatusSync();
      expect(status).toHaveLength(3);
    });
  });
});
