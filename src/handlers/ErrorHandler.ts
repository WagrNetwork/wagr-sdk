// Feature 5: Error Handling & Retry - Comprehensive error handling

export enum ErrorCode {
  NETWORK_ERROR = 'NETWORK_ERROR',
  CONTRACT_ERROR = 'CONTRACT_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',
  UNAUTHORIZED = 'UNAUTHORIZED',
  NOT_FOUND = 'NOT_FOUND',
  TIMEOUT = 'TIMEOUT',
  UNKNOWN = 'UNKNOWN',
}

export interface WagrError {
  code: ErrorCode;
  message: string;
  originalError?: Error;
  context?: Record<string, unknown>;
  timestamp: number;
}

export class ErrorHandler {
  private errors: WagrError[] = [];
  private maxErrors: number = 100;

  handle(error: Error | WagrError, context?: Record<string, unknown>): WagrError {
    const wagrError = this.parseError(error, context);
    this.errors.push(wagrError);

    if (this.errors.length > this.maxErrors) {
      this.errors.shift();
    }

    return wagrError;
  }

  private parseError(error: Error | WagrError, context?: Record<string, unknown>): WagrError {
    if ('code' in error) {
      return error as WagrError;
    }

    const message = error.message || String(error);

    let code = ErrorCode.UNKNOWN;
    if (message.includes('network') || message.includes('fetch')) {
      code = ErrorCode.NETWORK_ERROR;
    } else if (message.includes('contract') || message.includes('Contract')) {
      code = ErrorCode.CONTRACT_ERROR;
    } else if (message.includes('unauthorized') || message.includes('Unauthorized')) {
      code = ErrorCode.UNAUTHORIZED;
    } else if (message.includes('not found') || message.includes('404')) {
      code = ErrorCode.NOT_FOUND;
    } else if (message.includes('timeout') || message.includes('Timeout')) {
      code = ErrorCode.TIMEOUT;
    }

    return {
      code,
      message,
      originalError: error as Error,
      context,
      timestamp: Date.now() / 1000,
    };
  }

  async retry<T>(
    fn: () => Promise<T>,
    maxAttempts: number = 3,
    backoffMs: number = 1000,
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        if (attempt < maxAttempts - 1) {
          const delay = backoffMs * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('Retry exhausted');
  }

  isRetryable(error: WagrError | Error): boolean {
    const wagrError = 'code' in error ? error : this.parseError(error as Error);

    return (
      wagrError.code === ErrorCode.NETWORK_ERROR ||
      wagrError.code === ErrorCode.TIMEOUT
    );
  }

  getErrors(limit: number = 10): WagrError[] {
    return this.errors.slice(-limit);
  }

  clearErrors(): void {
    this.errors = [];
  }

  log(error: WagrError): void {
    console.error(`[${error.code}] ${error.message}`, error.context);
  }
}

export function createErrorHandler(): ErrorHandler {
  return new ErrorHandler();
}
