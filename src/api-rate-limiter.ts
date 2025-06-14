import Deque from "double-ended-queue";
import { CONSTANTS } from "./constants";
import { InvalidOptionsError } from "./errors";
import {
  ApiRateLimiterOptions,
  ApiRequest,
  QueueItem,
  RateLimiterStatus,
} from "./type";
import AsyncLock from "./async-lock";

/**
 * A rate limiter for API requests that limits the number of requests per second and per minute.
 * Implements a token bucket algorithm with separate counters for per-second and per-minute limits.
 * Thread-safe: uses an internal async lock to prevent race conditions.
 * Supports batching of incoming requests for efficient queue management.
 */
class ApiRateLimiter<T> {
  /** Timer for scheduling the next tick (null if not running) */
  private timer: NodeJS.Timeout | null = null;
  /** Queue of pending API requests to be processed */
  private queue: Deque<QueueItem<T>> = new Deque<QueueItem<T>>();
  /** Remaining tokens for per-second limit */
  private mpsCounter: number;
  /** Remaining tokens for per-minute limit */
  private mpmCounter: number;
  /** Maximum allowed requests per second */
  private maxPerSecond: number;
  /** Maximum allowed requests per minute */
  private maxPerMinute: number;
  /** Timestamp of the last per-minute token refill */
  private lastMpmRefill: number = Date.now();
  /** Reference to constants used throughout the class */
  private static readonly Constants = CONSTANTS;
  /** Async lock to ensure thread-safe token and queue operations */
  private tokenLock = new AsyncLock();
  /** Indicates if the timer is currently running */
  private isTimerRunning: boolean = false;

  /**
   * Pending requests waiting to be batched and pushed to the main queue.
   * Each item contains the request function and its resolve/reject handlers.
   */
  private pendingRequest: Array<{
    request: ApiRequest<T>;
    resolve: (value: T) => void;
    reject: (reason?: any) => void;
  }> = [];
  /** Indicates if a batch is currently being processed */
  private isBatching: boolean = false;

  /**
   * Current status snapshot of the rate limiter
   * Updated after each tick or batch processing.
   * {
   *   queueSize: number;
   *   availableRequests: number;
   *   mpsCounter: number;
   *   mpmCounter: number;
   * }
   */
  private status!: RateLimiterStatus;

  /**
   * Creates an instance of ApiRateLimiter.
   * @param {ApiRateLimiterOptions} options - Configuration options for the rate limiter.
   *   - `maxPerSecond`: Maximum number of API requests allowed per second (default: see constants).
   *   - `maxPerMinute`: Maximum number of API requests allowed per minute (default: see constants).
   *
   * @throws {InvalidOptionsError} If options are invalid (e.g., maxPerSecond > maxPerMinute or non-positive values).
   */
  constructor(options: ApiRateLimiterOptions) {
    const defaults = {
      maxPerSecond: ApiRateLimiter.Constants.DEFAULT_MAX_PER_SECOND,
      maxPerMinute: ApiRateLimiter.Constants.DEFAULT_MAX_PER_MINUTE,
    };
    const { maxPerSecond, maxPerMinute } = {
      ...defaults,
      ...options,
    };

    if (maxPerSecond > maxPerMinute || maxPerSecond <= 0 || maxPerMinute <= 0) {
      throw new InvalidOptionsError();
    }

    this.maxPerSecond = maxPerSecond;
    this.maxPerMinute = maxPerMinute;

    this.mpsCounter = maxPerSecond;
    this.mpmCounter = maxPerMinute;

    this.status = {
      queueSize: this.queue.length,
      availableRequests: this.calculateAvailableRequests(),
      mpsCounter: this.mpsCounter,
      mpmCounter: Math.floor(this.mpmCounter),
    };
  }

