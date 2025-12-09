/**
 * Rate Limiter Module
 * Implements sliding window rate limiting for the Tempo API Proxy
 */

// ============== Types ==============

export interface RateLimitConfig {
  enabled: boolean;
  windowMs: number;      // Time window in milliseconds
  maxRequests: number;   // Maximum requests per window
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number;   // Seconds until rate limit resets
  remaining: number;     // Remaining requests in current window
}

interface RequestRecord {
  timestamp: number;
}

// ============== Configuration ==============

/**
 * Get rate limit configuration from environment variables
 * Defaults to disabled if not configured
 */
export function getRateLimitConfig(): RateLimitConfig {
  const enabled = Deno.env.get("RATE_LIMIT_ENABLED")?.toLowerCase() === "true";
  const windowMs = parseInt(Deno.env.get("RATE_LIMIT_WINDOW") || "60000", 10);
  const maxRequests = parseInt(Deno.env.get("RATE_LIMIT_MAX") || "60", 10);

  return {
    enabled,
    windowMs: isNaN(windowMs) ? 60000 : windowMs,
    maxRequests: isNaN(maxRequests) ? 60 : maxRequests,
  };
}

// ============== Rate Limiter ==============

/**
 * Sliding window rate limiter
 * Tracks requests per client IP within a time window
 */
export class RateLimiter {
  private requests: Map<string, RequestRecord[]> = new Map();
  private config: RateLimitConfig;
  private cleanupInterval: number | null = null;

  constructor(config?: Partial<RateLimitConfig>) {
    const defaultConfig = getRateLimitConfig();
    this.config = {
      enabled: config?.enabled ?? defaultConfig.enabled,
      windowMs: config?.windowMs ?? defaultConfig.windowMs,
      maxRequests: config?.maxRequests ?? defaultConfig.maxRequests,
    };

    // Start cleanup interval if enabled
    if (this.config.enabled) {
      this.startCleanup();
    }
  }

  /**
   * Check if a request is allowed for the given client ID
   * @param clientId - Client identifier (typically IP address)
   * @returns RateLimitResult with allowed status and metadata
   */
  checkLimit(clientId: string): RateLimitResult {
    // If rate limiting is disabled, always allow
    if (!this.config.enabled) {
      return { allowed: true, remaining: this.config.maxRequests };
    }

    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    // Get existing requests for this client
    let clientRequests = this.requests.get(clientId) || [];

    // Filter to only requests within the current window
    clientRequests = clientRequests.filter(r => r.timestamp > windowStart);

    // Calculate remaining requests
    const requestCount = clientRequests.length;
    const remaining = Math.max(0, this.config.maxRequests - requestCount);

    // Check if limit exceeded
    if (requestCount >= this.config.maxRequests) {
      // Calculate retry-after based on oldest request in window
      const oldestRequest = clientRequests[0];
      const retryAfterMs = oldestRequest 
        ? (oldestRequest.timestamp + this.config.windowMs) - now
        : this.config.windowMs;
      const retryAfter = Math.ceil(retryAfterMs / 1000);

      return {
        allowed: false,
        retryAfter: Math.max(1, retryAfter),
        remaining: 0,
      };
    }

    return { allowed: true, remaining };
  }

  /**
   * Record a request for the given client ID
   * @param clientId - Client identifier (typically IP address)
   */
  recordRequest(clientId: string): void {
    if (!this.config.enabled) {
      return;
    }

    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    // Get existing requests and filter expired ones
    let clientRequests = this.requests.get(clientId) || [];
    clientRequests = clientRequests.filter(r => r.timestamp > windowStart);

    // Add new request
    clientRequests.push({ timestamp: now });
    this.requests.set(clientId, clientRequests);
  }

  /**
   * Get the count of requests for a client in the current window
   * @param clientId - Client identifier
   * @returns Number of requests in current window
   */
  getRequestCount(clientId: string): number {
    if (!this.config.enabled) {
      return 0;
    }

    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    const clientRequests = this.requests.get(clientId) || [];
    
    return clientRequests.filter(r => r.timestamp > windowStart).length;
  }

  /**
   * Clean up expired entries from all clients
   */
  cleanup(): void {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    for (const [clientId, requests] of this.requests.entries()) {
      const validRequests = requests.filter(r => r.timestamp > windowStart);
      if (validRequests.length === 0) {
        this.requests.delete(clientId);
      } else {
        this.requests.set(clientId, validRequests);
      }
    }
  }

  /**
   * Start periodic cleanup of expired entries
   */
  private startCleanup(): void {
    // Clean up every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000) as unknown as number;
  }

  /**
   * Stop the cleanup interval
   */
  stop(): void {
    if (this.cleanupInterval !== null) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Reset all rate limit data (useful for testing)
   */
  reset(): void {
    this.requests.clear();
  }

  /**
   * Get current configuration
   */
  getConfig(): RateLimitConfig {
    return { ...this.config };
  }

  /**
   * Check if rate limiting is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }
}

/**
 * Extract client IP from request
 * Checks X-Forwarded-For header first, then falls back to connection info
 */
export function getClientIp(req: Request): string {
  // Check X-Forwarded-For header (for proxied requests)
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    // Take the first IP in the chain
    return forwardedFor.split(",")[0].trim();
  }

  // Check X-Real-IP header
  const realIp = req.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }

  // Default to unknown (Deno.serve doesn't expose connection info directly)
  return "unknown";
}

// ============== Singleton Instance ==============

let rateLimiterInstance: RateLimiter | null = null;

/**
 * Get the global rate limiter instance
 */
export function getRateLimiter(): RateLimiter {
  if (!rateLimiterInstance) {
    rateLimiterInstance = new RateLimiter();
  }
  return rateLimiterInstance;
}

/**
 * Reset the global rate limiter instance (useful for testing)
 */
export function resetRateLimiter(): void {
  if (rateLimiterInstance) {
    rateLimiterInstance.stop();
    rateLimiterInstance = null;
  }
}
