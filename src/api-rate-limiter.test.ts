import ApiRateLimiter from "./ApiRateLimiter";
import { InvalidOptionsError, QueueFullError } from "./errors";
import { TIME_CONSTANTS } from "./constants";

describe("ApiRateLimiter", () => {
  const defaultOptions = {
    maxPerSecond: 3,
    maxPerMinute: 50,
    maxQueueSize: 100,
  };

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("initialization", () => {
    it("should initialize with valid options", () => {
      const limiter = new ApiRateLimiter(defaultOptions);
      expect(limiter).toBeDefined();
    });

    it("should throw InvalidOptionsError for invalid options", () => {
      expect(
        () => new ApiRateLimiter({ ...defaultOptions, maxPerSecond: 0 })
      ).toThrow(InvalidOptionsError);
      expect(
        () => new ApiRateLimiter({ ...defaultOptions, maxPerMinute: -1 })
      ).toThrow(InvalidOptionsError);
      expect(
        () => new ApiRateLimiter({ ...defaultOptions, maxQueueSize: 0 })
      ).toThrow(InvalidOptionsError);
    });
  });

  describe("request handling", () => {
    it("should reject requests when queue is full", async () => {
      const limiter = new ApiRateLimiter({
        ...defaultOptions,
        maxQueueSize: 1,
      });

      const mockRequest = jest.fn(() => Promise.resolve("test"));

      //first request resolved immediately
      const firstRequestPromise = limiter.addRequest(mockRequest);

      //second request ready to be processed
      const secondRequestPromise = limiter.addRequest(mockRequest);

      //third request rejected because queue is full
      const thirdRequestPromise = limiter.addRequest(mockRequest);
      await expect(thirdRequestPromise).rejects.toThrow(QueueFullError);

      await Promise.all([firstRequestPromise, secondRequestPromise]);
    });

    it("should process requests within rate limits", async () => {
      console.log("=====start test");
      const limiter = new ApiRateLimiter({
        maxPerSecond: 2,
        maxPerMinute: 5,
        maxQueueSize: 10,
        processInterval: 1000, // 1초 간격으로 큐를 처리
      });

      // 2. 요청 Mock 함수
      const mockRequest = jest.fn((param: string | number) => {
        console.log(param + " is resolving ");
        return Promise.resolve("Response for " + param);
      });

      // 3. 요청 추가
      const req1 = limiter.addRequest(() => mockRequest("fn 1")); // 첫 번째 요청
      const req2 = limiter.addRequest(() => mockRequest("fn 2")); // 두 번째 요청
      const req3 = limiter.addRequest(() => mockRequest("fn 2")); // 세 번째 요청

      // 4. 첫 번째 타이머 주기
      jest.advanceTimersByTime(1000); // 1초 경과
      await Promise.all([req1, req2]); // 첫 번째와 두 번째 요청이 처리되어야 함
      expect(mockRequest).toHaveBeenCalledTimes(2); // 두 요청 처리 확인

      // 5. 두 번째 타이머 주기
      jest.advanceTimersByTime(1000); // 또 1초 경과
      await req3; // 세 번째 요청이 처리되어야 함
      expect(mockRequest).toHaveBeenCalledTimes(3); // 총 3개의 요청 처리 확인
      console.log("test end==========");
    });

    it("should handle failed requests properly", async () => {
      const limiter = new ApiRateLimiter(defaultOptions);
      const mockError = new Error("API Error");
      const mockRequest = jest.fn().mockRejectedValue(mockError);

      await expect(limiter.addRequest(mockRequest)).rejects.toThrow(mockError);
    });
  });

  describe("status reporting", () => {
    it("should report correct status", async () => {
      const limiter = new ApiRateLimiter({
        maxPerSecond: 5,
        maxPerMinute: 10,
        maxQueueSize: 10,
      });
      const mockRequest = jest.fn().mockResolvedValue("test");

      // Add some requests
      const requests = Array(3)
        .fill(null)
        .map(() => limiter.addRequest(mockRequest));

      jest.advanceTimersByTime(500);
      await Promise.all(requests);

      const status = limiter.getStatus();
      expect(status).toEqual({
        queueSize: 0,
        requestsLastSecond: 3,
        requestsLastMinute: 3,
      });
    });

    it("should clear expired requests from history", async () => {
      const limiter = new ApiRateLimiter(defaultOptions);
      const mockRequest = jest.fn().mockResolvedValue("test");

      await limiter.addRequest(mockRequest);

      // Advance time beyond the tracking windows
      jest.advanceTimersByTime(TIME_CONSTANTS.MINUTE_IN_MS + 1000);

      const status = limiter.getStatus();
      expect(status).toEqual({
        queueSize: 0,
        requestsLastSecond: 0,
        requestsLastMinute: 0,
      });
    });
  });

  describe("error handling", () => {
    it("should use custom error handler", async () => {
      const mockErrorHandler = jest.fn();
      const limiter = new ApiRateLimiter(defaultOptions, mockErrorHandler);
      const mockError = new Error("Custom Error");
      const mockRequest = jest.fn().mockRejectedValue(mockError);

      await expect(limiter.addRequest(mockRequest)).rejects.toThrow(mockError);
      expect(mockErrorHandler).toHaveBeenCalledWith(mockError);
    });
  });

  describe("queue processing", () => {
    it("should process queue at specified intervals", async () => {
      const processInterval = 1000;
      const limiter = new ApiRateLimiter({
        ...defaultOptions,
        processInterval,
      });
      const mockRequest = jest.fn().mockResolvedValue("test");

      const requests = Array(2)
        .fill(null)
        .map(() => limiter.addRequest(mockRequest));

      await Promise.all([requests[0]]);
      expect(mockRequest).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(processInterval);
      await Promise.all([requests[1]]);
      expect(mockRequest).toHaveBeenCalledTimes(2);
    }, 10000);
  });
});
