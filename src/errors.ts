/**
 * @fileoverview Custom error classes for the API Rate Limiter
 * Defines specific error types for different failure scenarios
 */

/**
 * Error thrown when invalid configuration options are provided
 * @extends Error
 */
class InvalidOptionsError extends Error {
  constructor() {
    super("Invalid options provided to the rate limiter");
    this.name = "InvalidOptionsError";
  }
}

export { InvalidOptionsError };
