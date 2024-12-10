import Deque from "double-ended-queue";
import { TIME_CONSTANTS } from "./constants";
import { InvalidOptionsError, QueueFullError } from "./errors";
import {
  ApiRateLimiterOptions,
  ApiRequest,
  QueueItem,
  RateLimiterStatus,
} from "./type";

class ApiRateLimiter<T> {
  private timer: NodeJS.Timeout | null = null;
  private queue: Deque<QueueItem<T>> = new Deque<QueueItem<T>>();
  private mpsCounter: number;
  private mpmCounter: number;
  private activeRequests: number = 0;
  private maxPerSecond: number;
  private maxPerMinute: number;
  private maxQueueSize: number;
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
    this.mpsCounter = options.maxPerSecond ?? 100;
    this.mpmCounter = options.maxPerMinute ?? 1000;
    this.maxPerSecond = options.maxPerSecond ?? 100;
    this.maxPerMinute = options.maxPerMinute ?? 1000;
    this.maxQueueSize = options.maxQueueSize ?? 10000;
  }

  public addRequest(request: ApiRequest<T>): Promise<T> {
    if (this.queue.length >= this.maxQueueSize) {
      return Promise.reject(new QueueFullError());
    }
    return new Promise<T>((resolve, reject) =>
      this.manageRequest(request, resolve, reject)
    );
  }

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

  private async processQueue() {
    for (let i = 0; i < this.maxPerSecond && this.queue.length > 0; i++) {
      const [request, resolve, reject] = this.queue.shift()!;
      this.processRequest(request, resolve, reject);
    }

    this.mpsCounter = Math.min(this.mpsCounter + 1, this.maxPerSecond);
    this.mpmCounter = Math.min(
      this.mpmCounter + this.maxPerMinute / 60,
      this.maxPerMinute
    );

    if (this.queue.isEmpty() && this.activeRequests === 0) {
      this.stopTimer();
    }
  }

  public getStatus(): RateLimiterStatus {
    return {
      queueSize: this.queue.length,
      availableRequests: this.calculateAvailableRequests(),
    };
  }

  private async processRequest(
    request: ApiRequest<T>,
    resolve: (value: T) => void,
    reject: (reason: any) => void
  ) {
    this.activeRequests++;
    try {
      const result = await request();
      resolve(result);
    } catch (error) {
      this.errorHandler(error);
      reject(error);
    } finally {
      this.activeRequests--;
    }
  }

  private calculateAvailableRequests(): number {
    return Math.min(this.mpsCounter, this.mpmCounter);
  }

  private stopTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

export default ApiRateLimiter;
