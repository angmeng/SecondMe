/**
 * Human Typing Simulation (HTS) - Sleep Hours Checker
 * T089: Checks if the current time falls within the user's configured sleep hours
 *
 * During sleep hours, the bot will NOT respond to messages (to appear more human-like).
 * Messages received during sleep hours are queued and processed when sleep hours end.
 */

import { redisClient } from '../redis/client.js';

export interface SleepHoursConfig {
  /** Whether sleep hours are enabled */
  enabled: boolean;
  /** Sleep start hour (0-23) - e.g., 23 for 11 PM */
  startHour: number;
  /** Sleep start minute (0-59) */
  startMinute: number;
  /** Wake up hour (0-23) - e.g., 7 for 7 AM */
  endHour: number;
  /** Wake up minute (0-59) */
  endMinute: number;
  /** Timezone offset in hours from UTC (e.g., 8 for UTC+8) */
  timezoneOffset: number;
}

export interface SleepHoursCheckResult {
  /** Whether we are currently in sleep hours */
  isSleeping: boolean;
  /** Human-readable explanation */
  reason: string;
  /** If sleeping, when will we wake up (timestamp in ms) */
  wakesUpAt?: number;
  /** Minutes until wake up */
  minutesUntilWakeUp?: number;
}

const DEFAULT_SLEEP_CONFIG: SleepHoursConfig = {
  enabled: true,
  startHour: 23, // 11 PM
  startMinute: 0,
  endHour: 7, // 7 AM
  endMinute: 0,
  timezoneOffset: 0, // UTC
};

const REDIS_KEY = 'CONFIG:sleep_hours';

/**
 * Check if the current time is within sleep hours
 */
export async function isSleepHours(): Promise<SleepHoursCheckResult> {
  const config = await getSleepHoursConfig();

  if (!config.enabled) {
    return {
      isSleeping: false,
      reason: 'Sleep hours are disabled',
    };
  }

  return checkSleepHours(config);
}

/**
 * Pure function to check sleep hours given a config and current time
 * Useful for testing and for determining sleep status at any point in time
 */
export function checkSleepHours(
  config: SleepHoursConfig,
  currentTime: Date = new Date()
): SleepHoursCheckResult {
  if (!config.enabled) {
    return {
      isSleeping: false,
      reason: 'Sleep hours are disabled',
    };
  }

  // Apply timezone offset to get local time
  const localTime = new Date(currentTime.getTime() + config.timezoneOffset * 60 * 60 * 1000);
  const currentHour = localTime.getUTCHours();
  const currentMinute = localTime.getUTCMinutes();
  const currentTotalMinutes = currentHour * 60 + currentMinute;

  const sleepStartMinutes = config.startHour * 60 + config.startMinute;
  const sleepEndMinutes = config.endHour * 60 + config.endMinute;

  let isSleeping: boolean;

  // Handle the case where sleep period crosses midnight
  // e.g., 23:00 to 07:00 (sleepStart > sleepEnd)
  if (sleepStartMinutes > sleepEndMinutes) {
    // Sleep period crosses midnight
    // We're sleeping if: currentTime >= sleepStart OR currentTime < sleepEnd
    isSleeping = currentTotalMinutes >= sleepStartMinutes || currentTotalMinutes < sleepEndMinutes;
  } else {
    // Sleep period within same day (unusual but supported)
    // e.g., 13:00 to 14:00 (siesta)
    isSleeping = currentTotalMinutes >= sleepStartMinutes && currentTotalMinutes < sleepEndMinutes;
  }

  if (isSleeping) {
    // Calculate wake up time
    const wakesUpAt = calculateWakeUpTime(config, currentTime);
    const minutesUntilWakeUp = Math.ceil((wakesUpAt - currentTime.getTime()) / 60000);

    return {
      isSleeping: true,
      reason: `Sleep hours active (${formatTime(config.startHour, config.startMinute)} - ${formatTime(config.endHour, config.endMinute)})`,
      wakesUpAt,
      minutesUntilWakeUp,
    };
  }

  return {
    isSleeping: false,
    reason: 'Outside sleep hours',
  };
}

/**
 * Calculate the next wake up timestamp
 */
