import Deque from "double-ended-queue";
import { CONSTANTS } from "./constants";
import { InvalidOptionsError, QueueFullError } from "./errors";
import {
  ApiRateLimiterOptions,
  ApiRequest,
  QueueItem,
  RateLimiterStatus,
} from "./type";

/**
 * A rate limiter for API requests that manages requests per second and minute
 * @template T The type of the API request response
 */
class ApiRateLimiter<T> {
  private timer: NodeJS.Timeout | null = null;
  private queue: Deque<QueueItem<T>> = new Deque<QueueItem<T>>();
  private mpsCounter: number;
  private mpmCounter: number;
  private maxPerSecond: number;
  private maxPerMinute: number;
  private maxQueueSize: number;
  private static readonly Constants = CONSTANTS;

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

    this.mpsCounter = maxPerSecond;
    this.mpmCounter = maxPerMinute;
    this.maxPerSecond = maxPerSecond;
    this.maxPerMinute = maxPerMinute;
    this.maxQueueSize = maxQueueSize;
  }

  /**
   * Adds a new request to the rate limiter
   * @param {ApiRequest<T>} request - The API request function to be executed
   * @returns {Promise<T>} A promise that resolves with the API response
   * @throws {QueueFullError} When the request queue is full
   */
  public addRequest(request: ApiRequest<T>): Promise<T> {
    if (this.queue.length >= this.maxQueueSize - this.maxPerSecond - 1) {
      return Promise.reject(new QueueFullError());
    }
    return new Promise<T>((resolve, reject) =>
      this.manageRequest(request, resolve, reject)
    );
  }

  /**
   * Returns the current status of the rate limiter
   * @returns {RateLimiterStatus} Current queue size and available request count
   */
  public getStatus(): RateLimiterStatus {
    return {
      queueSize: this.queue.length,
      availableRequests: this.calculateAvailableRequests(),
      mpsCounter: this.mpsCounter,
      mpmCounter: this.mpmCounter,
    };
  }

  /**
   * Manages the request execution and queuing
   * @private
   * @param {ApiRequest<T>} request - The API request to be executed
   * @param {Function} resolve - Promise resolve function
   * @param {Function} reject - Promise reject function
   */
  private async manageRequest(
    request: ApiRequest<T>,
    resolve: (value: T | PromiseLike<T>) => void,
    reject: (reason?: any) => void
  ) {
    if (!this.timer) {
      this.timer = setInterval(
        () => this.processQueue(),
        ApiRateLimiter.Constants.SECOND_IN_MS
      );
    }

    if (this.calculateAvailableRequests() > 0) {
      this.processRequest(request, resolve, reject);
    } else {
      this.queue.push([request, resolve, reject]);
    }
  }

  /**
   * Processes requests from the queue based on available capacity
   * @private
   */
  private async processQueue() {
    for (let i = 0; i < this.maxPerSecond && this.queue.length > 0; i++) {
      const [request, resolve, reject] = this.queue.shift()!;
      await this.processRequest(request, resolve, reject);
    }
    this.incrementCounters();

    if (
      this.queue.isEmpty() &&
      this.mpsCounter >= this.maxPerSecond &&
      this.mpmCounter >= this.maxPerMinute
    ) {
      this.stopTimer();
    }
  }

  /**
   * Executes a single API request with rate limiting
   * @private
   * @param {ApiRequest<T>} request - The API request to execute
   * @param {Function} resolve - Promise resolve function
   * @param {Function} reject - Promise reject function
   * @throws {InsufficientRequestsError} When rate limits are exceeded
   */
  private async processRequest(
    request: ApiRequest<T>,
    resolve: (value: T) => void,
    reject: (reason: any) => void
  ) {
    this.mpsCounter--;
    this.mpmCounter--;
    try {
      const result = await request();
      resolve(result);
    } catch (error) {
      this.errorHandler(error);
      reject(error);
    }
  }

  /**
   * Calculates the number of available requests based on current counters
   * @private
   * @returns {number} The number of available requests
   */
  private calculateAvailableRequests(): number {
    return Math.min(this.mpsCounter, this.mpmCounter);
  }

  /**
   * Increments the rate limit counters
   * @private
   */
  private incrementCounters() {
    this.mpsCounter = Math.min(this.mpsCounter + 1, this.maxPerSecond);
    this.mpmCounter = Math.min(
      this.mpmCounter + this.maxPerMinute / 60,
      this.maxPerMinute
    );
  }

  /**
   * Stops the internal timer if running
   * @private
   */
  private stopTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

export default ApiRateLimiter;
