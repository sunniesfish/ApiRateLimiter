import ApiRateLimiter from "../src/api-rate-limiter";
import { QueueFullError, InvalidOptionsError } from "../src/errors";

/**
 * Test suite for ApiRateLimiter class
 * Tests rate limiting functionality, error handling, and resource management
 */
describe("ApiRateLimiter", () => {
  let rateLimiter: ApiRateLimiter<string>;
  const mockRequest = jest.fn().mockResolvedValue("success");
  const delay = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  beforeEach(() => {
    jest.useFakeTimers();
    rateLimiter = new ApiRateLimiter<string>({
      maxPerSecond: 2,
      maxPerMinute: 10,
      maxQueueSize: 5,
    });
    mockRequest.mockClear();
    jest.clearAllTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /**
   * Tests for constructor behavior and initialization
   */
  describe("constructor", () => {
    it("should throw InvalidOptionsError when maxPerSecond > maxPerMinute", () => {
      expect(() => {
        new ApiRateLimiter({
          maxPerSecond: 10,
          maxPerMinute: 5,
        });
      }).toThrow(InvalidOptionsError);
    });

    it("should initialize with default values when not provided", async () => {
      const limiter = new ApiRateLimiter({});
      const status = await limiter.getStatus();
      expect(status.availableRequests).toBeGreaterThan(0);
    });
  });

  /**
   * Tests for request handling functionality
   */
  describe("addRequest", () => {
    it("should execute request immediately when capacity is available", async () => {
      const result = await rateLimiter.addRequest(mockRequest);
      expect(result).toBe("success");
      expect(mockRequest).toHaveBeenCalledTimes(1);
    });

    it("should queue requests when at capacity", async () => {
      const request1 = rateLimiter.addRequest(mockRequest);
      const request2 = rateLimiter.addRequest(mockRequest);
      const request3 = rateLimiter.addRequest(mockRequest);

      await expect(request1).resolves.toBe("success");
      await expect(request2).resolves.toBe("success");

      jest.advanceTimersByTime(1000);
      await expect(request3).resolves.toBe("success");
    });

    it("should reject with QueueFullError when queue is full and then process remaining requests", async () => {
      jest.useFakeTimers();

      const limiter = new ApiRateLimiter<string>({
        maxPerSecond: 1,
        maxPerMinute: 5,
        maxQueueSize: 2,
      });

      let resolveReq1!: (value: string) => void;
      let resolveReq2!: (value: string) => void;
      const deferredReq1 = new Promise<string>((resolve) => {
        resolveReq1 = resolve;
      });
      const deferredReq2 = new Promise<string>((resolve) => {
        resolveReq2 = resolve;
      });

      const request1 = jest.fn(() => deferredReq1);
      const request2 = jest.fn(() => deferredReq2);
      const request3 = jest.fn(() => Promise.resolve("should not be called"));

      const p1 = limiter.addRequest(request1);
      const p2 = limiter.addRequest(request2);
      await Promise.resolve();
      try {
        await limiter.addRequest(request3);
      } catch (error) {
        expect(error).toBeInstanceOf(QueueFullError);
      }

      resolveReq1("success1");
      jest.advanceTimersByTime(1000);
      await Promise.resolve();
      const result1 = await p1;

      resolveReq2("success2");
      jest.advanceTimersByTime(1000);
      await Promise.resolve();
      const result2 = await p2;
      jest.useRealTimers();
    });
  });

  /**
   * Tests for error handling scenarios
   */
  describe("error handling", () => {
    it("should handle API request errors", async () => {
      const errorRequest = jest.fn().mockRejectedValue(new Error("API Error"));
      const errorHandler = jest.fn();

      const limiter = new ApiRateLimiter<string>(
        {
          maxPerSecond: 1,
          maxPerMinute: 5,
        },
        errorHandler
      );

      await expect(limiter.addRequest(errorRequest)).rejects.toThrow(
        "API Error"
      );
      expect(errorHandler).toHaveBeenCalled();
    });

    it("should call error handler with correct error object", async () => {
      const errorHandler = jest.fn();
      const testError = new Error("Test error");
      const errorRequest = jest.fn().mockRejectedValue(testError);

      const limiter = new ApiRateLimiter<string>(
        { maxPerSecond: 1, maxPerMinute: 5 },
        errorHandler
      );

      await expect(limiter.addRequest(errorRequest)).rejects.toThrow(testError);
      expect(errorHandler).toHaveBeenCalledWith(testError);
    });
  });

  /**
   * Tests for rate limiting behavior
   */
  describe("rate limiting", () => {
    it("should respect maxPerSecond limit with precise timing", async () => {
      const firstBatch = Array(2)
        .fill(null)
        .map(async () => rateLimiter.addRequest(mockRequest));

      await Promise.all(firstBatch);
      const statusAfterFirst = await rateLimiter.getStatus();
      expect(mockRequest).toHaveBeenCalledTimes(2);
      expect(statusAfterFirst.availableRequests).toBe(0);

      const secondBatch = Array(2)
        .fill(null)
        .map(async () => rateLimiter.addRequest(mockRequest));

      const statusBeforeWait = await rateLimiter.getStatus();
      expect(mockRequest).toHaveBeenCalledTimes(2);
      expect(statusBeforeWait.queueSize).toBe(2);

      jest.advanceTimersByTime(1000);

      await Promise.all(secondBatch);
      expect(mockRequest).toHaveBeenCalledTimes(4);
      const statusAfterSecond = await rateLimiter.getStatus();
      expect(statusAfterSecond.queueSize).toBe(0);
    });

    it("should partially refill mpmCounter based on elapsed time", async () => {
      const maxPerMinute = 10;
      const maxPerSecond = 5;
      const limiter = new ApiRateLimiter<string>({
        maxPerMinute,
        maxPerSecond,
        maxQueueSize: 100,
      });

      (limiter as any).mpmCounter = 0;
      (limiter as any).lastMpmRefill = Date.now();

      jest.advanceTimersByTime(30000);

      const dummyRequest = jest.fn(() => Promise.resolve("response"));
      const requestPromise = limiter.addRequest(dummyRequest);

      await requestPromise;

      const status = await limiter.getStatus();
      expect(dummyRequest).toHaveBeenCalledTimes(1);
      expect(status.mpmCounter).toBe(4);
    });
  });

  /**
   * Tests for status reporting functionality
   */
  describe("getStatus", () => {
    it("should return correct queue size and available requests", async () => {
      await rateLimiter.addRequest(mockRequest);
      await rateLimiter.addRequest(mockRequest);

      await rateLimiter.addRequest(mockRequest);

      const status = await rateLimiter.getStatus();
      expect(status.queueSize).toBe(0);
      expect(status.availableRequests).toBe(1);
    });
  });

  /**
   * Tests for resource cleanup and management
   */
  describe("cleanup and resource management", () => {
    it("should clear timer when queue is empty and counters are reset", async () => {
      const limiter = new ApiRateLimiter<string>({
        maxPerSecond: 2,
        maxPerMinute: 10,
      });

      await limiter.addRequest(mockRequest);
      jest.advanceTimersByTime(60000);

      // @ts-ignore
      expect(limiter.timer).toBeNull();
    });

    it("should not leak memory when processing many requests", async () => {
      const limiter = new ApiRateLimiter<string>({
        maxPerSecond: 5,
        maxPerMinute: 100,
        maxQueueSize: 1000,
      });

      const requests = Array(100)
        .fill(null)
        .map(() => limiter.addRequest(mockRequest));

      jest.advanceTimersByTime(60000);
      await Promise.all(requests);

      // @ts-ignore - private 속성 접근을 위해
      expect(limiter.queue.length).toBe(0);
    });
  });

  /**
   * Tests for concurrent request handling
   */
  describe("concurrent request handling", () => {
    it("should handle multiple concurrent requests correctly", async () => {
      const limiter = new ApiRateLimiter<string>({
        maxPerSecond: 2,
        maxPerMinute: 10,
      });

      const concurrentMockRequest = jest.fn(() => Promise.resolve("success"));

      const results = Promise.allSettled([
        limiter.addRequest(concurrentMockRequest),
        limiter.addRequest(concurrentMockRequest),
        limiter.addRequest(concurrentMockRequest),
      ]);

      jest.advanceTimersByTime(1000);
      await Promise.resolve();

      const settledResults = await results;

      expect(settledResults[0].status).toBe("fulfilled");
      expect(settledResults[1].status).toBe("fulfilled");
      expect(settledResults[2].status).toBe("fulfilled");
    });
  });

  /**
   * Tests for various error scenarios
   */
  describe("error scenarios", () => {
    it("should maintain rate limits even after errors", async () => {
      const errorRequest = jest.fn().mockRejectedValue(new Error("API Error"));
      const limiter = new ApiRateLimiter<string>({
        maxPerSecond: 1,
        maxPerMinute: 5,
      });

      await expect(limiter.addRequest(errorRequest)).rejects.toThrow();

      const status = await limiter.getStatus();
      expect(status.availableRequests).toBe(0);

      jest.advanceTimersByTime(1000);
      const statusAfterWait = await limiter.getStatus();
      expect(statusAfterWait.availableRequests).toBe(0);
    });
  });

  /**
   * Tests for edge cases and boundary conditions
   */
  describe("edge cases", () => {
    it("should handle minimum valid configuration", () => {
      expect(() => {
        new ApiRateLimiter({
          maxPerSecond: 1,
          maxPerMinute: 1,
          maxQueueSize: 1,
        });
      }).not.toThrow();
    });

    it("should handle zero request scenario correctly", async () => {
      expect(() => {
        new ApiRateLimiter<string>({
          maxPerSecond: 0,
          maxPerMinute: 0,
        });
      }).toThrow(InvalidOptionsError);
    });
  });

  /**
   * Tests for rate limit counter recovery behavior
   */
  describe("counter recovery", () => {
    it("should recover request capacity over time", async () => {
      const limiter = new ApiRateLimiter<string>({
        maxPerSecond: 2,
        maxPerMinute: 4,
      });

      await limiter.addRequest(mockRequest);
      await limiter.addRequest(mockRequest);

      const initialStatus = await limiter.getStatus();
      expect(initialStatus.availableRequests).toBe(1);

      jest.advanceTimersByTime(1000);
      const statusAfterSecond = await limiter.getStatus();
      expect(statusAfterSecond.availableRequests).toBe(1);

      jest.advanceTimersByTime(60000);
      const statusAfterMinute = await limiter.getStatus();
      expect(statusAfterMinute.availableRequests).toBe(1);
    });
  });

  /**
   * Tests for token bucket refill mechanism
   */
  describe("token bucket refill", () => {
    it("should properly refill tokens over time", async () => {
      const limiter = new ApiRateLimiter<string>({
        maxPerSecond: 2,
        maxPerMinute: 4,
      });

      await Promise.all([
        limiter.addRequest(mockRequest),
        limiter.addRequest(mockRequest),
      ]);

      const initialStatus = await limiter.getStatus();
      expect(initialStatus.availableRequests).toBe(0);

      jest.advanceTimersByTime(30000);

      const finalStatus = await limiter.getStatus();
      expect(finalStatus.mpmCounter).toBeCloseTo(2, 0);
    });
  });
});
