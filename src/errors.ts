/**
 * @fileoverview Custom error classes for the API Rate Limiter
 * Defines specific error types for different failure scenarios
 */

/**
 * Error thrown when invalid configuration options are provided to the ApiRateLimiter constructor.
 *
 * This error is thrown in the following cases:
 * - maxPerSecond is greater than maxPerMinute
 * - maxPerSecond is less than or equal to 0
 * - maxPerMinute is less than or equal to 0
 *
 * @extends Error
 * @example
 * ```typescript
 * // This will throw InvalidOptionsError
 * new ApiRateLimiter({ maxPerSecond: 100, maxPerMinute: 50 });
 * ```
 */
class InvalidOptionsError extends Error {
  /**
   * Creates an instance of InvalidOptionsError.
   * Sets the error message and name property.
   */
  constructor() {
    super("Invalid options provided to the rate limiter");
    this.name = "InvalidOptionsError";
  }
}

export { InvalidOptionsError };
