# API Rate Limiter

A robust and flexible TypeScript rate limiter for managing API request rates using dual constraints – per-second and per-minute limits – with automatic queue management and improved error handling.

https://www.npmjs.com/package/@sunniesfish/api-rate-limiter

## Features

- 🚦 **Dual Rate Limiting:** Specify limits for both requests per second and per minute.
- 🔄 **Automatic Queue Management:** Requests are automatically queued when rate limits are reached.
  - No queue size limit - requests are processed as tokens become available.
- ⏱ **Token Bucket Algorithm:**
  - The per-second token counter is reset every tick.
  - The per-minute token counter is gradually refilled based on elapsed time.
- 💪 **Type-Safe:** Full TypeScript support with clearly defined interfaces and error types.
- ⚡ **Promise-Based API:** Asynchronous API requests with integrated rate limiting.
- 🎯 **Simple Error Handling:** Direct promise resolution/rejection - handle errors as you prefer.
- 📊 **Real-Time Status Monitoring:** Use `getStatus()` to observe the current queue size, available tokens, and internal counters.
- 🔒 **Efficient Synchronization:** Utilizes an internal `AsyncLock` for safe concurrent access.

## Installation

```bash
npm install @sunniesfish/api-rate-limiter
```

## Quick Start

```typescript
import ApiRateLimiter from "@sunniesfish/api-rate-limiter";

// Create a rate limiter instance with custom configuration
const rateLimiter = new ApiRateLimiter<string>({
  maxPerSecond: 2, // Maximum 2 requests per second
  maxPerMinute: 10, // Maximum 10 requests per minute
});

// Example API request using the rate limiter
async function makeApiCall(): Promise<void> {
  try {
    const result = await rateLimiter.addRequest(async () => {
      const response = await fetch("https://api.example.com/data");
      return response.json();
    });
    console.log("API Response:", result);
  } catch (error) {
    console.error("API request failed:", error);
  }
}

makeApiCall();
```

## Advanced Usage

### Multiple API Endpoints

You can create separate rate limiters for different API endpoints with different limits:

```typescript
import ApiRateLimiter from "@sunniesfish/api-rate-limiter";

// High-frequency endpoint (e.g., analytics)
const analyticsLimiter = new ApiRateLimiter({
  maxPerSecond: 10,
  maxPerMinute: 500,
});

// Low-frequency endpoint (e.g., user management)
const userLimiter = new ApiRateLimiter({
  maxPerSecond: 2,
  maxPerMinute: 100,
});

async function trackEvent(event: string) {
  return analyticsLimiter.addRequest(async () => {
    return fetch("/api/analytics/track", {
      method: "POST",
      body: JSON.stringify({ event }),
    });
  });
}

async function updateUser(userId: string, data: any) {
  return userLimiter.addRequest(async () => {
    return fetch(`/api/users/${userId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  });
}
```

### Monitoring and Debugging

Use the `getStatus()` method to monitor your rate limiter's performance:

```typescript
const limiter = new ApiRateLimiter({
  maxPerSecond: 5,
  maxPerMinute: 100,
});

// Monitor the limiter status
setInterval(() => {
  const status = limiter.getStatus();
  console.log(
    `Queue: ${status.queueSize}, Available: ${status.availableRequests}`
  );

  if (status.queueSize > 10) {
    console.warn("Queue is getting large, consider adjusting rate limits");
  }
}, 5000);

// Your API requests...
```

### Batch Processing

The rate limiter efficiently handles batch requests:

```typescript
const limiter = new ApiRateLimiter({
  maxPerSecond: 3,
  maxPerMinute: 50,
});

async function processBatch(items: string[]) {
  const promises = items.map((item) =>
    limiter.addRequest(async () => {
      // Process each item
      return await processItem(item);
    })
  );

  try {
    const results = await Promise.all(promises);
    console.log("Batch completed:", results.length);
    return results;
  } catch (error) {
    console.error("Batch failed:", error);
    throw error;
  }
}
```

### Error Recovery Patterns

```typescript
const limiter = new ApiRateLimiter({
  maxPerSecond: 2,
  maxPerMinute: 30,
});

