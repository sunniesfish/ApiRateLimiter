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
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /**
   * Tests for constructor behavior and initialization
   */
  describe("constructor", () => {
    /**
     * Validates that the rate limiter throws an error when maxPerSecond exceeds maxPerMinute
     * This ensures logical consistency in rate limiting configuration
     */
    it("should throw InvalidOptionsError when maxPerSecond > maxPerMinute", () => {
      expect(() => {
        new ApiRateLimiter({
          maxPerSecond: 10,
          maxPerMinute: 5,
        });
      }).toThrow(InvalidOptionsError);
    });

    /**
     * Verifies that the rate limiter initializes correctly with default values
     * when no options are provided
     */
    it("should initialize with default values when not provided", () => {
      const limiter = new ApiRateLimiter({});
      expect(limiter.getStatus().availableRequests).toBeGreaterThan(0);
    });
  });

  /**
   * Tests for request handling functionality
   */
  describe("addRequest", () => {
    /**
     * Verifies immediate execution of requests when capacity is available
     * Ensures the basic request processing works as expected
     */
    it("should execute request immediately when capacity is available", async () => {
      const result = await rateLimiter.addRequest(mockRequest);
      expect(result).toBe("success");
      expect(mockRequest).toHaveBeenCalledTimes(1);
    });

    /**
     * Tests the queuing behavior when rate limits are reached
     * Validates that requests are properly queued and processed in order
     */
    it("should queue requests when at capacity", async () => {
      // Fill up the current capacity
      const request1 = rateLimiter.addRequest(mockRequest);
      const request2 = rateLimiter.addRequest(mockRequest);

      // This should be queued
      const request3 = rateLimiter.addRequest(mockRequest);

      // First two should complete immediately
      await expect(request1).resolves.toBe("success");
      await expect(request2).resolves.toBe("success");

      // Third request should be queued
      jest.advanceTimersByTime(1000);
      await expect(request3).resolves.toBe("success");
    });

    /**
     * Validates that the rate limiter properly handles queue overflow scenarios
     * Ensures requests are rejected when queue capacity is exceeded
     */
    it("should reject with QueueFullError when queue is full", async () => {
      // Fill capacity and queue
      const limiter = new ApiRateLimiter<string>({
        maxPerSecond: 2,
        maxPerMinute: 10,
        maxQueueSize: 5,
      });
      const requests = Array(5)
        .fill(null)
        .map(() => limiter.addRequest(mockRequest));

      await expect(requests[4]).rejects.toThrow(QueueFullError);
    });
  });

  /**
   * Tests for error handling scenarios
   */
  describe("error handling", () => {
    /**
     * Verifies that API errors are properly caught and handled
     * Ensures the error handler is called and errors are propagated correctly
     */
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
  });

  /**
   * Tests for rate limiting behavior
   */
  describe("rate limiting", () => {
    /**
     * Validates that the per-second rate limit is properly enforced
     * Tests the short-term rate limiting behavior
     */
    it("should respect maxPerSecond limit", async () => {
      const limiter = new ApiRateLimiter<string>({
        maxPerSecond: 2,
        maxPerMinute: 10,
      });
      const requests = Array(3)
        .fill(null)
        .map(() => limiter.addRequest(mockRequest));

      // First two should complete immediately
      await expect(requests[0]).resolves.toBe("success");
      await expect(requests[1]).resolves.toBe("success");

      // Third should wait for next second
      jest.advanceTimersByTime(1000);
      await expect(requests[2]).resolves.toBe("success");
    });

    /**
     * Validates that the per-minute rate limit is properly enforced
     * Tests the long-term rate limiting behavior
     */
    it("should respect maxPerMinute limit", async () => {
      const limiter = new ApiRateLimiter<string>({
        maxPerSecond: 2,
        maxPerMinute: 3,
      });

      const requests = Array(4)
        .fill(null)
        .map(() => limiter.addRequest(mockRequest));

      // First three should complete
      jest.advanceTimersByTime(2000);
      await expect(requests[0]).resolves.toBe("success");
      await expect(requests[1]).resolves.toBe("success");
      await expect(requests[2]).resolves.toBe("success");

      jest.advanceTimersByTime(60000);
      // Fourth should complete after 60 seconds
      await expect(requests[3]).resolves.toBe("success");
    });
  });

  /**
   * Tests for status reporting functionality
   */
  describe("getStatus", () => {
    /**
     * Verifies that the status reporting accurately reflects
     * the current state of the rate limiter
     */
    it("should return correct queue size and available requests", async () => {
      // Fill initial capacity
      rateLimiter.addRequest(mockRequest);
      rateLimiter.addRequest(mockRequest);

      // Add one to queue
      rateLimiter.addRequest(mockRequest);

      const status = rateLimiter.getStatus();
      expect(status.queueSize).toBe(1);
      expect(status.availableRequests).toBe(0);
    });
  });

  /**
   * Tests for resource cleanup and management
   */
  describe("cleanup and resource management", () => {
    /**
     * Validates that internal timers are properly cleaned up
     * when they are no longer needed
     */
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

    /**
     * Tests memory management under high load
     * Ensures no memory leaks occur when processing many requests
     */
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
    /**
     * Validates that multiple concurrent requests are handled correctly
     * Ensures proper ordering and rate limiting under concurrent load
     */
    it("should handle multiple concurrent requests correctly", async () => {
      const limiter = new ApiRateLimiter<string>({
        maxPerSecond: 2,
        maxPerMinute: 10,
      });

      const mockRequest = jest.fn(() => Promise.resolve("success"));

      const results = Promise.allSettled([
        limiter.addRequest(mockRequest),
        limiter.addRequest(mockRequest),
        limiter.addRequest(mockRequest),
      ]);

      jest.advanceTimersByTime(1000);
      await Promise.resolve();

      const resolvedResults = await results;

      expect(resolvedResults[0].status).toBe("fulfilled");
      expect(resolvedResults[1].status).toBe("fulfilled");
      expect(resolvedResults[2].status).toBe("fulfilled");
    });
  });

  /**
   * Tests for various error scenarios
   */
  describe("error scenarios", () => {
    /**
     * Validates proper handling of request timeouts
     * Ensures timeouts don't break the rate limiter's state
     */
    it("should handle request timeout scenarios", async () => {
      const timeoutRequest = jest
        .fn()
        .mockImplementation(
          () =>
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Timeout")), 5000)
            )
        );

      const limiter = new ApiRateLimiter<string>({
        maxPerSecond: 1,
        maxPerMinute: 5,
      });

      const request = limiter.addRequest(timeoutRequest);
      jest.advanceTimersByTime(5000);

      await expect(request).rejects.toThrow("Timeout");
    });

    /**
     * Verifies that rate limits are maintained even after errors occur
     * Ensures system stability during error conditions
     */
    it("should maintain rate limits even after errors", async () => {
      const errorRequest = jest.fn().mockRejectedValue(new Error("API Error"));
      const limiter = new ApiRateLimiter<string>({
        maxPerSecond: 1,
        maxPerMinute: 5,
      });

      await expect(limiter.addRequest(errorRequest)).rejects.toThrow();

      const status = limiter.getStatus();
      expect(status.availableRequests).toBe(0);

      jest.advanceTimersByTime(1000);
      expect(limiter.getStatus().availableRequests).toBe(1);
    });
  });

  /**
   * Tests for edge cases and boundary conditions
   */
  describe("edge cases", () => {
    /**
     * Validates that minimum valid configuration works correctly
     * Tests the lower bounds of valid configuration
     */
    it("should handle minimum valid configuration", () => {
      expect(() => {
        new ApiRateLimiter({
          maxPerSecond: 1,
          maxPerMinute: 1,
          maxQueueSize: 1,
        });
      }).not.toThrow();
    });

    /**
     * Verifies proper handling of invalid zero-request configuration
     * Tests invalid configuration detection
     */
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
    /**
     * Validates that request capacity properly recovers over time
     * Tests the rate limit recovery mechanism
     */
    it("should recover request capacity over time", async () => {
      const limiter = new ApiRateLimiter<string>({
        maxPerSecond: 2,
        maxPerMinute: 4,
      });

      await limiter.addRequest(mockRequest);
      await limiter.addRequest(mockRequest);

      expect(limiter.getStatus().availableRequests).toBe(0);

      jest.advanceTimersByTime(1000);
      expect(limiter.getStatus().availableRequests).toBe(1);

      jest.advanceTimersByTime(60000);
      expect(limiter.getStatus().availableRequests).toBe(2);
    });
  });
});
