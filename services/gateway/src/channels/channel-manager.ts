/**
 * Channel Manager
 * Registry and lifecycle management for all messaging channels.
 *
 * Responsibilities:
 * - Register/unregister channels
 * - Enable/disable channels (controls which ones connect)
 * - Aggregate channel status for dashboard
 * - Lifecycle management (connect/disconnect all)
 * - Graceful shutdown
 */

import type {
  Channel,
  ChannelId,
  ChannelManagerConfig,
  ManagedChannelInfo,
} from '@secondme/shared-types';
import type { ChannelLogger } from './types.js';

// Re-export for convenience
export type { ManagedChannelInfo } from '@secondme/shared-types';

/**
 * Dependencies for the ChannelManager
 */
export interface ChannelManagerDeps {
  /** Logger for manager events */
  logger: ChannelLogger;
  /** Event emitter for socket.io events */
  emitEvent: (event: string, data: unknown) => void;
}

/**
 * Channel Manager
 * Manages registration, lifecycle, and status of all messaging channels.
 */
export class ChannelManager {
  private channels: Map<ChannelId, Channel> = new Map();
  private enabled: Set<ChannelId> = new Set();
  private readonly deps: ChannelManagerDeps;
  private readonly config: ChannelManagerConfig;

  constructor(deps: ChannelManagerDeps, config: ChannelManagerConfig) {
    this.deps = deps;
    this.config = config;
  }

  /**
   * Register a channel (does not connect)
   * @throws Error if channel is already registered
   */
  register(channel: Channel): void {
    if (this.channels.has(channel.id)) {
      throw new Error(`Channel ${channel.id} is already registered`);
    }

    this.channels.set(channel.id, channel);

    this.deps.logger.info(`Channel registered: ${channel.id}`, {
      channelId: channel.id,
      displayName: channel.displayName,
    });

    this.emitStatusUpdate();
  }

