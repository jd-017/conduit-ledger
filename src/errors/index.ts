/**
 * Base class for application errors with HTTP status codes.
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

/**
 * Thrown when a requested resource is not found.
 */
export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 404);
  }
}

/**
 * Thrown when request validation fails or business rules are violated.
 */
export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400);
  }
}

/**
 * Thrown when attempting to create a resource with a duplicate ID.
 */
export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409);
  }
}
