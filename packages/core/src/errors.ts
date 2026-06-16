/**
 * Custom error types for TokViz operations.
 */

/**
 * Base class for all TokViz errors.
 */
export class TokVizError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokVizError';
  }
}

/**
 * Error reading or parsing configuration files.
 */
export class ConfigError extends TokVizError {
  constructor(
    message: string,
    public readonly path?: string
  ) {
    super(message);
    this.name = 'ConfigError';
  }
}

/**
 * Error reading, writing, or parsing event data.
 */
export class DataError extends TokVizError {
  constructor(
    message: string,
    public readonly path?: string
  ) {
    super(message);
    this.name = 'DataError';
  }
}

/**
 * Error validating user input or hook payload.
 */
export class ValidationError extends TokVizError {
  constructor(
    message: string,
    public readonly field?: string
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Error during file system operations.
 */
export class FileSystemError extends TokVizError {
  constructor(
    message: string,
    public readonly path?: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'FileSystemError';
    if (cause) {
      this.stack = `${this.stack}\nCaused by: ${cause.stack}`;
    }
  }
}
