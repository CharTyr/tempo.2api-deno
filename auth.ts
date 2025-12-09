/**
 * API Key Authentication Module
 * 
 * Provides API key extraction and validation for the Tempo API Proxy.
 * Supports both Authorization header (Bearer token) and x-api-key header.
 * 
 * Requirements: 9.1, 9.2, 9.3, 9.4
 */

// ============== Configuration ==============

export interface AuthConfig {
  apiKey: string | null;  // From PROXY_API_KEY environment variable
}

/**
 * Get auth configuration from environment variables
 * Requirements: 9.1, 9.3
 */
export function getAuthConfig(): AuthConfig {
  const apiKey = Deno.env.get("PROXY_API_KEY") || null;
  return {
    apiKey: apiKey && apiKey.trim() !== "" ? apiKey : null,
  };
}

// ============== API Key Extraction ==============

/**
 * Extract API key from request headers
 * Checks Authorization header (Bearer token) and x-api-key header
 * 
 * Requirements: 9.4
 * - Accept API key in Authorization header (Bearer token format)
 * - Accept API key in x-api-key header
 * 
 * @param req - The incoming request
 * @returns The extracted API key or null if not found
 */
export function extractApiKey(req: Request): string | null {
  if (!req || !req.headers) {
    return null;
  }

  // Check Authorization header first (Bearer token format)
  const authHeader = req.headers.get("authorization");
  if (authHeader) {
    // Support "Bearer <token>" format
    const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    if (bearerMatch && bearerMatch[1] && bearerMatch[1].trim()) {
      return bearerMatch[1].trim();
    }
    // Also support raw token in Authorization header (not Bearer format)
    // But only if it's not just "Bearer" or "Bearer " with nothing after
    const trimmed = authHeader.trim();
    if (trimmed && !trimmed.match(/^Bearer\s*$/i)) {
      return trimmed;
    }
  }

  // Check x-api-key header
  const xApiKey = req.headers.get("x-api-key");
  if (xApiKey && xApiKey.trim()) {
    return xApiKey.trim();
  }

  return null;
}

// ============== API Key Validation ==============

/**
 * Validate API key against configured key
 * 
 * Requirements: 9.2
 * - Return true if API key matches configured key
 * - Return false if API key is missing or incorrect
 * 
 * @param providedKey - The API key from the request
 * @param configuredKey - The configured API key (from env)
 * @returns true if valid, false otherwise
 */
export function validateApiKey(providedKey: string | null, configuredKey: string | null): boolean {
  // If no configured key, validation always passes (auth disabled)
  if (!configuredKey) {
    return true;
  }

  // If configured key exists but no provided key, validation fails
  if (!providedKey) {
    return false;
  }

  // Compare keys (constant-time comparison would be better for production)
  return providedKey === configuredKey;
}

// ============== Auth Result Interface ==============

export interface AuthResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate a request's API key
 * 
 * Requirements: 9.1, 9.2, 9.3
 * - Skip validation if PROXY_API_KEY not set
 * - Validate API key if set
 * - Return error for invalid key
 * 
 * @param req - The incoming request
 * @returns AuthResult with valid status and optional error message
 */
export function validateRequest(req: Request): AuthResult {
  const config = getAuthConfig();

  // If no API key configured, allow all requests (Requirements: 9.3)
  if (!config.apiKey) {
    return { valid: true };
  }

  // Extract API key from request
  const providedKey = extractApiKey(req);

  // Validate the key
  if (!validateApiKey(providedKey, config.apiKey)) {
    return {
      valid: false,
      error: "Invalid API key",
    };
  }

  return { valid: true };
}

// ============== Singleton for Auth Config ==============

let cachedConfig: AuthConfig | null = null;

/**
 * Get cached auth configuration (singleton pattern)
 */
export function getCachedAuthConfig(): AuthConfig {
  if (!cachedConfig) {
    cachedConfig = getAuthConfig();
  }
  return cachedConfig;
}

/**
 * Clear cached auth configuration (for testing)
 */
export function clearAuthConfigCache(): void {
  cachedConfig = null;
}

/**
 * Check if authentication is enabled
 */
export function isAuthEnabled(): boolean {
  return getCachedAuthConfig().apiKey !== null;
}
