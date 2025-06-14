/**
 * @fileoverview Test suite for ApiRateLimiter class
 * Comprehensive tests covering rate limiting functionality, error handling,
 * concurrent request processing, and resource management
 */

import ApiRateLimiter from "../src/api-rate-limiter";
import { InvalidOptionsError } from "../src/errors";

/**
 * Test suite for ApiRateLimiter class
 * Tests rate limiting functionality, error handling, and resource management
 */
describe("ApiRateLimiter", () => {
  let setImmediateSpy: jest.SpyInstance;
  const mockRequest = jest.fn().mockResolvedValue("success");

  beforeEach(() => {
    // Use fake timers to control time-based operations in tests
    jest.useFakeTimers();

    // Mock setImmediate to work with fake timers
    setImmediateSpy = jest
      .spyOn(global, "setImmediate")
      .mockImplementation((fn) => {
        const timeoutId = setTimeout(fn, 0);
        return timeoutId as any;
      });

    mockRequest.mockClear();
    jest.clearAllTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
    setImmediateSpy.mockRestore();
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
      const status = limiter.getStatus();
      expect(status.availableRequests).toBeGreaterThan(0);
    });
  });

  /**
   * Tests for request handling functionality
   */
  describe("addRequest", () => {
    it("should execute request immediately when capacity is available", async () => {
      const rateLimiter = new ApiRateLimiter<string>({
        maxPerSecond: 2,
        maxPerMinute: 10,
      });
      const request = rateLimiter.addRequest(mockRequest);

      jest.advanceTimersByTime(0);
      const result = await request;

      expect(result).toBe("success");
      expect(mockRequest).toHaveBeenCalledTimes(1);
    });

    it("should queue requests when at capacity", async () => {
      const rateLimiter = new ApiRateLimiter<string>({
        maxPerSecond: 2,
        maxPerMinute: 10,
      });
      const request1 = rateLimiter.addRequest(mockRequest);
      const request2 = rateLimiter.addRequest(mockRequest);
      const request3 = rateLimiter.addRequest(mockRequest);

      jest.advanceTimersByTime(0);

      await expect(request1).resolves.toBe("success");
      await expect(request2).resolves.toBe("success");

      jest.advanceTimersByTime(1000);
      await expect(request3).resolves.toBe("success");
    });
  });

  /**
   * Tests for rate limiting behavior
   */
  describe("rate limiting", () => {
    it("should respect maxPerSecond limit with precise timing", async () => {
      const rateLimiter = new ApiRateLimiter<string>({
        maxPerSecond: 3,
        maxPerMinute: 10,
      });

      // First batch: should execute immediately (within capacity)
      const firstBatch = Array(2)
        .fill(null)
        .map(() => rateLimiter.addRequest(mockRequest));

      jest.advanceTimersByTime(1000);
      await Promise.all(firstBatch);

      const statusAfterFirstBatch = rateLimiter.getStatus();
      expect(mockRequest).toHaveBeenCalledTimes(2);
      expect(statusAfterFirstBatch.queueSize).toBe(0);
      expect(statusAfterFirstBatch.availableRequests).toBe(1); // 3 - 2 = 1 remaining

      // Second batch: 3 requests should execute immediately, 2 should queue
      const secondBatch1 = Array(3)
        .fill(null)
        .map(async () => rateLimiter.addRequest(mockRequest));

      const secondBatch2 = Array(2)
        .fill(null)
        .map(async () => rateLimiter.addRequest(mockRequest));

      jest.advanceTimersByTime(1000);
      await Promise.all(secondBatch1);

      const statusAfterSecondBatch = rateLimiter.getStatus();
      expect(mockRequest).toHaveBeenCalledTimes(5); // 2 + 3 = 5
      expect(statusAfterSecondBatch.queueSize).toBe(2); // 2 requests still queued
      expect(statusAfterSecondBatch.availableRequests).toBe(0); // No capacity left
    });

    it("should partially refill mpmCounter based on elapsed time", async () => {
      const maxPerMinute = 10;
      const maxPerSecond = 5;
      const limiter = new ApiRateLimiter<string>({
        maxPerMinute,
        maxPerSecond,
      });

      // Manually set mpmCounter to 0 to test refill behavior
      (limiter as any).mpmCounter = 0;
      (limiter as any).lastMpmRefill = Date.now();

      // Advance time by 30 seconds (half a minute)
      jest.advanceTimersByTime(30000);

      const dummyRequest = jest.fn(() => Promise.resolve("response"));
      const requestPromise = limiter.addRequest(dummyRequest);

      jest.advanceTimersByTime(0);

      await requestPromise;

      const status = limiter.getStatus();
      expect(dummyRequest).toHaveBeenCalledTimes(1);
      // After 30 seconds, should have refilled 5 tokens (half of maxPerMinute)
      // After processing 1 request, should have 4 tokens left
      expect(status.mpmCounter).toBe(4);
    });
  });

  /**
   * Tests for status reporting functionality
   */
  describe("getStatus", () => {
    it("should return correct queue size and available requests", async () => {
      const rateLimiter = new ApiRateLimiter<string>({
        maxPerSecond: 2,
        maxPerMinute: 10,
      });
      const request1 = rateLimiter.addRequest(mockRequest);
      const request2 = rateLimiter.addRequest(mockRequest);
      const request3 = rateLimiter.addRequest(mockRequest);

      jest.advanceTimersByTime(1000);
      await Promise.all([request1, request2]);

      const status = rateLimiter.getStatus();
      expect(status.queueSize).toBe(1);
      expect(status.availableRequests).toBe(0);
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

      limiter.addRequest(mockRequest);

      // Advance time significantly to ensure all processing is complete
      jest.advanceTimersByTime(60000);

      // Timer should be cleared when no more requests to process
      // @ts-ignore - Accessing private property for testing
      expect(limiter.timer).toBeNull();
    });

    it("should not leak memory when processing many requests", async () => {
      const limiter = new ApiRateLimiter<string>({
        maxPerSecond: 50,
        maxPerMinute: 200,
      });

      // Create a large number of requests to test memory management
      const requests = Array(100)
        .fill(null)
        .map(() => limiter.addRequest(mockRequest));

      jest.advanceTimersByTime(0);

      // Allow sufficient time for all requests to process
      jest.advanceTimersByTime(3000);

      const status = limiter.getStatus().queueSize;
      expect(status).toBe(0); // All requests should be processed
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

      // Add 3 requests simultaneously
      const promise1 = limiter.addRequest(concurrentMockRequest);
      const promise2 = limiter.addRequest(concurrentMockRequest);
      const promise3 = limiter.addRequest(concurrentMockRequest);

      // First tick: should process 2 requests (maxPerSecond = 2)
      jest.advanceTimersByTime(1000);
      await Promise.all([promise1, promise2]);

      expect(concurrentMockRequest).toHaveBeenCalledTimes(2);

      // Second tick: should process the remaining 1 request
      jest.advanceTimersByTime(1000);
      await Promise.all([promise1, promise2, promise3]);

      expect(concurrentMockRequest).toHaveBeenCalledTimes(3);

      // All promises should resolve successfully
      await expect(promise1).resolves.toBe("success");
      await expect(promise2).resolves.toBe("success");
      await expect(promise3).resolves.toBe("success");
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

      // Initial state: full capacity
      const initialStatus = limiter.getStatus();
      expect(initialStatus.availableRequests).toBe(2);
      expect(initialStatus.mpsCounter).toBe(2);
      expect(initialStatus.mpmCounter).toBe(4);

      // Add 3 requests (2 should execute immediately, 1 should queue)
      const request1 = limiter.addRequest(mockRequest);
      const request2 = limiter.addRequest(mockRequest);
      const request3 = limiter.addRequest(mockRequest);

      // First tick: process 2 requests
      jest.advanceTimersByTime(1000);
      await Promise.all([request1, request2]);

      const afterRequestsStatus = limiter.getStatus();
      expect(afterRequestsStatus.availableRequests).toBe(0); // No immediate capacity
      expect(afterRequestsStatus.mpsCounter).toBe(0); // Per-second counter depleted
      expect(afterRequestsStatus.mpmCounter).toBe(2); // Per-minute counter: 4 - 2 = 2

      // Second tick: mpsCounter resets to 2, process 1 more request
      jest.advanceTimersByTime(1000);
      await Promise.all([request3]);

      const afterRequest3Status = limiter.getStatus();
      expect(afterRequest3Status.availableRequests).toBe(1); // 1 request capacity available
      expect(afterRequest3Status.mpsCounter).toBe(1); // 2 - 1 = 1 remaining this second
      expect(afterRequest3Status.mpmCounter).toBe(1); // 2 - 1 = 1 remaining this minute
    });
  });
});
