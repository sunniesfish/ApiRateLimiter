class InvalidOptionsError extends Error {
  constructor() {
    super("Invalid options provided to the rate limiter");
    this.name = "InvalidOptionsError";
  }
}

class QueueFullError extends Error {
  constructor() {
    super("Rate limiter queue is full");
    this.name = "QueueFullError";
  }
}

export { InvalidOptionsError, QueueFullError };
