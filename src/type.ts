/** Types for API request handling */
export type ApiRequest<T> = () => Promise<T>;
export type QueueItem<T> = [
  ApiRequest<T>,
  (value: T) => void,
  (reason: any) => void
];

/** Configuration options for the rate limiter */
export interface ApiRateLimiterOptions {
  maxPerSecond: number;
  maxPerMinute: number;
  maxQueueSize: number;
  processInterval?: number;
}

/** Current status of the rate limiter */
export interface RateLimiterStatus {
  queueSize: number;
  availableRequests: number;
}

export type ResolveFunction<T> = (value: T | PromiseLike<T>) => void;
export type RejectFunction = (reason?: any) => void;
