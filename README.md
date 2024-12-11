# API Rate Limiter

A robust and flexible TypeScript rate limiter for managing API request rates with per-second and per-minute constraints.

## Features

- 🚦 Dual rate limiting (requests per second and minute)
- 🔄 Automatic queue management
- 💪 Type-safe with full TypeScript support
- ⚡ Promise-based API
- 🛡️ Configurable error handling
- 📊 Real-time status monitoring

## Installation

```bash
npm install api-rate-limiter
# or
yarn add api-rate-limiter
```

## Quick Start

```typescript
import ApiRateLimiter from "api-rate-limiter";

// Create a rate limiter instance
const rateLimiter = new ApiRateLimiter<string>({
  maxPerSecond: 2, // Maximum 2 requests per second
  maxPerMinute: 10, // Maximum 10 requests per minute
  maxQueueSize: 5, // Queue up to 5 requests
});

// Example API request
const makeApiCall = async () => {
  try {
    const result = await rateLimiter.addRequest(async () => {
      const response = await fetch("https://api.example.com/data");
      return response.json();
    });
    console.log(result);
  } catch (error) {
    console.error("API request failed:", error);
  }
};
```

## Configuration

The `ApiRateLimiter` constructor accepts the following options:

```typescript
interface ApiRateLimiterOptions {
  maxPerSecond?: number; // Default: 100
  maxPerMinute?: number; // Default: 1000
  maxQueueSize?: number; // Default: 10000
}
```

## API Reference

### Constructor

```typescript
constructor(options: ApiRateLimiterOptions, errorHandler?: (error: Error | unknown) => void)
```

### Methods

#### `addRequest<T>(request: () => Promise<T>): Promise<T>`

Adds a new request to the rate limiter queue.

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
//   mpsCounter: number,
//   mpmCounter: number
// }
```

## Error Handling

The library includes three custom error types:

- `InvalidOptionsError`: Thrown when invalid configuration options are provided
- `QueueFullError`: Thrown when the request queue reaches its maximum capacity

```typescript
import { InvalidOptionsError, QueueFullError } from "api-rate-limiter";

try {
  await rateLimiter.addRequest(apiCall);
} catch (error) {
  if (error instanceof QueueFullError) {
    // Handle queue full scenario
  }
}
```

## Advanced Usage

### Custom Error Handler

```typescript
const rateLimiter = new ApiRateLimiter<string>(
  {
    maxPerSecond: 2,
    maxPerMinute: 10,
  },
  (error) => {
    // Custom error handling logic
    console.error("Custom error handler:", error);
  }
);
```

### Status Monitoring

```typescript
setInterval(() => {
  const status = rateLimiter.getStatus();
  console.log("Current rate limiter status:", status);
}, 1000);
```

## Testing

The package includes comprehensive tests. Run them using:

```bash
npm test
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## Support

If you encounter any issues or have questions, please file an issue on the GitHub repository.