  /**
   * Adds a new API request to the rate limiter queue.
   * The request will be executed when tokens are available based on the current rate limits.
   *
   * @param {ApiRequest<T>} request - The API request function to be executed. It must return a Promise.
   * @returns {Promise<T>} A promise that resolves with the API response or rejects if the request fails.
   */
  public async addRequest(request: ApiRequest<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.pendingRequest.push({ request, resolve, reject });
      this.scheduleBatchProcessing();
    });
  }

  /**
   * Schedules batch processing of pending requests if not already batching.
   * Uses setImmediate to defer batch processing to the next event loop tick.
   */
  private scheduleBatchProcessing(): void {
    if (!this.isBatching) {
      this.isBatching = true;

      setImmediate(() => {
        this.processBatch()
          .catch(console.error)
          .finally(() => {
            this.isBatching = false;
          });
      });
    }
  }

  /**
   * Processes all pending requests as a batch, pushing them to the main queue.
   * Acquires a lock to ensure thread safety.
   * Updates batch statistics and starts the timer if needed.
   */
  private async processBatch(): Promise<void> {
    if (this.pendingRequest.length === 0) {
      return;
    }
    const release = await this.tokenLock.acquire();
    try {
      const batch = this.pendingRequest.splice(0);

      for (const item of batch) {
        this.queue.push([item.request, item.resolve, item.reject]);
      }
      if (!this.timer && !this.queue.isEmpty()) {
        this.startTimer();
      }
    } finally {
      release();
    }
  }

  /**
   * Ensures that the request processing loop starts by calling `timerTick` if it is not already running.
   * Prevents duplicate timer invocations.
   */
  private startTimer(): void {
    if (!this.timer && !this.isTimerRunning) {
      this.timerTick();
      this.isTimerRunning = true;
    }
  }

  /**
   * Processes the request queue based on available tokens,
   * refills token buckets, and schedules the next tick if necessary.
   *
   * This method applies a token bucket algorithm:
   *  - Resets `mpsCounter` every tick (per-second limit).
   *  - Refills `mpmCounter` gradually based on the elapsed time.
   *  - Acquires a lock to ensure thread safety.
   *  - If the queue is empty after processing, stops the timer.
   * It processes up to min(`mpsCounter`, floor(`mpmCounter`)) requests per tick.
   */
  private async timerTick(): Promise<void> {
    const release = await this.tokenLock.acquire();
    try {
      this.mpsCounter = this.maxPerSecond;
      this.refillMpmCounter();

      const availableTokens = this.calculateAvailableRequests();
      let processed = 0;

      while (!this.queue.isEmpty() && processed < availableTokens) {
        const [request, resolve, reject] = this.queue.shift()!;
        this.processRequest(request, resolve, reject);
        processed++;
      }

      this.updateStatus();

      if (!this.queue.isEmpty()) {
        this.timer = setTimeout(
          () =>
            this.timerTick()
              .catch(console.error)
              .finally(() => {
                if (!this.timer) {
                  this.isTimerRunning = false;
                }
              }),
          ApiRateLimiter.Constants.SECOND_IN_MS
        );
      } else {
        this.timer = null;
        this.isTimerRunning = false;
      }
    } finally {
      release();
    }
  }

  /**
   * Processes a single API request.
   * Decrements the available tokens (`mpsCounter` and `mpmCounter`) before executing the API request.
   * The request's success or failure does not affect token recovery.
   *
   * @param {ApiRequest<T>} request - The API request function that returns a Promise.
   * @param {(value: T) => void} resolve - Promise resolver for the request.
   * @param {(reason?: any) => void} reject - Promise rejector for the request.
   */
  private async processRequest(
    request: ApiRequest<T>,
    resolve: (value: T) => void,
    reject: (reason?: any) => void
  ): Promise<void> {
    this.mpsCounter--;
    this.mpmCounter--;

    request().then(resolve).catch(reject);
  }

  /**
   * Refills the per-minute token bucket based on the elapsed time since the last refill.
   * The refill amount is proportional to the elapsed time relative to one minute.
   * Ensures that `mpmCounter` does not exceed the maximum allowed tokens.
   */
  private refillMpmCounter(): void {
    const now = Date.now();
    const elapsed = now - this.lastMpmRefill;
    const tokensToAdd =
      (elapsed / ApiRateLimiter.Constants.MINUTE_IN_MS) * this.maxPerMinute;
    this.mpmCounter = Math.min(
      this.mpmCounter + tokensToAdd,
      this.maxPerMinute
    );
    this.lastMpmRefill = now;
  }

  /**
   * Calculates the number of available requests that can be processed immediately,
   * based on the current state of the token buckets.
   *
   * @returns {number} The minimum of `mpsCounter` and the floored value of `mpmCounter`.
   */
  private calculateAvailableRequests(): number {
    return Math.min(this.mpsCounter, Math.floor(this.mpmCounter));
  }

  /**
   * Returns a shallow copy of the current status of the rate limiter.
   *
   * @returns {RateLimiterStatus} The current status including:
   *  - `queueSize`: Number of pending requests in the queue.
   *  - `availableRequests`: Number of requests that can be processed immediately based on current tokens.
   *  - `mpsCounter`: Remaining tokens for the per-second limit.
   *  - `mpmCounter`: Remaining tokens for the per-minute limit (floored).
   */
  public getStatus(): RateLimiterStatus {
    return { ...this.status };
  }

  /**
   * Updates the internal status snapshot after each tick or batch processing.
   * Not exposed publicly.
   */
  private updateStatus(): void {
    this.status.queueSize = this.queue.length;
    this.status.availableRequests = this.calculateAvailableRequests();
    this.status.mpsCounter = this.mpsCounter;
    this.status.mpmCounter = Math.floor(this.mpmCounter);
  }
}

export default ApiRateLimiter;