function calculateWakeUpTime(config: SleepHoursConfig, currentTime: Date): number {
  // Create wake up time for today
  const wakeUp = new Date(currentTime);
  wakeUp.setUTCHours(config.endHour - config.timezoneOffset);
  wakeUp.setUTCMinutes(config.endMinute);
  wakeUp.setUTCSeconds(0);
  wakeUp.setUTCMilliseconds(0);

  // If wake up time is in the past, it means we'll wake up tomorrow
  if (wakeUp.getTime() <= currentTime.getTime()) {
    wakeUp.setUTCDate(wakeUp.getUTCDate() + 1);
  }

  return wakeUp.getTime();
}

/**
 * Get sleep hours configuration from Redis
 */
export async function getSleepHoursConfig(): Promise<SleepHoursConfig> {
  try {
    const cached = await redisClient.client.get(REDIS_KEY);
    if (cached) {
      return JSON.parse(cached) as SleepHoursConfig;
    }
  } catch (error) {
    console.error('[SleepHours] Error reading config from Redis:', error);
  }

  return DEFAULT_SLEEP_CONFIG;
}

/**
 * Update sleep hours configuration in Redis
 */
export async function setSleepHoursConfig(config: Partial<SleepHoursConfig>): Promise<SleepHoursConfig> {
  const currentConfig = await getSleepHoursConfig();
  const newConfig: SleepHoursConfig = {
    ...currentConfig,
    ...config,
  };

  // Validate hours and minutes
  if (newConfig.startHour < 0 || newConfig.startHour > 23) {
    throw new Error('startHour must be between 0 and 23');
  }
  if (newConfig.endHour < 0 || newConfig.endHour > 23) {
    throw new Error('endHour must be between 0 and 23');
  }
  if (newConfig.startMinute < 0 || newConfig.startMinute > 59) {
    throw new Error('startMinute must be between 0 and 59');
  }
  if (newConfig.endMinute < 0 || newConfig.endMinute > 59) {
    throw new Error('endMinute must be between 0 and 59');
  }
  if (newConfig.timezoneOffset < -12 || newConfig.timezoneOffset > 14) {
    throw new Error('timezoneOffset must be between -12 and 14');
  }

  await redisClient.client.set(REDIS_KEY, JSON.stringify(newConfig));

  console.log('[SleepHours] Config updated:', newConfig);

  return newConfig;
}

/**
 * Queue a message to be processed after sleep hours end
 */
export async function queueDeferredMessage(
  contactId: string,
  messageId: string,
  content: string,
  wakesUpAt: number
): Promise<void> {
  const deferredMessage = {
    contactId,
    messageId,
    content,
    queuedAt: Date.now(),
    processAfter: wakesUpAt,
  };

  // Store in Redis sorted set, scored by processAfter timestamp
  await redisClient.client.zadd(
    'DEFERRED:messages',
    wakesUpAt,
    JSON.stringify(deferredMessage)
  );

  console.log(
    `[SleepHours] Message from ${contactId} queued for processing at ${new Date(wakesUpAt).toISOString()}`
  );
}

/**
 * Get and remove all deferred messages that are ready to be processed
 */
export async function getReadyDeferredMessages(): Promise<Array<{
  contactId: string;
  messageId: string;
  content: string;
  queuedAt: number;
  processAfter: number;
}>> {
  const now = Date.now();

  // Get all messages with score <= now
  const messages = await redisClient.client.zrangebyscore(
    'DEFERRED:messages',
    0,
    now
  );

  if (messages.length === 0) {
    return [];
  }

  // Remove these messages from the queue
  await redisClient.client.zremrangebyscore('DEFERRED:messages', 0, now);

  return messages.map((msg) => JSON.parse(msg));
}

/**
 * Get count of pending deferred messages
 */
export async function getDeferredMessageCount(): Promise<number> {
  return redisClient.client.zcard('DEFERRED:messages');
}

/**
 * Format time for display (24-hour format)
 */
function formatTime(hour: number, minute: number): string {
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

/**
 * Get a human-readable summary of sleep hours status
 */
export async function getSleepHoursStatus(): Promise<{
  config: SleepHoursConfig;
  currentStatus: SleepHoursCheckResult;
  deferredCount: number;
}> {
  const config = await getSleepHoursConfig();
  const currentStatus = checkSleepHours(config);
  const deferredCount = await getDeferredMessageCount();

  return {
    config,
    currentStatus,
    deferredCount,
  };
}
