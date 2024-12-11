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

/**
 * Error thrown when the request queue reaches its maximum capacity
 * @extends Error
 */
class QueueFullError extends Error {
  constructor() {
    super("Rate limiter queue is full");
    this.name = "QueueFullError";
  }
}

export { InvalidOptionsError, QueueFullError };
