# API Rate Limiter

A robust and flexible TypeScript rate limiter for managing API request rates using dual constraints – per-second and per-minute limits – with automatic queue management and improved error handling.

https://www.npmjs.com/package/@sunniesfish/api-rate-limiter

## Features

- 🚦 **Dual Rate Limiting:** Specify limits for both requests per second and per minute.
- 🔄 **Automatic Queue Management:** Requests are queued up to a configurable maximum.
  - An additional request will throw a `QueueFullError` when the queue is full.
- ⏱ **Token Bucket Algorithm:**
  - The per-second token counter is reset every tick.
  - The per-minute token counter is gradually refilled based on elapsed time.
- 💪 **Type-Safe:** Full TypeScript support with clearly defined interfaces and error types.
- ⚡ **Promise-Based API:** Asynchronous API requests with integrated rate limiting.
- 🛡 **Configurable Error Handling:** Supply a custom error handler to process errors (e.g. logging, fallback strategies).
- 📊 **Real-Time Status Monitoring:** Use `getStatus()` to observe the current queue size, available tokens, and internal counters.
- 🔒 **Efficient Synchronization:** Utilizes an internal `AsyncLock` for safe concurrent access.

## Installation

```bash
npm install @sunniesfish/api-rate-limiter
```

## Quick Start

```typescript
import ApiRateLimiter from "@sunniesfish/api-rate-limiter";
import { QueueFullError } from "@sunniesfish/api-rate-limiter";
// Create a rate limiter instance with custom configuration and error handling
const rateLimiter = new ApiRateLimiter<string>(
  {
    maxPerSecond: 2, // Maximum 2 requests per second
    maxPerMinute: 10, // Maximum 10 requests per minute
    maxQueueSize: 5, // Queue up to 5 requests
  },
  (error) => {
    // Custom error handling logic
    console.error("Custom error handler:", error);
  }
);
// Example API request using the rate limiter
async function makeApiCall(): Promise<void> {
  try {
    const result = await rateLimiter.addRequest(async () => {
      const response = await fetch("https://api.example.com/data");
      return response.json();
    });
    console.log("API Response:", result);
  } catch (error) {
    if (error instanceof QueueFullError) {
      console.error("Queue is full. Please try again later.");
    } else {
      console.error("API request failed:", error);
    }
  }
}
makeApiCall();
```

## Configuration

The `ApiRateLimiterOptions` interface accepts the following options:

```typescript
interface ApiRateLimiterOptions {
  maxPerSecond?: number; // Maximum requests per second (default: 100)
  maxPerMinute?: number; // Maximum requests per minute (default: 1000)
  maxQueueSize?: number; // Maximum requests waiting in queue (default: 10000)
}
```

## API Reference

### Constructor

```typescript
constructor(
options: ApiRateLimiterOptions,
errorHandler?: (error: Error | unknown) => void
)
```

- **options:** Configuration specifying the per-second and per-minute limits as well as maximum queue size.
- **errorHandler (optional):** A function that handles errors during request processing.

### Methods

#### `addRequest<T>(request: () => Promise<T>): Promise<T>`

Adds a new API request to the rate limiter's queue.

- If tokens are available, the request is executed immediately.
- If the queue is full, a `QueueFullError` is thrown.

```typescript
const result = await rateLimiter.addRequest(async () => {
  // Your API call here
  return await someApiCall();
});
```

#### `getStatus(): Promise<RateLimiterStatus>`

```typescript
const status = await rateLimiter.getStatus();
console.log(status);
// {
// queueSize: number,
// availableRequests: number,
// mpsCounter: number, // Remaining per-second tokens
// mpmCounter: number // Remaining per-minute tokens (floored)
// }
```

## Error Handling

The library defines custom error types:

- **`InvalidOptionsError`:** Thrown when invalid configuration options are provided.
- **`QueueFullError`:** Thrown when attempting to add a request while the internal queue has reached its maximum capacity.

```typescript
import {
  InvalidOptionsError,
  QueueFullError,
} from "@sunniesfish/api-rate-limiter";
try {
  await rateLimiter.addRequest(someApiCall);
} catch (error) {
  if (error instanceof QueueFullError) {
    // Handle queue full scenario
  }
}
```

## Internal Implementation Notes

- **Token Bucket Refill:**  
  The per-second counter (`mpsCounter`) is reset each tick, and the per-minute counter (`mpmCounter`) is refilled gradually based on elapsed time.
- **Queue Management:**  
  When the queue is full (i.e. reaches `maxQueueSize`), new requests are rejected immediately with a `QueueFullError`, ensuring predictable behavior under high load.
- **Synchronization:**  
  An internal `AsyncLock` manages concurrent access to shared state (token counters and queue operations), ensuring safe updates.

## Testing

The package includes comprehensive tests. For example, the test suite validates that:

- When the queue reaches capacity, additional requests are rejected with a `QueueFullError`.
- The token bucket refill works correctly under partial time intervals.
- The custom error handler is invoked upon request failure.

Run the tests with:

```bash
npm test
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

If you encounter any issues or have questions, please file an issue on the [GitHub repository](https://github.com/sunniesfish/api-rate-limiter).
