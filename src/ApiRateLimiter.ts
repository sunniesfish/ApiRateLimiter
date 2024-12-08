import Deque from "double-ended-queue";
import {
  ApiRateLimiterOptions,
  ApiRequest,
  QueueItem,
  RateLimiterStatus,
} from "./type";
import { TIME_CONSTANTS } from "./constants";
import { InvalidOptionsError, QueueFullError } from "./errors";

/**
 * Manages API request rate limiting with configurable time windows
 * @template T The type of API response
 */
class ApiRateLimiter<T> {
  private isProcessing: boolean = false;
  private timer: NodeJS.Timeout | null = null;
  private lastSecondRequests: Deque<number> = new Deque<number>();
  private lastMinuteRequests: Deque<number> = new Deque<number>();
  private queue: Deque<QueueItem<T>> = new Deque<QueueItem<T>>();
  private maxPerSecond: number;
  private maxPerMinute: number;
  private maxQueueSize: number;
  private processInterval: number;
  private static readonly Constants = TIME_CONSTANTS;

  constructor(
    options: ApiRateLimiterOptions,
    private errorHandler: (error: Error | unknown) => void = console.error
  ) {
    if (
      options.maxPerSecond <= 0 ||
      options.maxPerMinute <= 0 ||
      options.maxQueueSize <= 0
    ) {
      throw new InvalidOptionsError();
    }
    this.maxPerSecond = options.maxPerSecond;
    this.maxPerMinute = options.maxPerMinute;
    this.maxQueueSize = options.maxQueueSize;
    this.processInterval = options.processInterval ?? 1000;
  }

  /**
   * Adds a new API request to the rate limiter queue
   * @throws {QueueFullError} When queue reaches maximum capacity
   */
  public addRequest(request: ApiRequest<T>): Promise<T> {
    if (this.queue.length >= this.maxQueueSize) {
      return Promise.reject(new QueueFullError());
    }
    return new Promise<T>((resolve, reject) => {
      this.queue.push([request, resolve, reject]);
      if (!this.timer) {
        this.startTimer();
        this.processQueue();
      }
    });
  }

  /**
   * Returns current rate limiter status including queue size and request counts
   */
  public getStatus(): RateLimiterStatus {
    const now = Date.now();
    this.updateRequestHistory(now);
    return {
      queueSize: this.queue.length,
      requestsLastSecond: this.lastSecondRequests.length,
      requestsLastMinute: this.lastMinuteRequests.length,
    };
  }

  /**
   * Processes queued requests while respecting configured rate limits
   */
  private async processQueueHelper(now: number): Promise<number> {
    this.updateRequestHistory(now);
    const availableRequests = this.calculateAvailableRequests();
    let processedCount = 0;

    for (let i = 0; i < availableRequests && this.queue.length > 0; i++) {
      const [request, resolve, reject] = this.queue.shift()!;
      await this.processRequest(request, resolve, reject, now);
      processedCount++;
    }
    return processedCount;
  }

  private async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const now = Date.now();
      await this.processQueueHelper(now);
    } finally {
      this.isProcessing = false;
      if (this.queue.isEmpty()) this.stopTimer();
    }
  }

  /**
   * Processes a single request and updates request history.
   * @param request - The API request to execute
   * @param resolve - Promise resolve function
   * @param reject - Promise reject function
   * @param now - Current timestamp
   */
  private async processRequest(
    request: ApiRequest<T>,
    resolve: (value: T) => void,
    reject: (reason: any) => void,
    now: number
  ) {
    this.lastSecondRequests.push(now);
    this.lastMinuteRequests.push(now);
    try {
      const result = await request();
      resolve(result);
    } catch (error) {
      this.errorHandler(error);
      reject(error);
    }
  }

  /**
   * Calculates available request capacity based on current rate limits.
   * @returns Number of requests that can be processed
   */
  private calculateAvailableRequests(): number {
    const availableInSecond =
      this.maxPerSecond - this.lastSecondRequests.length;
    const availableInMinute =
      this.maxPerMinute - this.lastMinuteRequests.length;
    return Math.min(availableInSecond, availableInMinute);
  }

  /**
   * Updates request history by removing expired requests from all time windows.
   * @param now - Current timestamp
   */
  private updateRequestHistory(now: number): void {
    this.removeExpiredRequests(
      this.lastSecondRequests,
      now,
      ApiRateLimiter.Constants.SECOND_IN_MS
    );
    this.removeExpiredRequests(
      this.lastMinuteRequests,
      now,
      ApiRateLimiter.Constants.MINUTE_IN_MS
    );
  }

  /**
   * Removes expired requests from the specified time window queue
   */
  private removeExpiredRequests(
    queue: Deque<number>,
    now: number,
    timeWindow: number
  ): void {
    while (
      queue.peekFront() !== undefined &&
      now - queue.peekFront()! >= timeWindow
    ) {
      queue.shift();
    }
  }

  /**
   * Starts the queue processing timer if not already running.
   * Timer controls the rate at which queued requests are processed.
   */
  private startTimer() {
    if (!this.timer) {
      this.timer = setInterval(
        this.processQueue.bind(this),
        this.processInterval
      );
    }
  }

  /**
   * Stops the processing timer if there are no pending requests
   * or active request history to manage.
   */
  private stopTimer() {
    if (
      this.timer &&
      this.queue.isEmpty() &&
      this.lastSecondRequests.isEmpty() &&
      this.lastMinuteRequests.isEmpty()
    ) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

export default ApiRateLimiter;
