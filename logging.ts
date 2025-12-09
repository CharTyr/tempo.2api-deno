/**
 * Enhanced Logging Module for Tempo API Proxy
 * 
 * Provides token estimation, log sanitization, and enhanced request logging.
 * Requirements: 6.1, 6.2, 6.3, 6.4
 */

// ============== Token Estimation ==============
// Requirements: 6.2 - Log estimated token counts

/**
 * Estimate the number of tokens in a text string.
 * Uses the approximation of length/4 as specified in the design.
 * 
 * @param text - The text to estimate tokens for
 * @returns Estimated token count (minimum 0)
 */
export function estimateTokens(text: string): number {
  if (!text || typeof text !== "string") {
    return 0;
  }
  return Math.ceil(text.length / 4);
}

// ============== Log Sanitization ==============
// Requirements: 6.4 - Do not include sensitive data in logs

/**
 * Sensitive patterns to remove from logs
 */
const SENSITIVE_PATTERNS = [
  // Authorization headers (Bearer tokens, API keys)
  /Bearer\s+[A-Za-z0-9\-_\.]+/gi,
  // JWT tokens (three base64 parts separated by dots)
  /eyJ[A-Za-z0-9\-_]+\.eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/g,
  // API keys (common formats)
  /sk-[A-Za-z0-9]{20,}/g,
  /pk-[A-Za-z0-9]{20,}/g,
  /api[_-]?key["\s:=]+["']?[A-Za-z0-9\-_]{16,}["']?/gi,
  // x-api-key header values
  /x-api-key["\s:=]+["']?[A-Za-z0-9\-_]{8,}["']?/gi,
  // Authorization header values
  /authorization["\s:=]+["']?[A-Za-z0-9\-_\s\.]{8,}["']?/gi,
  // Client tokens
  /__client["\s:=]+["']?[A-Za-z0-9\-_\.]{20,}["']?/gi,
];

/**
 * Sanitize a log entry by removing sensitive data.
 * Removes tokens, API keys, and message content.
 * 
 * @param logEntry - The log entry to sanitize (string or object)
 * @returns Sanitized log entry
 */
export function sanitizeLog(logEntry: string | Record<string, unknown>): string {
  let text: string;
  
  if (typeof logEntry === "object" && logEntry !== null) {
    text = JSON.stringify(logEntry);
  } else if (typeof logEntry === "string") {
    text = logEntry;
  } else {
    return "";
  }

  // Remove sensitive patterns
  for (const pattern of SENSITIVE_PATTERNS) {
    text = text.replace(pattern, "[REDACTED]");
  }

  // Remove message content (content field in JSON)
  text = text.replace(/"content"\s*:\s*"[^"]*"/g, '"content":"[REDACTED]"');
  text = text.replace(/"content"\s*:\s*\[[^\]]*\]/g, '"content":[REDACTED]');
  
  // Remove user_prompt content
  text = text.replace(/"user_prompt"\s*:\s*"[^"]*"/g, '"user_prompt":"[REDACTED]"');
  
  // Remove chat_history content
  text = text.replace(/"chat_history"\s*:\s*\[[^\]]*\]/g, '"chat_history":[REDACTED]');

  return text;
}

/**
 * Check if a string contains sensitive data
 * 
 * @param text - The text to check
 * @returns true if sensitive data is found
 */
export function containsSensitiveData(text: string): boolean {
  if (!text || typeof text !== "string") {
    return false;
  }
  
  for (const pattern of SENSITIVE_PATTERNS) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      return true;
    }
  }
  
  // Check for message content
  if (/"content"\s*:\s*"[^"]{10,}"/.test(text)) {
    return true;
  }
  
  return false;
}

// ============== Enhanced Request Logging ==============
// Requirements: 6.1, 6.3 - Log duration, model, feature flags, token counts

export interface RequestLogData {
  method: string;
  path: string;
  model?: string;
  reasoning?: boolean;
  search?: boolean;
  canvasId?: string;
  duration?: number;
  inputTokens?: number;
  outputTokens?: number;
  status?: number;
  success?: boolean;
  error?: string;
}

/**
 * Format a request log entry with all relevant information.
 * 
 * @param data - The request log data
 * @returns Formatted log string
 */
export function formatRequestLog(data: RequestLogData): string {
  const parts: string[] = [];
  
  // Timestamp
  parts.push(`[${new Date().toISOString()}]`);
  
  // Method and path
  parts.push(`${data.method} ${data.path}`);
  
  // Model and feature flags
  if (data.model) {
    let modelInfo = `model=${data.model}`;
    const flags: string[] = [];
    if (data.reasoning) flags.push("reasoning");
    if (data.search) flags.push("search");
    if (flags.length > 0) {
      modelInfo += ` [${flags.join(",")}]`;
    }
    parts.push(modelInfo);
  }
  
  // Canvas ID (truncated for brevity)
  if (data.canvasId) {
    parts.push(`canvas=${data.canvasId.substring(0, 8)}...`);
  }
  
  // Token counts
  if (data.inputTokens !== undefined || data.outputTokens !== undefined) {
    const tokenInfo: string[] = [];
    if (data.inputTokens !== undefined) {
      tokenInfo.push(`in=${data.inputTokens}`);
    }
    if (data.outputTokens !== undefined) {
      tokenInfo.push(`out=${data.outputTokens}`);
    }
    parts.push(`tokens(${tokenInfo.join(",")})`);
  }
  
  // Duration
  if (data.duration !== undefined) {
    parts.push(`${data.duration}ms`);
  }
  
  // Status
  if (data.status !== undefined) {
    parts.push(`status=${data.status}`);
  }
  
  // Success/Error
  if (data.success !== undefined) {
    parts.push(data.success ? "✓" : "✗");
  }
  
  if (data.error) {
    parts.push(`error="${data.error}"`);
  }
  
  return parts.join(" ");
}

/**
 * Log a request with enhanced information.
 * Automatically sanitizes the log output.
 * 
 * @param data - The request log data
 */
export function logRequest(data: RequestLogData): void {
  const logLine = formatRequestLog(data);
  console.log(sanitizeLog(logLine));
}

/**
 * Log the start of a request.
 * 
 * @param method - HTTP method
 * @param path - Request path
 * @param model - Model name (optional)
 */
export function logRequestStart(method: string, path: string, model?: string): void {
  const parts = [`[${new Date().toISOString()}]`, `${method} ${path}`];
  if (model) {
    parts.push(`model=${model}`);
  }
  parts.push("started");
  console.log(parts.join(" "));
}

/**
 * Log the completion of a request.
 * 
 * @param data - The request log data
 */
export function logRequestComplete(data: RequestLogData): void {
  logRequest(data);
}
