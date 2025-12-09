/**
 * Retry Handler Module
 * Provides exponential backoff and retry functionality for HTTP requests
 */

// Default configuration values
const DEFAULT_BASE_DELAY = 1000;  // 1 second
const DEFAULT_MAX_DELAY = 10000;  // 10 seconds
const DEFAULT_MAX_RETRIES = 3;

/**
 * Calculate exponential backoff delay
 * @param attempt - The retry attempt number (0-indexed)
 * @param baseDelay - Base delay in milliseconds (default: 1000)
 * @param maxDelay - Maximum delay cap in milliseconds (default: 10000)
 * @returns Delay in milliseconds
 */
export function calculateBackoff(
  attempt: number,
  baseDelay: number = DEFAULT_BASE_DELAY,
  maxDelay: number = DEFAULT_MAX_DELAY
): number {
  // Ensure attempt is non-negative
  const safeAttempt = Math.max(0, Math.floor(attempt));
  // Calculate exponential delay: baseDelay * 2^attempt
  const delay = baseDelay * Math.pow(2, safeAttempt);
  // Cap at maxDelay
  return Math.min(delay, maxDelay);
}

/**
 * Determine if a request should be retried based on status code and attempt count
 * @param status - HTTP status code (or 0 for network errors)
 * @param attempt - Current attempt number (0-indexed)
 * @param maxRetries - Maximum number of retries allowed
 * @returns true if should retry, false otherwise
 */
export function shouldRetry(
  status: number,
  attempt: number,
  maxRetries: number = DEFAULT_MAX_RETRIES
): boolean {
  // Don't retry if we've exhausted attempts
  if (attempt >= maxRetries) {
    return false;
  }
  // Retry on network errors (status 0) or 5xx server errors
  // Don't retry on 4xx client errors
  return status === 0 || (status >= 500 && status < 600);
}

/**
 * Execute a fetch request with automatic retry on failure
 * @param url - The URL to fetch
 * @param options - Fetch options
 * @param maxRetries - Maximum number of retries (default: 3)
 * @param baseDelay - Base delay for backoff (default: 1000ms)
 * @param maxDelay - Maximum delay cap (default: 10000ms)
 * @returns Response from the fetch
 * @throws Error if all retries fail
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number = DEFAULT_MAX_RETRIES,
  baseDelay: number = DEFAULT_BASE_DELAY,
  maxDelay: number = DEFAULT_MAX_DELAY
): Promise<Response> {
  let lastError: Error | null = null;
  let lastStatus = 0;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = calculateBackoff(attempt - 1, baseDelay, maxDelay);
        console.log(`[Retry] Attempt ${attempt}/${maxRetries} after ${delay}ms delay for ${url}`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      const response = await fetch(url, options);
      lastStatus = response.status;

      // If successful or client error (4xx), return immediately
      if (response.ok || (response.status >= 400 && response.status < 500)) {
        return response;
      }

      // Server error (5xx) - check if we should retry
      if (!shouldRetry(response.status, attempt, maxRetries)) {
        return response;
      }

      console.log(`[Retry] Request failed with status ${response.status}, will retry...`);
    } catch (error) {
      // Network error
      lastError = error instanceof Error ? error : new Error(String(error));
      lastStatus = 0;
      console.log(`[Retry] Network error: ${lastError.message}, attempt ${attempt}/${maxRetries}`);

      if (!shouldRetry(0, attempt, maxRetries)) {
        throw new Error(`Upstream error after ${attempt + 1} retries: ${lastError.message}`);
      }
    }
  }

  // All retries exhausted
  if (lastError) {
    throw new Error(`Upstream error after ${maxRetries + 1} retries: ${lastError.message}`);
  }
  
  // Return a synthetic error response for 5xx failures
  throw new Error(`Upstream error after ${maxRetries + 1} retries: HTTP ${lastStatus}`);
}