async function resilientApiCall(data: any, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await limiter.addRequest(async () => {
        const response = await fetch("/api/data", {
          method: "POST",
          body: JSON.stringify(data),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return response.json();
      });
    } catch (error) {
      console.warn(`Attempt ${attempt} failed:`, error);

      if (attempt === maxRetries) {
        throw new Error(`Failed after ${maxRetries} attempts: ${error}`);
      }

      // Wait before retry (exponential backoff)
      await new Promise((resolve) =>
        setTimeout(resolve, Math.pow(2, attempt) * 1000)
      );
    }
  }
}
```

## Configuration

The `ApiRateLimiterOptions` interface accepts the following options:

```typescript
interface ApiRateLimiterOptions {
  maxPerSecond?: number; // Maximum requests per second (default: 100)
  maxPerMinute?: number; // Maximum requests per minute (default: 1000)
}
```

## API Reference

### Constructor

```typescript
constructor(options: ApiRateLimiterOptions)
```

- **options:** Configuration specifying the per-second and per-minute limits.

### Methods

#### `addRequest<T>(request: () => Promise<T>): Promise<T>`

Adds a new API request to the rate limiter's queue.

- If tokens are available, the request is executed immediately.
- If tokens are not available, the request is queued and executed when tokens become available.
- Returns a Promise that resolves/rejects based on your API request's outcome.

```typescript
const result = await rateLimiter.addRequest(async () => {
  // Your API call here
  return await someApiCall();
});
```

#### `getStatus(): RateLimiterStatus`

Returns the current status of the rate limiter.

```typescript
const status = rateLimiter.getStatus();
console.log(status);
// {
//   queueSize: number,
//   availableRequests: number,
//   mpsCounter: number, // Remaining per-second tokens
//   mpmCounter: number  // Remaining per-minute tokens (floored)
// }
```

## Error Handling

The library defines custom error types:

- **`InvalidOptionsError`:** Thrown when invalid configuration options are provided.

```typescript
import { InvalidOptionsError } from "@sunniesfish/api-rate-limiter";

try {
  const rateLimiter = new ApiRateLimiter({
    maxPerSecond: 100,
    maxPerMinute: 50, // Invalid: maxPerSecond > maxPerMinute
  });
} catch (error) {
  if (error instanceof InvalidOptionsError) {
    console.error("Invalid configuration:", error.message);
  }
}
```

## Internal Implementation Notes

- **Token Bucket Refill:**  
  The per-second counter (`mpsCounter`) is reset each tick, and the per-minute counter (`mpmCounter`) is refilled gradually based on elapsed time.
- **Queue Management:**  
  Requests are automatically queued when rate limits are reached. There's no queue size limit - the library manages memory efficiently through batch processing.
- **Synchronization:**  
  An internal `AsyncLock` manages concurrent access to shared state (token counters and queue operations), ensuring safe updates.

## Testing

The package includes comprehensive tests. For example, the test suite validates that:

- Rate limiting works correctly for both per-second and per-minute limits.
- The token bucket refill works correctly under partial time intervals.
- Concurrent requests are handled safely without race conditions.

Run the tests with:

```bash
npm run test
```

## Changelog

### v2.0.0 (Latest)

**Breaking Changes:**

- **Removed `errorHandler` parameter** from constructor - errors are now handled through standard Promise rejection
- **Removed `QueueFullError`** - no more queue size limits
- **Removed `maxQueueSize` option** - unlimited queue with efficient memory management
- **Changed `getStatus()` to synchronous** - no longer returns a Promise

**Improvements:**

- Simplified API design for better developer experience
- More efficient memory management with unlimited queuing
- Better error handling through standard Promise patterns
- Enhanced batch processing performance

**Migration Guide from v1.x:**

```typescript
// Old way (v1.x)
const limiter = new ApiRateLimiter(
  { maxPerSecond: 5, maxPerMinute: 100, maxQueueSize: 50 },
  (error) => console.error("Custom handler:", error)
);

// New way (v2.0.0+)
const limiter = new ApiRateLimiter({
  maxPerSecond: 5,
  maxPerMinute: 100,
  // No maxQueueSize needed
  // No errorHandler needed
});

// Handle errors directly in your code
try {
  const result = await limiter.addRequest(apiCall);
} catch (error) {
  console.error("Handle error as needed:", error);
}
```

## Contributing

Contributions are welcome! To contribute:

1. Fork the repository.
2. Create your feature branch (`git checkout -b feature/AmazingFeature`).
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4. Push to the branch (`git push origin feature/AmazingFeature`).
5. Open a Pull Request.

## License

MIT

## Support

If you encounter any issues or have questions, please file an issue on the [GitHub repository](https://github.com/sunniesfish/ApiRateLimiter).
