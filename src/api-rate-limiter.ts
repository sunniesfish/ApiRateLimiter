import Deque from "double-ended-queue";
import { CONSTANTS } from "./constants";
import { InvalidOptionsError, QueueFullError } from "./errors";
import {
  ApiRateLimiterOptions,
  ApiRequest,
  QueueItem,
  RateLimiterStatus,
} from "./type";
import AsyncLock from "./async-lock";

/**
 * A rate limiter for API requests that limits the number of requests per second and per minute.
 * It uses a token bucket algorithm with separate counters for per-second and per-minute limits.
 */
class ApiRateLimiter<T> {
  private timer: NodeJS.Timeout | null = null;
  private queue: Deque<QueueItem<T>> = new Deque<QueueItem<T>>();
  private mpsCounter: number;
  private mpmCounter: number;
  private maxPerSecond: number;
  private maxPerMinute: number;
  private maxQueueSize: number;
  private lastMpmRefill: number = Date.now();
  private static readonly Constants = CONSTANTS;
  private tokenLock = new AsyncLock();

  /**
   * Creates an instance of ApiRateLimiter.
   * @param {ApiRateLimiterOptions} options - Configuration options for the rate limiter.
   *   - `maxPerSecond`: Maximum number of API requests allowed per second.
   *   - `maxPerMinute`: Maximum number of API requests allowed per minute.
   *   - `maxQueueSize`: Maximum size of the request queue.
   * @param {(error: Error | unknown) => void} [errorHandler=console.error] - Optional error handler function that will be called when an API request fails.
   *
   * @throws {InvalidOptionsError} If options are invalid (e.g., maxPerSecond > maxPerMinute or non-positive values).
   */
  constructor(
    options: ApiRateLimiterOptions,
    private errorHandler: (error: Error | unknown) => void = console.error
  ) {
    const defaults = {
      maxPerSecond: ApiRateLimiter.Constants.DEFAULT_MAX_PER_SECOND,
      maxPerMinute: ApiRateLimiter.Constants.DEFAULT_MAX_PER_MINUTE,
      maxQueueSize: ApiRateLimiter.Constants.DEFAULT_MAX_QUEUE_SIZE,
    };
    const { maxPerSecond, maxPerMinute, maxQueueSize } = {
      ...defaults,
      ...options,
    };

    if (maxPerSecond > maxPerMinute || maxPerSecond <= 0 || maxPerMinute <= 0) {
      throw new InvalidOptionsError();
    }

    this.maxPerSecond = maxPerSecond;
    this.maxPerMinute = maxPerMinute;
    this.maxQueueSize = maxQueueSize;

    this.mpsCounter = maxPerSecond;
    this.mpmCounter = maxPerMinute;
  }

  /**
   * Adds a new API request to the rate limiter queue.
   * The request will be executed when tokens are available based on the current rate limits.
   *
   * @param {ApiRequest<T>} request - The API request function to be executed. It must return a Promise.
   * @returns {Promise<T>} A promise that resolves with the API response or rejects if the queue is full or the request fails.
   *
   * @throws {QueueFullError} When the internal request queue has reached its maximum capacity.
   */
  public async addRequest(request: ApiRequest<T>): Promise<T> {
    if (this.queue.length >= this.maxQueueSize) {
      throw new QueueFullError();
    }
    const release = await this.tokenLock.acquire();
    try {
      return new Promise<T>((resolve, reject) => {
        this.queue.push([request, resolve, reject]);
        if (!this.timer) {
          this.startTimer();
        }
      });
    } finally {
      release();
    }
  }

  /**
   * Returns the current status of the rate limiter.
   *
   * @returns {RateLimiterStatus} The current status including:
   *  - `queueSize`: Number of pending requests in the queue.
   *  - `availableRequests`: Number of requests that can be processed immediately based on current tokens.
   *  - `mpsCounter`: Remaining tokens for the per-second limit.
   *  - `mpmCounter`: Remaining tokens for the per-minute limit (floored).
   */
  public async getStatus(): Promise<RateLimiterStatus> {
    const release = await this.tokenLock.acquire();
    try {
      const status = {
        queueSize: this.queue.length,
        availableRequests: this.calculateAvailableRequests(),
        mpsCounter: this.mpsCounter,
        mpmCounter: Math.floor(this.mpmCounter),
      };
      return status;
    } finally {
      release();
    }
  }

  /**
   * Ensures that the request processing loop starts by calling `timerTick` if it is not already running.
   */
  private startTimer(): void {
    if (!this.timer) {
      this.timerTick();
    }
  }

  /**
   * Processes the request queue based on available tokens,
   * refills token buckets, and schedules the next tick if necessary.
   *
   * This method applies a token bucket algorithm:
   *  - Resets `mpsCounter` every tick (per-second limit).
   *  - Refills `mpmCounter` gradually based on the elapsed time.
   * It processes up to min(`mpsCounter`, floor(`mpmCounter`)) requests per tick.
   */
  private async timerTick(): Promise<void> {
    const release = await this.tokenLock.acquire();
    try {
      this.mpsCounter = this.maxPerSecond;
      this.refillMpmCounter();
    } finally {
      release();
    }

    const availableTokens = Math.min(
      this.mpsCounter,
      Math.floor(this.mpmCounter)
    );
    const promises: Promise<void>[] = [];
    let processed = 0;

    while (!this.queue.isEmpty() && processed < availableTokens) {
      const [request, resolve, reject] = this.queue.shift()!;
      promises.push(this.processRequest(request, resolve, reject));
      processed++;
    }

    await Promise.allSettled(promises);

    if (!this.queue.isEmpty()) {
      this.timer = setTimeout(
        () => this.timerTick().catch(console.error),
        1000
      );
    } else {
      this.timer = null;
    }
  }

  /**
   * Processes a single API request.
   * Decrements the available tokens (`mpsCounter` and `mpmCounter`) before executing the API request.
   * If the request fails, the error handler is invoked.
   *
   * @param {ApiRequest<T>} request - The API request function that returns a Promise.
   * @param {(value: T) => void} resolve - The promise resolve function.
   * @param {(reason?: any) => void} reject - The promise reject function.
   */
  private async processRequest(
    request: ApiRequest<T>,
    resolve: (value: T) => void,
    reject: (reason?: any) => void
  ): Promise<void> {
    const release = await this.tokenLock.acquire();
    try {
      this.mpsCounter--;
      this.mpmCounter--;
    } finally {
      release();
    }

    try {
      const result = await request();
      resolve(result);
    } catch (error) {
      try {
        this.errorHandler(error);
      } catch (handlerError) {
        console.error("Error handling failure:", handlerError);
      }
      reject(error);
    }
  }

  /**
   * Refills the per-minute token bucket based on the elapsed time since the last refill.
   * The refill amount is proportional to the elapsed time relative to one minute.
   * Ensures that `mpmCounter` does not exceed the maximum allowed tokens.
   */
  private refillMpmCounter(): void {
    const now = Date.now();
    const elapsed = now - this.lastMpmRefill;
    const tokensToAdd = (elapsed / 60000) * this.maxPerMinute;
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
}

export default ApiRateLimiter;