  /**
   * Unregister a channel (disconnects first if needed)
   */
  async unregister(channelId: ChannelId): Promise<void> {
    const channel = this.channels.get(channelId);
    if (!channel) {
      this.deps.logger.warn(`Cannot unregister unknown channel: ${channelId}`, {
        channelId,
      });
      return;
    }

    // Disconnect if connected
    if (channel.isConnected()) {
      try {
        await channel.disconnect();
      } catch (error) {
        this.deps.logger.error(`Error disconnecting channel during unregister: ${channelId}`, {
          channelId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Remove from registrations
    this.channels.delete(channelId);
    this.enabled.delete(channelId);

    this.deps.logger.info(`Channel unregistered: ${channelId}`, { channelId });

    this.emitStatusUpdate();
  }

  /**
   * Get a specific channel
   */
  get(channelId: ChannelId): Channel | undefined {
    return this.channels.get(channelId);
  }

  /**
   * Get all registered channels
   */
  getAll(): Channel[] {
    return Array.from(this.channels.values());
  }

  /**
   * Enable a channel and connect it
   * @throws Error if channel is not registered
   */
  async enable(channelId: ChannelId): Promise<void> {
    const channel = this.channels.get(channelId);
    if (!channel) {
      throw new Error(`Cannot enable unregistered channel: ${channelId}`);
    }

    if (this.enabled.has(channelId)) {
      this.deps.logger.debug(`Channel ${channelId} is already enabled`, { channelId });
      return;
    }

    this.enabled.add(channelId);

    this.deps.logger.info(`Channel enabled: ${channelId}`, { channelId });

    // Connect the channel
    try {
      await channel.connect();
    } catch (error) {
      this.deps.logger.error(`Failed to connect channel during enable: ${channelId}`, {
        channelId,
        error: error instanceof Error ? error.message : String(error),
      });
      // Channel remains enabled but in error state
      // The status will reflect the error
    }

    this.emitStatusUpdate();
  }

  /**
   * Disable a channel and disconnect it
   */
  async disable(channelId: ChannelId): Promise<void> {
    const channel = this.channels.get(channelId);
    if (!channel) {
      this.deps.logger.warn(`Cannot disable unknown channel: ${channelId}`, { channelId });
      return;
    }

    if (!this.enabled.has(channelId)) {
      this.deps.logger.debug(`Channel ${channelId} is already disabled`, { channelId });
      return;
    }

    this.enabled.delete(channelId);

    this.deps.logger.info(`Channel disabled: ${channelId}`, { channelId });

    // Disconnect if connected
    if (channel.isConnected()) {
      try {
        await channel.disconnect();
      } catch (error) {
        this.deps.logger.error(`Error disconnecting channel during disable: ${channelId}`, {
          channelId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.emitStatusUpdate();
  }

  /**
   * Check if channel is enabled
   */
  isEnabled(channelId: ChannelId): boolean {
    return this.enabled.has(channelId);
  }

  /**
   * Get status of all channels with enabled state
   */
  async getStatus(): Promise<ManagedChannelInfo[]> {
    const statusList: ManagedChannelInfo[] = [];

    for (const channel of this.channels.values()) {
      // Get contact count (with error handling)
      let contactCount = 0;
      try {
        if (channel.isConnected()) {
          const contacts = await channel.getContacts();
          contactCount = contacts.length;
        }
      } catch {
        // Ignore errors getting contact count
      }

      // Build status object - only include optional fields if they have values
      const status: ManagedChannelInfo = {
        id: channel.id,
        displayName: channel.displayName,
        icon: channel.icon,
        status: channel.status,
        contactCount,
        enabled: this.enabled.has(channel.id),
      };

      statusList.push(status);
    }

    return statusList;
  }

  /**
   * Get status synchronously (without contact counts)
   * Use this for quick status checks and event emission
   */
  getStatusSync(): ManagedChannelInfo[] {
    const statusList: ManagedChannelInfo[] = [];

    for (const channel of this.channels.values()) {
      const status: ManagedChannelInfo = {
        id: channel.id,
        displayName: channel.displayName,
        icon: channel.icon,
        status: channel.status,
        contactCount: 0, // Not fetched in sync mode
        enabled: this.enabled.has(channel.id),
      };

      statusList.push(status);
    }

    return statusList;
  }

  /**
   * Connect all enabled channels
   */
  async connectAll(): Promise<void> {
    const enabledChannels = Array.from(this.enabled)
      .map((id) => this.channels.get(id))
      .filter((ch): ch is Channel => ch !== undefined);

    if (enabledChannels.length === 0) {
      this.deps.logger.info('No enabled channels to connect');
      return;
    }

    this.deps.logger.info(`Connecting ${enabledChannels.length} enabled channel(s)...`, {
      channels: Array.from(this.enabled),
    });

    // Connect all in parallel
    const results = await Promise.allSettled(
      enabledChannels.map(async (channel) => {
        try {
          await channel.connect();
          this.deps.logger.info(`Channel connected: ${channel.id}`, { channelId: channel.id });
        } catch (error) {
          this.deps.logger.error(`Failed to connect channel: ${channel.id}`, {
            channelId: channel.id,
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
      })
    );

    // Log summary
    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    this.deps.logger.info(`Channel connection complete: ${succeeded} succeeded, ${failed} failed`);

    this.emitStatusUpdate();
  }

  /**
   * Disconnect all channels (enabled or not)
   */
  async disconnectAll(): Promise<void> {
    const allChannels = Array.from(this.channels.values());

    if (allChannels.length === 0) {
      return;
    }

    this.deps.logger.info(`Disconnecting ${allChannels.length} channel(s)...`);

    // Disconnect all in parallel
    await Promise.allSettled(
      allChannels.map(async (channel) => {
        if (channel.isConnected()) {
          try {
            await channel.disconnect();
            this.deps.logger.info(`Channel disconnected: ${channel.id}`, {
              channelId: channel.id,
            });
          } catch (error) {
            this.deps.logger.error(`Error disconnecting channel: ${channel.id}`, {
              channelId: channel.id,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      })
    );

    this.emitStatusUpdate();
  }

  /**
   * Graceful shutdown - disconnect all channels
   */
  async shutdown(): Promise<void> {
    this.deps.logger.info('Channel manager shutting down...');

    await this.disconnectAll();

    // Clear registrations
    this.channels.clear();
    this.enabled.clear();

    this.deps.logger.info('Channel manager shutdown complete');
  }

  /**
   * Get manager configuration
   */
  getConfig(): ChannelManagerConfig {
    return { ...this.config };
  }

  /**
   * Emit channel manager status event
   */
  private emitStatusUpdate(): void {
    const status = this.getStatusSync();
    this.deps.emitEvent('channel_manager_status', {
      channels: status,
      timestamp: Date.now(),
    });
  }
}
