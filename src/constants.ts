/**
 * @fileoverview Constants used throughout the API Rate Limiter
 * Defines default values and time conversion constants
 */

/**
 * Collection of constants used by the API Rate Limiter
 * @readonly
 */
export const CONSTANTS = {
  /** Milliseconds in one second (1000ms) */
  SECOND_IN_MS: 1000,
  /** Milliseconds in one minute (60,000ms) */
  MINUTE_IN_MS: 60000,
  /** Default maximum requests allowed per second (conservative default) */
  DEFAULT_MAX_PER_SECOND: 100,
  /** Default maximum requests allowed per minute (should be >= DEFAULT_MAX_PER_SECOND) */
  DEFAULT_MAX_PER_MINUTE: 1000,
} as const;
