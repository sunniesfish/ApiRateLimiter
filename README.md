# FIXING!!

# API Rate Limiter

A TypeScript library for rate limiting and queuing API requests.

## Features

- Configurable per-second and per-minute request limits
- Adjustable queue size
- Type-safe API request handling
- Custom error handling support

## Installation

not published yet

## Usage

```typescript
import ApiRateLimiter from "./ApiRateLimiter";

// Initialize rate limiter
const limiter = new ApiRateLimiter({
  maxPerSecond: 10, // Maximum requests per second
  maxPerMinute: 50, // Maximum requests per minute
  maxQueueSize: 100, // Maximum queue size
});

// Add API request
const apiCall = async () => {
  try {
    const result = await limiter.addRequest(async () => {
      const response = await fetch("https://api.example.com/data");
      return response.json();
    });
    console.log(result);
  } catch (error) {
    console.error("API request failed:", error);
  }
};
```

## API Documentation

### `ApiRateLimiter`

#### Constructor Options

```typescript
interface ApiRateLimiterOptions {
  maxPerSecond: number; // Maximum requests per second
  maxPerMinute: number; // Maximum requests per minute
  maxQueueSize: number; // Maximum queue size
  processInterval?: number; // Queue processing interval (ms, default: 1000)
}
```

#### Methods

- `addRequest<T>(request: () => Promise<T>): Promise<T>`

  - Adds an API request to the queue
  - Throws `QueueFullError` if queue is at capacity

- `getStatus(): RateLimiterStatus`
  - Returns current rate limiter status
  - Includes queue size and request counts for last second/minute

## Error Handling

The library may throw the following errors:

- `InvalidOptionsError`: When invalid options are provided
- `QueueFullError`: When the queue is full

## Testing

Run the test suite:

```bash
npm test
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT

```

```
