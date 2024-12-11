/**
 * @fileoverview Constants used throughout the API Rate Limiter
 * Defines default values and time conversion constants
 */

export const CONSTANTS = {
  /** Milliseconds in a second */
  SECOND_IN_MS: 1000,
  /** Milliseconds in a minute */
  MINUTE_IN_MS: 60000,
  /** Default maximum requests per second */
  DEFAULT_MAX_PER_SECOND: 100,
  /** Default maximum requests per minute */
  DEFAULT_MAX_PER_MINUTE: 1000,
  /** Default maximum size of the request queue */
  DEFAULT_MAX_QUEUE_SIZE: 10000,
} as const;
