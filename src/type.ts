/**
 * @fileoverview Type definitions for the API Rate Limiter
 * Contains interfaces and types used throughout the rate limiting system
 */

/** Function type for API requests that return a promise */
export type ApiRequest<T> = () => Promise<T>;

/** Tuple type representing a queued request with its resolve and reject handlers */
export type QueueItem<T> = [
  ApiRequest<T>,
  (value: T) => void,
  (reason: any) => void
];

/**
 * Configuration options for initializing the API Rate Limiter
 * @interface ApiRateLimiterOptions
 */
export interface ApiRateLimiterOptions {
  /** Maximum number of requests allowed per second */
  maxPerSecond?: number;
  /** Maximum number of requests allowed per minute */
  maxPerMinute?: number;
  /** Maximum size of the request queue */
  maxQueueSize?: number;
}

/**
 * Current status information of the rate limiter
 * @interface RateLimiterStatus
 */
export interface RateLimiterStatus {
  /** Current number of requests in the queue */
  queueSize: number;
  /** Number of requests that can be made immediately */
  availableRequests: number;
  /** Current count of requests per second */
  mpsCounter: number;
  /** Current count of requests per minute */
  mpmCounter: number;
}

/** Promise resolve function type */
export type ResolveFunction<T> = (value: T | PromiseLike<T>) => void;
/** Promise reject function type */
export type RejectFunction = (reason?: any) => void;
