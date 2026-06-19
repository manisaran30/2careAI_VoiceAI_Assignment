import { logger } from '../logger';

interface RetryOptions {
  maxAttempts?: number;
  baseDelay?: number;
  maxDelay?: number;
}

const defaultOptions: Required<RetryOptions> = {
  maxAttempts: 3,
  baseDelay: 100,
  maxDelay: 2000,
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  context: string,
  options?: RetryOptions
): Promise<T> {
  const { maxAttempts, baseDelay, maxDelay } = { ...defaultOptions, ...options };

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
        logger.warn(context, `Attempt ${attempt}/${maxAttempts} failed, retrying in ${delay}ms`, {
          error: err instanceof Error ? err.message : String(err),
        });
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  logger.error(context, `All ${maxAttempts} attempts failed`, {
    error: lastError instanceof Error ? lastError.message : String(lastError),
  });
  throw lastError;
}
