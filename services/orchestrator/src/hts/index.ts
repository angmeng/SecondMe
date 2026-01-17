/**
 * Human Typing Simulation (HTS) Module
 * Exports all HTS-related functionality for natural human behavior simulation
 */

export {
  calculateTypingDelay,
  calculateCognitivePause,
  formatTypingDelay,
  estimateTypingDelay,
  type TypingDelayOptions,
  type TypingDelayResult,
} from './delay-calculator.js';

export {
  isSleepHours,
  checkSleepHours,
  getSleepHoursConfig,
  setSleepHoursConfig,
  queueDeferredMessage,
  getReadyDeferredMessages,
  getDeferredMessageCount,
  getSleepHoursStatus,
  type SleepHoursConfig,
  type SleepHoursCheckResult,
} from './sleep-hours.js';
