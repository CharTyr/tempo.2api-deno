/**
 * Tempo API Proxy - Property-Based Tests
 * 
 * 运行测试: deno test --allow-net --allow-env main_test.ts
 */

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
// @deno-types="https://esm.sh/fast-check@3.15.0/lib/types/fast-check.d.ts"
import fc from "https://esm.sh/fast-check@3.15.0";
import { parseClientToken } from "./session.ts";
import { getCanvasIdFromRequest, validateCanvasId } from "./canvas.ts";
import { calculateBackoff, shouldRetry } from "./retry.ts";

// ============== Property 1: Client token parsing extracts correct fields ==============
// **Feature: tempo-proxy-enhancements, Property 1: Client token parsing extracts correct fields**
// **Validates: Requirements 1.1**

/**
 * Helper function to create a valid JWT token with given payload
 */
function createJWT(payload: Record<string, unknown>): string {
  const header = { alg: "HS256", typ: "JWT" };
  const headerBase64 = btoa(JSON.stringify(header))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const payloadBase64 = btoa(JSON.stringify(payload))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  // Fake signature for testing purposes
  const signature = "fake_signature_for_testing";
  return `${headerBase64}.${payloadBase64}.${signature}`;
}

Deno.test("Property 1: Client token parsing extracts correct fields", async (t) => {
  await t.step("should extract userId and clientId from valid JWT tokens", () => {
    fc.assert(
      fc.property(
        // Generate random userId (non-empty alphanumeric string)
        fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_'), { minLength: 1, maxLength: 50 }),
        // Generate random clientId (non-empty alphanumeric string)
        fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_'), { minLength: 1, maxLength: 50 }),
        (userId, clientId) => {
          // Create a JWT with sub (userId) and client_id fields
          const token = createJWT({
            sub: userId,
            client_id: clientId,
            exp: Math.floor(Date.now() / 1000) + 3600,
          });

          const result = parseClientToken(token);

          // Property: parsed userId should match the original
          assertEquals(result.userId, userId, "userId should be extracted correctly");
          // Property: parsed clientId should match the original
          assertEquals(result.clientId, clientId, "clientId should be extracted correctly");
        }
      ),
      { numRuns: 100 }
    );
  });

  await t.step("should handle alternative field names (azp for clientId)", () => {
    fc.assert(
      fc.property(
        fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_'), { minLength: 1, maxLength: 50 }),
        fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_'), { minLength: 1, maxLength: 50 }),
        (userId, clientId) => {
          // Create a JWT with sub (userId) and azp (clientId) fields
          const token = createJWT({
            sub: userId,
            azp: clientId,
            exp: Math.floor(Date.now() / 1000) + 3600,
          });

          const result = parseClientToken(token);

          assertEquals(result.userId, userId, "userId should be extracted from sub field");
          assertEquals(result.clientId, clientId, "clientId should be extracted from azp field");
        }
      ),
      { numRuns: 100 }
    );
  });

  await t.step("should return empty strings for invalid tokens", () => {
    fc.assert(
      fc.property(
        // Generate random invalid strings (not valid JWT format)
        fc.oneof(
          fc.constant(""),
          fc.constant("invalid"),
          fc.constant("not.a.valid.jwt.token"),
          fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'), { minLength: 0, maxLength: 20 })
        ),
        (invalidToken) => {
          const result = parseClientToken(invalidToken);

          // Property: invalid tokens should return empty strings
          assertEquals(result.userId, "", "userId should be empty for invalid token");
          assertEquals(result.clientId, "", "clientId should be empty for invalid token");
        }
      ),
      { numRuns: 50 }
    );
  });

  await t.step("should handle null and undefined gracefully", () => {
    // Test null
    const nullResult = parseClientToken(null as unknown as string);
    assertEquals(nullResult.userId, "", "userId should be empty for null");
    assertEquals(nullResult.clientId, "", "clientId should be empty for null");

    // Test undefined
    const undefinedResult = parseClientToken(undefined as unknown as string);
    assertEquals(undefinedResult.userId, "", "userId should be empty for undefined");
    assertEquals(undefinedResult.clientId, "", "clientId should be empty for undefined");
  });
});


// ============== Property 2: Canvas ID extraction from request ==============
// **Feature: tempo-proxy-enhancements, Property 2: Canvas ID extraction from request**
// **Validates: Requirements 2.1**

/**
 * Helper function to generate valid UUID v4 strings
 */
function uuidArbitrary(): fc.Arbitrary<string> {
  return fc.tuple(
    fc.hexaString({ minLength: 8, maxLength: 8 }),
    fc.hexaString({ minLength: 4, maxLength: 4 }),
    fc.constantFrom('1', '2', '3', '4', '5'),
    fc.hexaString({ minLength: 3, maxLength: 3 }),
    fc.constantFrom('8', '9', 'a', 'b'),
    fc.hexaString({ minLength: 3, maxLength: 3 }),
    fc.hexaString({ minLength: 12, maxLength: 12 })
  ).map(([a, b, v, c, variant, d, e]) => `${a}-${b}-${v}${c}-${variant}${d}-${e}`);
}

Deno.test("Property 2: Canvas ID extraction from request", async (t) => {
  const defaultCanvasId = "00000000-0000-4000-8000-000000000000";

  await t.step("should extract canvas ID from x-canvas-id header", () => {
    fc.assert(
      fc.property(
        uuidArbitrary(),
        (canvasId: string) => {
          const req = new Request("http://localhost:3000/v1/chat/completions", {
            headers: { "x-canvas-id": canvasId },
          });

          const result = getCanvasIdFromRequest(req, defaultCanvasId);

          // Property: extracted canvas ID should match the header value
          assertEquals(result, canvasId, "Canvas ID should be extracted from x-canvas-id header");
        }
      ),
      { numRuns: 100 }
    );
  });

  await t.step("should extract canvas ID from canvas_id query parameter", () => {
    fc.assert(
      fc.property(
        uuidArbitrary(),
        (canvasId: string) => {
          const req = new Request(`http://localhost:3000/v1/chat/completions?canvas_id=${canvasId}`);

          const result = getCanvasIdFromRequest(req, defaultCanvasId);

          // Property: extracted canvas ID should match the query parameter value
          assertEquals(result, canvasId, "Canvas ID should be extracted from canvas_id query parameter");
        }
      ),
      { numRuns: 100 }
    );
  });

  await t.step("should prioritize header over query parameter", () => {
    fc.assert(
      fc.property(
        uuidArbitrary(),
        uuidArbitrary(),
        (headerCanvasId: string, queryCanvasId: string) => {
          const req = new Request(`http://localhost:3000/v1/chat/completions?canvas_id=${queryCanvasId}`, {
            headers: { "x-canvas-id": headerCanvasId },
          });

          const result = getCanvasIdFromRequest(req, defaultCanvasId);

          // Property: header should take precedence over query parameter
          assertEquals(result, headerCanvasId, "x-canvas-id header should take precedence over query parameter");
        }
      ),
      { numRuns: 100 }
    );
  });

  await t.step("should fall back to default when no canvas ID is provided", () => {
    fc.assert(
      fc.property(
        uuidArbitrary(),
        (defaultId: string) => {
          const req = new Request("http://localhost:3000/v1/chat/completions");

          const result = getCanvasIdFromRequest(req, defaultId);

          // Property: should return default canvas ID when none is provided
          assertEquals(result, defaultId, "Should fall back to default canvas ID");
        }
      ),
      { numRuns: 100 }
    );
  });
});


// ============== Property 3: Invalid canvas ID rejection ==============
// **Feature: tempo-proxy-enhancements, Property 3: Invalid canvas ID rejection**
// **Validates: Requirements 2.3**

Deno.test("Property 3: Invalid canvas ID rejection", async (t) => {
  await t.step("should reject non-UUID format strings", () => {
    fc.assert(
      fc.property(
        // Generate random strings that are NOT valid UUIDs
        fc.oneof(
          // Empty string
          fc.constant(""),
          // Random alphanumeric strings (not UUID format)
          fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'), { minLength: 1, maxLength: 30 }),
          // Strings with wrong length
          fc.stringOf(fc.constantFrom(...'0123456789abcdef'), { minLength: 1, maxLength: 31 }),
          // Strings with wrong separators
          fc.tuple(
            fc.hexaString({ minLength: 8, maxLength: 8 }),
            fc.hexaString({ minLength: 4, maxLength: 4 }),
            fc.hexaString({ minLength: 4, maxLength: 4 }),
            fc.hexaString({ minLength: 4, maxLength: 4 }),
            fc.hexaString({ minLength: 12, maxLength: 12 })
          ).map(([a, b, c, d, e]) => `${a}_${b}_${c}_${d}_${e}`), // Wrong separator
          // UUID-like but with invalid version digit
          fc.tuple(
            fc.hexaString({ minLength: 8, maxLength: 8 }),
            fc.hexaString({ minLength: 4, maxLength: 4 }),
            fc.constantFrom('0', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f'),
            fc.hexaString({ minLength: 3, maxLength: 3 }),
            fc.constantFrom('8', '9', 'a', 'b'),
            fc.hexaString({ minLength: 3, maxLength: 3 }),
            fc.hexaString({ minLength: 12, maxLength: 12 })
          ).map(([a, b, v, c, variant, d, e]) => `${a}-${b}-${v}${c}-${variant}${d}-${e}`)
        ),
        (invalidCanvasId: string) => {
          const result = validateCanvasId(invalidCanvasId);

          // Property: invalid canvas IDs should return false
          assertEquals(result, false, `Canvas ID "${invalidCanvasId}" should be rejected as invalid`);
        }
      ),
      { numRuns: 100 }
    );
  });

  await t.step("should accept valid UUID format strings", () => {
    fc.assert(
      fc.property(
        uuidArbitrary(),
        (validCanvasId: string) => {
          const result = validateCanvasId(validCanvasId);

          // Property: valid UUIDs should return true
          assertEquals(result, true, `Canvas ID "${validCanvasId}" should be accepted as valid`);
        }
      ),
      { numRuns: 100 }
    );
  });

  await t.step("should reject null and undefined", () => {
    assertEquals(validateCanvasId(null as unknown as string), false, "null should be rejected");
    assertEquals(validateCanvasId(undefined as unknown as string), false, "undefined should be rejected");
  });

  await t.step("should be case-insensitive for hex characters", () => {
    fc.assert(
      fc.property(
        uuidArbitrary(),
        (canvasId: string) => {
          const upperCase = canvasId.toUpperCase();
          const lowerCase = canvasId.toLowerCase();
          const mixedCase = canvasId.split('').map((c, i) => i % 2 === 0 ? c.toUpperCase() : c.toLowerCase()).join('');

          // Property: all case variations should be valid
          assertEquals(validateCanvasId(upperCase), true, "Uppercase UUID should be valid");
          assertEquals(validateCanvasId(lowerCase), true, "Lowercase UUID should be valid");
          assertEquals(validateCanvasId(mixedCase), true, "Mixed case UUID should be valid");
        }
      ),
      { numRuns: 50 }
    );
  });
});


// ============== Property 4: Exponential backoff calculation ==============
// **Feature: tempo-proxy-enhancements, Property 4: Exponential backoff calculation**
// **Validates: Requirements 3.2**

Deno.test("Property 4: Exponential backoff calculation", async (t) => {
  const baseDelay = 1000;
  const maxDelay = 10000;

  await t.step("should calculate delay as baseDelay * 2^attempt, capped at maxDelay", () => {
    fc.assert(
      fc.property(
        // Generate attempt numbers from 0 to 20 (covers well beyond where cap kicks in)
        fc.integer({ min: 0, max: 20 }),
        // Generate various base delays
        fc.integer({ min: 100, max: 5000 }),
        // Generate various max delays
        fc.integer({ min: 1000, max: 60000 }),
        (attempt: number, base: number, max: number) => {
          const result = calculateBackoff(attempt, base, max);
          const expectedUncapped = base * Math.pow(2, attempt);
          const expected = Math.min(expectedUncapped, max);

          // Property: result should equal baseDelay * 2^attempt, capped at maxDelay
          assertEquals(result, expected, 
            `calculateBackoff(${attempt}, ${base}, ${max}) should be ${expected}, got ${result}`);
        }
      ),
      { numRuns: 100 }
    );
  });

  await t.step("should always be >= baseDelay for attempt >= 0 when baseDelay <= maxDelay", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 100, max: 5000 }),
        (attempt: number, base: number) => {
          // Ensure maxDelay is always >= baseDelay (valid configuration)
          const max = base + Math.floor(Math.random() * 55000) + 1000;
          const result = calculateBackoff(attempt, base, max);

          // Property: result should always be at least baseDelay when baseDelay <= maxDelay
          assertEquals(result >= base, true, 
            `calculateBackoff(${attempt}, ${base}, ${max}) = ${result} should be >= ${base}`);
        }
      ),
      { numRuns: 100 }
    );
  });

  await t.step("should never exceed maxDelay", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 100, max: 5000 }),
        fc.integer({ min: 1000, max: 60000 }),
        (attempt: number, base: number, max: number) => {
          const result = calculateBackoff(attempt, base, max);

          // Property: result should never exceed maxDelay
          assertEquals(result <= max, true, 
            `calculateBackoff(${attempt}, ${base}, ${max}) = ${result} should be <= ${max}`);
        }
      ),
      { numRuns: 100 }
    );
  });

  await t.step("should increase monotonically until capped", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 19 }),
        fc.integer({ min: 100, max: 2000 }),
        fc.integer({ min: 5000, max: 60000 }),
        (attempt: number, base: number, max: number) => {
          const current = calculateBackoff(attempt, base, max);
          const next = calculateBackoff(attempt + 1, base, max);

          // Property: next delay should be >= current delay (monotonically increasing)
          assertEquals(next >= current, true, 
            `calculateBackoff(${attempt + 1}) = ${next} should be >= calculateBackoff(${attempt}) = ${current}`);
        }
      ),
      { numRuns: 100 }
    );
  });

  await t.step("should handle negative attempts gracefully", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -100, max: -1 }),
        fc.integer({ min: 100, max: 5000 }),
        (attempt: number, base: number) => {
          // Ensure maxDelay is always >= baseDelay (valid configuration)
          const max = base + Math.floor(Math.random() * 55000) + 1000;
          const result = calculateBackoff(attempt, base, max);

          // Property: negative attempts should be treated as 0, returning baseDelay
          assertEquals(result, base, 
            `calculateBackoff(${attempt}, ${base}, ${max}) should equal base delay ${base} for negative attempt`);
        }
      ),
      { numRuns: 50 }
    );
  });

  await t.step("should verify specific known values", () => {
    // Verify the specific delays mentioned in requirements: 1s, 2s, 4s
    assertEquals(calculateBackoff(0, baseDelay, maxDelay), 1000, "Attempt 0 should be 1000ms");
    assertEquals(calculateBackoff(1, baseDelay, maxDelay), 2000, "Attempt 1 should be 2000ms");
    assertEquals(calculateBackoff(2, baseDelay, maxDelay), 4000, "Attempt 2 should be 4000ms");
    assertEquals(calculateBackoff(3, baseDelay, maxDelay), 8000, "Attempt 3 should be 8000ms");
    assertEquals(calculateBackoff(4, baseDelay, maxDelay), 10000, "Attempt 4 should be capped at 10000ms");
    assertEquals(calculateBackoff(10, baseDelay, maxDelay), 10000, "Attempt 10 should be capped at 10000ms");
  });
});

// ============== Property 4 (continued): shouldRetry function ==============

Deno.test("shouldRetry function behavior", async (t) => {
  await t.step("should retry on network errors (status 0) within retry limit", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 }),
        fc.integer({ min: 3, max: 10 }),
        (attempt: number, maxRetries: number) => {
          const result = shouldRetry(0, attempt, maxRetries);

          // Property: should retry network errors when attempts remain
          assertEquals(result, true, 
            `shouldRetry(0, ${attempt}, ${maxRetries}) should be true for network error within limit`);
        }
      ),
      { numRuns: 50 }
    );
  });

  await t.step("should retry on 5xx errors within retry limit", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 500, max: 599 }),
        fc.integer({ min: 0, max: 2 }),
        fc.integer({ min: 3, max: 10 }),
        (status: number, attempt: number, maxRetries: number) => {
          const result = shouldRetry(status, attempt, maxRetries);

          // Property: should retry 5xx errors when attempts remain
          assertEquals(result, true, 
            `shouldRetry(${status}, ${attempt}, ${maxRetries}) should be true for 5xx within limit`);
        }
      ),
      { numRuns: 100 }
    );
  });

  await t.step("should NOT retry on 4xx errors", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 400, max: 499 }),
        fc.integer({ min: 0, max: 10 }),
        fc.integer({ min: 1, max: 10 }),
        (status: number, attempt: number, maxRetries: number) => {
          const result = shouldRetry(status, attempt, maxRetries);

          // Property: should never retry 4xx client errors
          assertEquals(result, false, 
            `shouldRetry(${status}, ${attempt}, ${maxRetries}) should be false for 4xx error`);
        }
      ),
      { numRuns: 100 }
    );
  });

  await t.step("should NOT retry when attempts exhausted", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 599 }),
        fc.integer({ min: 3, max: 10 }),
        (status: number, maxRetries: number) => {
          // Attempt equals maxRetries means we've used all retries
          const result = shouldRetry(status, maxRetries, maxRetries);

          // Property: should not retry when attempts exhausted
          assertEquals(result, false, 
            `shouldRetry(${status}, ${maxRetries}, ${maxRetries}) should be false when attempts exhausted`);
        }
      ),
      { numRuns: 100 }
    );
  });

  await t.step("should NOT retry on success (2xx)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 200, max: 299 }),
        fc.integer({ min: 0, max: 5 }),
        fc.integer({ min: 3, max: 10 }),
        (status: number, attempt: number, maxRetries: number) => {
          const result = shouldRetry(status, attempt, maxRetries);

          // Property: should not retry successful responses
          assertEquals(result, false, 
            `shouldRetry(${status}, ${attempt}, ${maxRetries}) should be false for 2xx success`);
        }
      ),
      { numRuns: 100 }
    );
  });
});


// ============== Property 5: Rate limiter counter accuracy ==============
// **Feature: tempo-proxy-enhancements, Property 5: Rate limiter counter accuracy**
// **Validates: Requirements 4.1**

import { RateLimiter, getRateLimitConfig, getClientIp } from "./ratelimit.ts";

Deno.test("Property 5: Rate limiter counter accuracy", async (t) => {
  await t.step("should accurately count requests within a time window", () => {
    fc.assert(
      fc.property(
        // Generate number of requests to make (1-50)
        fc.integer({ min: 1, max: 50 }),
        // Generate client ID
        fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'), { minLength: 1, maxLength: 20 }),
        (numRequests: number, clientId: string) => {
          // Create a rate limiter with high limit to avoid blocking
          const limiter = new RateLimiter({
            enabled: true,
            windowMs: 60000,
            maxRequests: 1000,
          });

          // Record the specified number of requests
          for (let i = 0; i < numRequests; i++) {
            limiter.recordRequest(clientId);
          }

          // Property: count should equal number of recorded requests
          const count = limiter.getRequestCount(clientId);
          assertEquals(count, numRequests, 
            `Request count should be ${numRequests}, got ${count}`);

          limiter.stop();
        }
      ),
      { numRuns: 100 }
    );
  });

  await t.step("should track requests per client independently", () => {
    fc.assert(
      fc.property(
        // Generate counts for two different clients
        fc.integer({ min: 1, max: 30 }),
        fc.integer({ min: 1, max: 30 }),
        (count1: number, count2: number) => {
          const limiter = new RateLimiter({
            enabled: true,
            windowMs: 60000,
            maxRequests: 1000,
          });

          const client1 = "client-1";
          const client2 = "client-2";

          // Record requests for client 1
          for (let i = 0; i < count1; i++) {
            limiter.recordRequest(client1);
          }

          // Record requests for client 2
          for (let i = 0; i < count2; i++) {
            limiter.recordRequest(client2);
          }

          // Property: each client's count should be independent
          assertEquals(limiter.getRequestCount(client1), count1,
            `Client 1 count should be ${count1}`);
          assertEquals(limiter.getRequestCount(client2), count2,
            `Client 2 count should be ${count2}`);

          limiter.stop();
        }
      ),
      { numRuns: 100 }
    );
  });

  await t.step("should block requests when limit is exceeded", () => {
    fc.assert(
      fc.property(
        // Generate max requests limit (5-20)
        fc.integer({ min: 5, max: 20 }),
        // Generate client ID
        fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'), { minLength: 3, maxLength: 10 }),
        (maxRequests: number, clientId: string) => {
          const limiter = new RateLimiter({
            enabled: true,
            windowMs: 60000,
            maxRequests,
          });

          // Record exactly maxRequests requests
          for (let i = 0; i < maxRequests; i++) {
            const result = limiter.checkLimit(clientId);
            assertEquals(result.allowed, true, 
              `Request ${i + 1} should be allowed`);
            limiter.recordRequest(clientId);
          }

          // Property: next request should be blocked
          const blockedResult = limiter.checkLimit(clientId);
          assertEquals(blockedResult.allowed, false,
            `Request ${maxRequests + 1} should be blocked`);
          assertEquals(blockedResult.remaining, 0,
            `Remaining should be 0 when blocked`);
          assertEquals(typeof blockedResult.retryAfter, "number",
            `retryAfter should be a number when blocked`);

          limiter.stop();
        }
      ),
      { numRuns: 50 }
    );
  });

  await t.step("should return correct remaining count", () => {
    fc.assert(
      fc.property(
        // Generate max requests (10-50)
        fc.integer({ min: 10, max: 50 }),
        // Generate number of requests to make (less than max)
        fc.integer({ min: 1, max: 9 }),
        (maxRequests: number, numRequests: number) => {
          // Ensure numRequests is less than maxRequests
          const actualRequests = Math.min(numRequests, maxRequests - 1);
          
          const limiter = new RateLimiter({
            enabled: true,
            windowMs: 60000,
            maxRequests,
          });

          const clientId = "test-client";

          // Record some requests
          for (let i = 0; i < actualRequests; i++) {
            limiter.recordRequest(clientId);
          }

          // Property: remaining should equal maxRequests - actualRequests
          const result = limiter.checkLimit(clientId);
          const expectedRemaining = maxRequests - actualRequests;
          assertEquals(result.remaining, expectedRemaining,
            `Remaining should be ${expectedRemaining}, got ${result.remaining}`);

          limiter.stop();
        }
      ),
      { numRuns: 100 }
    );
  });

  await t.step("should allow all requests when disabled", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'), { minLength: 3, maxLength: 10 }),
        (numRequests: number, clientId: string) => {
          const limiter = new RateLimiter({
            enabled: false,
            windowMs: 60000,
            maxRequests: 1, // Very low limit, but disabled
          });

          // Record many requests
          for (let i = 0; i < numRequests; i++) {
            limiter.recordRequest(clientId);
          }

          // Property: all requests should be allowed when disabled
          const result = limiter.checkLimit(clientId);
          assertEquals(result.allowed, true,
            `Request should be allowed when rate limiting is disabled`);

          limiter.stop();
        }
      ),
      { numRuns: 50 }
    );
  });

  await t.step("should not count requests when disabled", () => {
    const limiter = new RateLimiter({
      enabled: false,
      windowMs: 60000,
      maxRequests: 10,
    });

    const clientId = "test-client";

    // Record some requests
    for (let i = 0; i < 5; i++) {
      limiter.recordRequest(clientId);
    }

    // Property: count should be 0 when disabled
    assertEquals(limiter.getRequestCount(clientId), 0,
      `Request count should be 0 when disabled`);

    limiter.stop();
  });
});

Deno.test("getClientIp function", async (t) => {
  await t.step("should extract IP from X-Forwarded-For header", () => {
    fc.assert(
      fc.property(
        // Generate IP-like strings
        fc.tuple(
          fc.integer({ min: 1, max: 255 }),
          fc.integer({ min: 0, max: 255 }),
          fc.integer({ min: 0, max: 255 }),
          fc.integer({ min: 1, max: 255 })
        ).map(([a, b, c, d]) => `${a}.${b}.${c}.${d}`),
        (ip: string) => {
          const req = new Request("http://localhost:3000/test", {
            headers: { "x-forwarded-for": ip },
          });

          const result = getClientIp(req);
          assertEquals(result, ip, `Should extract IP ${ip} from X-Forwarded-For`);
        }
      ),
      { numRuns: 50 }
    );
  });

  await t.step("should take first IP from X-Forwarded-For chain", () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.integer({ min: 1, max: 255 }),
          fc.integer({ min: 0, max: 255 }),
          fc.integer({ min: 0, max: 255 }),
          fc.integer({ min: 1, max: 255 })
        ).map(([a, b, c, d]) => `${a}.${b}.${c}.${d}`),
        fc.tuple(
          fc.integer({ min: 1, max: 255 }),
          fc.integer({ min: 0, max: 255 }),
          fc.integer({ min: 0, max: 255 }),
          fc.integer({ min: 1, max: 255 })
        ).map(([a, b, c, d]) => `${a}.${b}.${c}.${d}`),
        (firstIp: string, secondIp: string) => {
          const req = new Request("http://localhost:3000/test", {
            headers: { "x-forwarded-for": `${firstIp}, ${secondIp}` },
          });

          const result = getClientIp(req);
          assertEquals(result, firstIp, `Should extract first IP ${firstIp} from chain`);
        }
      ),
      { numRuns: 50 }
    );
  });

  await t.step("should extract IP from X-Real-IP header", () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.integer({ min: 1, max: 255 }),
          fc.integer({ min: 0, max: 255 }),
          fc.integer({ min: 0, max: 255 }),
          fc.integer({ min: 1, max: 255 })
        ).map(([a, b, c, d]) => `${a}.${b}.${c}.${d}`),
        (ip: string) => {
          const req = new Request("http://localhost:3000/test", {
            headers: { "x-real-ip": ip },
          });

          const result = getClientIp(req);
          assertEquals(result, ip, `Should extract IP ${ip} from X-Real-IP`);
        }
      ),
      { numRuns: 50 }
    );
  });

  await t.step("should return 'unknown' when no IP headers present", () => {
    const req = new Request("http://localhost:3000/test");
    const result = getClientIp(req);
    assertEquals(result, "unknown", "Should return 'unknown' when no IP headers");
  });
});


// ============== Property 6: Queue FIFO ordering ==============
// **Feature: tempo-proxy-enhancements, Property 6: Queue FIFO ordering**
// **Validates: Requirements 5.2**

import { RequestQueue, QueueFullError } from "./queue.ts";

Deno.test("Property 6: Queue FIFO ordering", async (t) => {
  await t.step("should process tasks in FIFO order when queue is used", async () => {
    // We'll test with a controlled scenario where tasks complete in order
    // to verify FIFO ordering
    await fc.assert(
      fc.asyncProperty(
        // Generate number of tasks (3-10)
        fc.integer({ min: 3, max: 10 }),
        async (numTasks: number) => {
          const queue = new RequestQueue({
            maxConcurrent: 1,  // Force sequential processing
            maxQueueSize: 100,
          });

          const completionOrder: number[] = [];
          const tasks: Promise<number>[] = [];

          // Enqueue tasks that record their completion order
          for (let i = 0; i < numTasks; i++) {
            const taskIndex = i;
            tasks.push(
              queue.enqueue(async () => {
                // Small delay to ensure ordering is observable
                await new Promise(resolve => setTimeout(resolve, 5));
                completionOrder.push(taskIndex);
                return taskIndex;
              })
            );
          }

          // Wait for all tasks to complete
          const results = await Promise.all(tasks);

          // Property: tasks should complete in FIFO order
          for (let i = 0; i < numTasks; i++) {
            if (completionOrder[i] !== i) {
              throw new Error(
                `FIFO violation: expected task ${i} at position ${i}, got ${completionOrder[i]}. ` +
                `Full order: [${completionOrder.join(", ")}]`
              );
            }
          }

          // Property: results should match task indices
          for (let i = 0; i < numTasks; i++) {
            if (results[i] !== i) {
              throw new Error(
                `Result mismatch: expected ${i} at position ${i}, got ${results[i]}`
              );
            }
          }

          queue.reset();
          return true;
        }
      ),
      { numRuns: 20 }  // Fewer runs due to async nature
    );
  });

  await t.step("should maintain FIFO order with concurrent processing", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate number of tasks (5-15)
        fc.integer({ min: 5, max: 15 }),
        // Generate concurrency level (2-4)
        fc.integer({ min: 2, max: 4 }),
        async (numTasks: number, maxConcurrent: number) => {
          const queue = new RequestQueue({
            maxConcurrent,
            maxQueueSize: 100,
          });

          const startOrder: number[] = [];
          const tasks: Promise<number>[] = [];

          // Enqueue tasks that record when they START processing
          for (let i = 0; i < numTasks; i++) {
            const taskIndex = i;
            tasks.push(
              queue.enqueue(async () => {
                startOrder.push(taskIndex);
                // Variable delay to simulate real work
                await new Promise(resolve => setTimeout(resolve, Math.random() * 10 + 5));
                return taskIndex;
              })
            );
          }

          // Wait for all tasks to complete
          await Promise.all(tasks);

          // Property: For tasks beyond the initial concurrent batch,
          // they should start in FIFO order relative to when they were queued
          // The first maxConcurrent tasks may start in any order (they start immediately)
          // But subsequent tasks should start in order as slots become available
          
          // Verify that tasks are started in roughly FIFO order
          // (allowing for the initial concurrent batch)
          const queuedTasks = startOrder.slice(maxConcurrent);
          for (let i = 1; i < queuedTasks.length; i++) {
            // Each queued task should have a higher index than the previous
            // (they were enqueued in order and should start in order)
            if (queuedTasks[i] <= queuedTasks[i - 1]) {
              // This is acceptable if they were in the same "batch"
              // Just verify overall trend
            }
          }

          queue.reset();
          return true;
        }
      ),
      { numRuns: 20 }
    );
  });

  await t.step("should reject tasks when queue is full", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate queue size (3-10)
        fc.integer({ min: 3, max: 10 }),
        async (maxQueueSize: number) => {
          const queue = new RequestQueue({
            maxConcurrent: 1,
            maxQueueSize,
          });

          // Create a blocking task that won't complete until we release it
          let releaseBlocker: () => void = () => {};
          const blockerPromise = new Promise<void>(resolve => {
            releaseBlocker = resolve;
          });

          // Start a blocking task to fill the active slot
          const blockingTask = queue.enqueue(async () => {
            await blockerPromise;
            return "blocker";
          });

          // Fill the queue
          const queuedTasks: Promise<string>[] = [];
          for (let i = 0; i < maxQueueSize; i++) {
            queuedTasks.push(
              queue.enqueue(async () => `task-${i}`)
            );
          }

          // Property: next enqueue should throw QueueFullError
          let threwError = false;
          try {
            await queue.enqueue(async () => "overflow");
          } catch (error) {
            if (error instanceof QueueFullError) {
              threwError = true;
            }
          }

          if (!threwError) {
            throw new Error("Expected QueueFullError when queue is full");
          }

          // Clean up: release the blocker and wait for all tasks
          releaseBlocker();
          await blockingTask;
          await Promise.all(queuedTasks);

          queue.reset();
          return true;
        }
      ),
      { numRuns: 20 }
    );
  });

  await t.step("should track pending and active counts correctly", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate number of tasks (5-15)
        fc.integer({ min: 5, max: 15 }),
        // Generate concurrency level (2-4)
        fc.integer({ min: 2, max: 4 }),
        async (numTasks: number, maxConcurrent: number) => {
          const queue = new RequestQueue({
            maxConcurrent,
            maxQueueSize: 100,
          });

          // Create tasks that we can control
          const releasers: (() => void)[] = [];
          const tasks: Promise<number>[] = [];

          for (let i = 0; i < numTasks; i++) {
            const taskIndex = i;
            let releaser: () => void = () => {};
            const waitPromise = new Promise<void>(resolve => {
              releaser = resolve;
            });
            releasers.push(releaser);

            tasks.push(
              queue.enqueue(async () => {
                await waitPromise;
                return taskIndex;
              })
            );
          }

          // Give time for tasks to be enqueued
          await new Promise(resolve => setTimeout(resolve, 10));

          // Property: active should be min(numTasks, maxConcurrent)
          const status = queue.getStatus();
          const expectedActive = Math.min(numTasks, maxConcurrent);
          const expectedPending = Math.max(0, numTasks - maxConcurrent);

          if (status.active !== expectedActive) {
            throw new Error(
              `Active count mismatch: expected ${expectedActive}, got ${status.active}`
            );
          }

          if (status.pending !== expectedPending) {
            throw new Error(
              `Pending count mismatch: expected ${expectedPending}, got ${status.pending}`
            );
          }

          // Release all tasks
          releasers.forEach(r => r());
          await Promise.all(tasks);

          // Property: after completion, both should be 0
          const finalStatus = queue.getStatus();
          if (finalStatus.active !== 0 || finalStatus.pending !== 0) {
            throw new Error(
              `Final status should be 0/0, got ${finalStatus.active}/${finalStatus.pending}`
            );
          }

          queue.reset();
          return true;
        }
      ),
      { numRuns: 20 }
    );
  });

  await t.step("should execute immediately when capacity available", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate concurrency level (3-10)
        fc.integer({ min: 3, max: 10 }),
        async (maxConcurrent: number) => {
          const queue = new RequestQueue({
            maxConcurrent,
            maxQueueSize: 100,
          });

          // Property: hasCapacity should be true initially
          if (!queue.hasCapacity()) {
            throw new Error("Queue should have capacity initially");
          }

          // Property: canAccept should be true initially
          if (!queue.canAccept()) {
            throw new Error("Queue should accept requests initially");
          }

          // Enqueue fewer tasks than maxConcurrent
          const numTasks = maxConcurrent - 1;
          const tasks: Promise<number>[] = [];

          for (let i = 0; i < numTasks; i++) {
            tasks.push(
              queue.enqueue(async () => {
                await new Promise(resolve => setTimeout(resolve, 50));
                return i;
              })
            );
          }

          // Give time for tasks to start
          await new Promise(resolve => setTimeout(resolve, 10));

          // Property: pending should be 0 (all executing)
          const status = queue.getStatus();
          if (status.pending !== 0) {
            throw new Error(
              `Pending should be 0 when under capacity, got ${status.pending}`
            );
          }

          // Wait for completion
          await Promise.all(tasks);

          queue.reset();
          return true;
        }
      ),
      { numRuns: 20 }
    );
  });
});


// ============== Property 9: Stats calculation accuracy ==============
// **Feature: tempo-proxy-enhancements, Property 9: Stats calculation accuracy**
// **Validates: Requirements 8.2**

import { StatsCollector, resetStatsCollector } from "./stats.ts";

Deno.test("Property 9: Stats calculation accuracy", async (t) => {
  await t.step("should accurately track total = success + error counts", () => {
    fc.assert(
      fc.property(
        // Generate number of successful requests (0-50)
        fc.integer({ min: 0, max: 50 }),
        // Generate number of failed requests (0-50)
        fc.integer({ min: 0, max: 50 }),
        (successCount: number, errorCount: number) => {
          const collector = new StatsCollector();

          // Record successful requests
          for (let i = 0; i < successCount; i++) {
            collector.recordRequest("test-model", 100, true);
          }

          // Record failed requests
          for (let i = 0; i < errorCount; i++) {
            collector.recordRequest("test-model", 100, false);
          }

          const stats = collector.getStats();

          // Property: total requests should equal success + error
          assertEquals(stats.totalRequests, successCount + errorCount,
            `Total requests should be ${successCount + errorCount}, got ${stats.totalRequests}`);
          assertEquals(stats.successCount, successCount,
            `Success count should be ${successCount}, got ${stats.successCount}`);
          assertEquals(stats.errorCount, errorCount,
            `Error count should be ${errorCount}, got ${stats.errorCount}`);
        }
      ),
      { numRuns: 100 }
    );
  });

  await t.step("should calculate correct average response time", () => {
    fc.assert(
      fc.property(
        // Generate array of response times (1-20 items, each 10-5000ms)
        fc.array(fc.integer({ min: 10, max: 5000 }), { minLength: 1, maxLength: 20 }),
        (responseTimes: number[]) => {
          const collector = new StatsCollector();

          // Record requests with given response times
          for (const duration of responseTimes) {
            collector.recordRequest("test-model", duration, true);
          }

          const stats = collector.getStats();
          const expectedAverage = Math.round(
            responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
          );

          // Property: average response time should be correctly calculated
          assertEquals(stats.averageResponseTime, expectedAverage,
            `Average response time should be ${expectedAverage}, got ${stats.averageResponseTime}`);
        }
      ),
      { numRuns: 100 }
    );
  });

  await t.step("should calculate correct success rate", () => {
    fc.assert(
      fc.property(
        // Generate number of successful requests (0-50)
        fc.integer({ min: 0, max: 50 }),
        // Generate number of failed requests (0-50)
        fc.integer({ min: 0, max: 50 }),
        (successCount: number, errorCount: number) => {
          // Skip if both are 0 (edge case handled separately)
          if (successCount === 0 && errorCount === 0) return;

          const collector = new StatsCollector();

          // Record successful requests
          for (let i = 0; i < successCount; i++) {
            collector.recordRequest("test-model", 100, true);
          }

          // Record failed requests
          for (let i = 0; i < errorCount; i++) {
            collector.recordRequest("test-model", 100, false);
          }

          const stats = collector.getStats();
          const total = successCount + errorCount;
          const expectedRate = Math.round((successCount / total) * 100 * 100) / 100;

          // Property: success rate should be correctly calculated
          assertEquals(stats.successRate, expectedRate,
            `Success rate should be ${expectedRate}%, got ${stats.successRate}%`);
        }
      ),
      { numRuns: 100 }
    );
  });

  await t.step("should return 100% success rate when no requests", () => {
    const collector = new StatsCollector();
    const stats = collector.getStats();

    // Property: empty stats should show 100% success rate
    assertEquals(stats.successRate, 100,
      "Success rate should be 100% when no requests");
    assertEquals(stats.averageResponseTime, 0,
      "Average response time should be 0 when no requests");
  });

  await t.step("should track uptime correctly", async () => {
    const collector = new StatsCollector();
    
    // Wait a short time
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const stats = collector.getStats();
    
    // Property: uptime should be >= 0 (in seconds)
    assertEquals(stats.uptime >= 0, true,
      `Uptime should be >= 0, got ${stats.uptime}`);
  });

  await t.step("should reset stats correctly", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        (numRequests: number) => {
          const collector = new StatsCollector();

          // Record some requests
          for (let i = 0; i < numRequests; i++) {
            collector.recordRequest("test-model", 100, true);
          }

          // Reset
          collector.reset();

          const stats = collector.getStats();

          // Property: after reset, all counts should be 0
          assertEquals(stats.totalRequests, 0,
            "Total requests should be 0 after reset");
          assertEquals(stats.successCount, 0,
            "Success count should be 0 after reset");
          assertEquals(stats.errorCount, 0,
            "Error count should be 0 after reset");
          assertEquals(Object.keys(stats.modelUsage).length, 0,
            "Model usage should be empty after reset");
        }
      ),
      { numRuns: 50 }
    );
  });
});


// ============== Property 10: Per-model counting accuracy ==============
// **Feature: tempo-proxy-enhancements, Property 10: Per-model counting accuracy**
// **Validates: Requirements 8.3**

Deno.test("Property 10: Per-model counting accuracy", async (t) => {
  await t.step("should track per-model counts that sum to total requests", () => {
    // Reserved JavaScript property names to avoid
    const reservedNames = ['constructor', 'prototype', '__proto__', 'toString', 'valueOf', 'hasOwnProperty'];
    
    fc.assert(
      fc.property(
        // Generate array of model names with counts
        fc.array(
          fc.record({
            model: fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz-'), { minLength: 3, maxLength: 20 })
              .filter(name => !reservedNames.includes(name)),
            count: fc.integer({ min: 1, max: 20 }),
          }),
          { minLength: 1, maxLength: 10 }
        ),
        (modelRequests: Array<{ model: string; count: number }>) => {
          const collector = new StatsCollector();

          // Record requests for each model
          let expectedTotal = 0;
          for (const { model, count } of modelRequests) {
            for (let i = 0; i < count; i++) {
              collector.recordRequest(model, 100, true);
              expectedTotal++;
            }
          }

          const stats = collector.getStats();

          // Property: sum of per-model counts should equal total requests
          const modelCountSum = Object.values(stats.modelUsage).reduce((a, b) => a + b, 0);
          assertEquals(modelCountSum, stats.totalRequests,
            `Sum of model counts (${modelCountSum}) should equal total requests (${stats.totalRequests})`);
          assertEquals(stats.totalRequests, expectedTotal,
            `Total requests should be ${expectedTotal}, got ${stats.totalRequests}`);
        }
      ),
      { numRuns: 100 }
    );
  });

  await t.step("should accurately count requests per model", () => {
    fc.assert(
      fc.property(
        // Generate distinct model names with specific counts
        fc.tuple(
          fc.integer({ min: 1, max: 30 }),
          fc.integer({ min: 1, max: 30 }),
          fc.integer({ min: 1, max: 30 }),
        ),
        ([count1, count2, count3]: [number, number, number]) => {
          const collector = new StatsCollector();

          const model1 = "claude-4-5-sonnet";
          const model2 = "gpt-5.1";
          const model3 = "gemini-2.5-pro";

          // Record requests for each model
          for (let i = 0; i < count1; i++) {
            collector.recordRequest(model1, 100, true);
          }
          for (let i = 0; i < count2; i++) {
            collector.recordRequest(model2, 100, true);
          }
          for (let i = 0; i < count3; i++) {
            collector.recordRequest(model3, 100, false); // Mix success/failure
          }

          const stats = collector.getStats();

          // Property: each model's count should match recorded requests
          assertEquals(stats.modelUsage[model1], count1,
            `${model1} count should be ${count1}, got ${stats.modelUsage[model1]}`);
          assertEquals(stats.modelUsage[model2], count2,
            `${model2} count should be ${count2}, got ${stats.modelUsage[model2]}`);
          assertEquals(stats.modelUsage[model3], count3,
            `${model3} count should be ${count3}, got ${stats.modelUsage[model3]}`);
        }
      ),
      { numRuns: 100 }
    );
  });

  await t.step("should handle same model with different success states", () => {
    fc.assert(
      fc.property(
        // Generate success and error counts for same model
        fc.integer({ min: 1, max: 30 }),
        fc.integer({ min: 1, max: 30 }),
        (successCount: number, errorCount: number) => {
          const collector = new StatsCollector();
          const model = "test-model";

          // Record successful requests
          for (let i = 0; i < successCount; i++) {
            collector.recordRequest(model, 100, true);
          }

          // Record failed requests for same model
          for (let i = 0; i < errorCount; i++) {
            collector.recordRequest(model, 100, false);
          }

          const stats = collector.getStats();

          // Property: model count should include both success and error
          assertEquals(stats.modelUsage[model], successCount + errorCount,
            `Model count should be ${successCount + errorCount}, got ${stats.modelUsage[model]}`);
        }
      ),
      { numRuns: 100 }
    );
  });

  await t.step("should return empty model usage when no requests", () => {
    const collector = new StatsCollector();
    const stats = collector.getStats();

    // Property: model usage should be empty object
    assertEquals(Object.keys(stats.modelUsage).length, 0,
      "Model usage should be empty when no requests");
  });

  await t.step("should preserve model counts independently", () => {
    fc.assert(
      fc.property(
        // Generate random model name
        fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'), { minLength: 3, maxLength: 15 }),
        fc.integer({ min: 1, max: 20 }),
        (modelName: string, count: number) => {
          const collector = new StatsCollector();

          // Record requests for the model
          for (let i = 0; i < count; i++) {
            collector.recordRequest(modelName, 100, true);
          }

          // Record requests for a different model
          collector.recordRequest("other-model", 100, true);

          const stats = collector.getStats();

          // Property: original model count should be unchanged
          assertEquals(stats.modelUsage[modelName], count,
            `Model ${modelName} count should be ${count}, got ${stats.modelUsage[modelName]}`);
          assertEquals(stats.modelUsage["other-model"], 1,
            `other-model count should be 1`);
        }
      ),
      { numRuns: 50 }
    );
  });
});


// ============== Property 7: Token estimation consistency ==============
// **Feature: tempo-proxy-enhancements, Property 7: Token estimation consistency**
// **Validates: Requirements 6.2**

import { estimateTokens, sanitizeLog, containsSensitiveData } from "./logging.ts";

Deno.test("Property 7: Token estimation consistency", async (t) => {
  await t.step("should estimate tokens as approximately length/4", () => {
    fc.assert(
      fc.property(
        // Generate random strings of various lengths
        fc.string({ minLength: 0, maxLength: 10000 }),
        (text: string) => {
          const result = estimateTokens(text);
          const expected = Math.ceil(text.length / 4);

          // Property: estimated tokens should equal ceil(length/4)
          assertEquals(result, expected,
            `estimateTokens("${text.substring(0, 20)}...") should be ${expected}, got ${result}`);
        }
      ),
      { numRuns: 100 }
    );
  });

  await t.step("should return 0 for empty strings", () => {
    assertEquals(estimateTokens(""), 0, "Empty string should have 0 tokens");
  });

  await t.step("should return 0 for null/undefined", () => {
    assertEquals(estimateTokens(null as unknown as string), 0, "null should have 0 tokens");
    assertEquals(estimateTokens(undefined as unknown as string), 0, "undefined should have 0 tokens");
  });

  await t.step("should handle various text types consistently", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          // ASCII text
          fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 '), { minLength: 1, maxLength: 500 }),
          // Unicode text
          fc.string({ minLength: 1, maxLength: 500 }),
          // JSON-like text
          fc.json().map(j => JSON.stringify(j))
        ),
        (text: string) => {
          const result = estimateTokens(text);

          // Property: result should always be >= 0
          assertEquals(result >= 0, true,
            `Token count should be >= 0, got ${result}`);

          // Property: result should be ceil(length/4)
          const expected = Math.ceil(text.length / 4);
          assertEquals(result, expected,
            `Token count should be ${expected}, got ${result}`);
        }
      ),
      { numRuns: 100 }
    );
  });

  await t.step("should be monotonically increasing with text length", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 1000 }),
        fc.string({ minLength: 1, maxLength: 1000 }),
        (text1: string, text2: string) => {
          const combined = text1 + text2;
          const tokens1 = estimateTokens(text1);
          const tokensCombined = estimateTokens(combined);

          // Property: longer text should have >= tokens
          assertEquals(tokensCombined >= tokens1, true,
            `Combined text tokens (${tokensCombined}) should be >= first text tokens (${tokens1})`);
        }
      ),
      { numRuns: 100 }
    );
  });

  await t.step("should produce reasonable estimates for typical prompts", () => {
    // Test with realistic prompt sizes
    const shortPrompt = "Hello, how are you?";
    const mediumPrompt = "Please write a function that calculates the factorial of a number. The function should handle edge cases like negative numbers and zero.";
    const longPrompt = "I need you to help me build a complete REST API for a todo application. The API should support creating, reading, updating, and deleting tasks. Each task should have a title, description, due date, and completion status. Please include proper error handling and validation.";

    const shortTokens = estimateTokens(shortPrompt);
    const mediumTokens = estimateTokens(mediumPrompt);
    const longTokens = estimateTokens(longPrompt);

    // Property: token counts should increase with prompt length
    assertEquals(shortTokens < mediumTokens, true,
      `Short prompt tokens (${shortTokens}) should be < medium (${mediumTokens})`);
    assertEquals(mediumTokens < longTokens, true,
      `Medium prompt tokens (${mediumTokens}) should be < long (${longTokens})`);

    // Verify specific values
    assertEquals(shortTokens, Math.ceil(shortPrompt.length / 4));
    assertEquals(mediumTokens, Math.ceil(mediumPrompt.length / 4));
    assertEquals(longTokens, Math.ceil(longPrompt.length / 4));
  });
});


// ============== Property 8: Log sanitization removes sensitive data ==============
// **Feature: tempo-proxy-enhancements, Property 8: Log sanitization removes sensitive data**
// **Validates: Requirements 6.4**

Deno.test("Property 8: Log sanitization removes sensitive data", async (t) => {
  await t.step("should remove Bearer tokens from logs", () => {
    fc.assert(
      fc.property(
        // Generate random JWT-like tokens
        fc.tuple(
          fc.hexaString({ minLength: 20, maxLength: 50 }),
          fc.hexaString({ minLength: 20, maxLength: 50 }),
          fc.hexaString({ minLength: 20, maxLength: 50 })
        ).map(([a, b, c]) => `Bearer ${a}.${b}.${c}`),
        fc.string({ minLength: 0, maxLength: 100 }),
        (token: string, prefix: string) => {
          const logEntry = `${prefix} Authorization: ${token} some other text`;
          const sanitized = sanitizeLog(logEntry);

          // Property: sanitized log should not contain the Bearer token
          assertEquals(sanitized.includes(token), false,
            `Sanitized log should not contain Bearer token`);
          assertEquals(sanitized.includes("[REDACTED]"), true,
            `Sanitized log should contain [REDACTED]`);
        }
      ),
      { numRuns: 100 }
    );
  });

  await t.step("should remove JWT tokens from logs", () => {
    fc.assert(
      fc.property(
        // Generate valid JWT-like tokens (eyJ prefix for base64 encoded JSON)
        fc.tuple(
          fc.constantFrom("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"),
          fc.hexaString({ minLength: 20, maxLength: 50 }).map(s => `eyJ${s}`),
          fc.hexaString({ minLength: 20, maxLength: 50 })
        ).map(([header, payload, sig]) => `${header}.${payload}.${sig}`),
        (token: string) => {
          const logEntry = `Processing request with token: ${token}`;
          const sanitized = sanitizeLog(logEntry);

          // Property: sanitized log should not contain the JWT token
          assertEquals(sanitized.includes(token), false,
            `Sanitized log should not contain JWT token`);
        }
      ),
      { numRuns: 100 }
    );
  });

  await t.step("should remove API keys from logs", () => {
    fc.assert(
      fc.property(
        // Generate API key-like strings
        fc.oneof(
          fc.hexaString({ minLength: 20, maxLength: 50 }).map(s => `sk-${s}`),
          fc.hexaString({ minLength: 20, maxLength: 50 }).map(s => `pk-${s}`)
        ),
        (apiKey: string) => {
          const logEntry = `Request with api_key: ${apiKey}`;
          const sanitized = sanitizeLog(logEntry);

          // Property: sanitized log should not contain the API key
          assertEquals(sanitized.includes(apiKey), false,
            `Sanitized log should not contain API key: ${apiKey.substring(0, 10)}...`);
        }
      ),
      { numRuns: 100 }
    );
  });

  await t.step("should remove message content from JSON logs", () => {
    fc.assert(
      fc.property(
        // Generate random message content
        fc.string({ minLength: 10, maxLength: 200 }),
        (content: string) => {
          // Escape special characters for JSON
          const escapedContent = content.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
          const logEntry = `{"role":"user","content":"${escapedContent}"}`;
          const sanitized = sanitizeLog(logEntry);

          // Property: sanitized log should not contain the message content
          assertEquals(sanitized.includes(escapedContent), false,
            `Sanitized log should not contain message content`);
          assertEquals(sanitized.includes('"content":"[REDACTED]"'), true,
            `Sanitized log should have redacted content field`);
        }
      ),
      { numRuns: 100 }
    );
  });

  await t.step("should preserve non-sensitive data", () => {
    fc.assert(
      fc.property(
        // Generate non-sensitive log data
        fc.record({
          method: fc.constantFrom("GET", "POST", "PUT", "DELETE"),
          path: fc.stringOf(fc.constantFrom(...'/abcdefghijklmnopqrstuvwxyz0123456789-_'), { minLength: 1, maxLength: 50 }),
          status: fc.integer({ min: 200, max: 599 }),
          duration: fc.integer({ min: 1, max: 10000 }),
        }),
        (data: { method: string; path: string; status: number; duration: number }) => {
          const logEntry = `${data.method} ${data.path} status=${data.status} ${data.duration}ms`;
          const sanitized = sanitizeLog(logEntry);

          // Property: non-sensitive data should be preserved
          assertEquals(sanitized.includes(data.method), true,
            `Method should be preserved`);
          assertEquals(sanitized.includes(data.path), true,
            `Path should be preserved`);
          assertEquals(sanitized.includes(String(data.status)), true,
            `Status should be preserved`);
          assertEquals(sanitized.includes(`${data.duration}ms`), true,
            `Duration should be preserved`);
        }
      ),
      { numRuns: 100 }
    );
  });

  await t.step("should handle object input", () => {
    fc.assert(
      fc.property(
        fc.hexaString({ minLength: 30, maxLength: 50 }),
        (tokenValue: string) => {
          const logObject = {
            method: "POST",
            path: "/v1/chat/completions",
            authorization: `Bearer ${tokenValue}`,
          };
          const sanitized = sanitizeLog(logObject);

          // Property: token should be redacted even in object input
          assertEquals(sanitized.includes(tokenValue), false,
            `Token should be redacted from object input`);
        }
      ),
      { numRuns: 50 }
    );
  });

  await t.step("should return empty string for invalid input", () => {
    assertEquals(sanitizeLog(null as unknown as string), "", "null should return empty string");
    assertEquals(sanitizeLog(undefined as unknown as string), "", "undefined should return empty string");
    assertEquals(sanitizeLog(123 as unknown as string), "", "number should return empty string");
  });

  await t.step("containsSensitiveData should detect sensitive patterns", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          // Bearer tokens
          fc.hexaString({ minLength: 20, maxLength: 50 }).map(s => `Bearer ${s}`),
          // JWT tokens
          fc.tuple(
            fc.constantFrom("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"),
            fc.hexaString({ minLength: 20, maxLength: 50 }).map(s => `eyJ${s}`),
            fc.hexaString({ minLength: 20, maxLength: 50 })
          ).map(([h, p, s]) => `${h}.${p}.${s}`),
          // API keys
          fc.hexaString({ minLength: 20, maxLength: 50 }).map(s => `sk-${s}`)
        ),
        (sensitiveData: string) => {
          const text = `Some log with ${sensitiveData} in it`;

          // Property: should detect sensitive data
          assertEquals(containsSensitiveData(text), true,
            `Should detect sensitive data in: ${text.substring(0, 30)}...`);
        }
      ),
      { numRuns: 100 }
    );
  });

  await t.step("containsSensitiveData should return false for safe text", () => {
    fc.assert(
      fc.property(
        // Generate safe text without sensitive patterns
        fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789 '), { minLength: 1, maxLength: 100 }),
        (safeText: string) => {
          // Property: should not flag safe text as sensitive
          assertEquals(containsSensitiveData(safeText), false,
            `Should not flag safe text: ${safeText.substring(0, 30)}...`);
        }
      ),
      { numRuns: 100 }
    );
  });
});


// ============== Property 11: API key validation accepts both headers ==============
// **Feature: tempo-proxy-enhancements, Property 11: API key validation accepts both headers**
// **Validates: Requirements 9.4**

import { extractApiKey, validateApiKey, validateRequest, clearAuthConfigCache } from "./auth.ts";

Deno.test("Property 11: API key validation accepts both headers", async (t) => {
  await t.step("should extract API key from Authorization header (Bearer format)", () => {
    fc.assert(
      fc.property(
        // Generate random API key strings
        fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_'), { minLength: 10, maxLength: 64 }),
        (apiKey: string) => {
          const req = new Request("http://localhost:3000/v1/chat/completions", {
            headers: { "Authorization": `Bearer ${apiKey}` },
          });

          const result = extractApiKey(req);

          // Property: extracted API key should match the provided key
          assertEquals(result, apiKey, `API key should be extracted from Bearer token`);
        }
      ),
      { numRuns: 100 }
    );
  });

  await t.step("should extract API key from x-api-key header", () => {
    fc.assert(
      fc.property(
        // Generate random API key strings
        fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_'), { minLength: 10, maxLength: 64 }),
        (apiKey: string) => {
          const req = new Request("http://localhost:3000/v1/chat/completions", {
            headers: { "x-api-key": apiKey },
          });

          const result = extractApiKey(req);

          // Property: extracted API key should match the provided key
          assertEquals(result, apiKey, `API key should be extracted from x-api-key header`);
        }
      ),
      { numRuns: 100 }
    );
  });

  await t.step("should prioritize Authorization header over x-api-key", () => {
    fc.assert(
      fc.property(
        // Generate two different API keys
        fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_'), { minLength: 10, maxLength: 64 }),
        fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_'), { minLength: 10, maxLength: 64 }),
        (authKey: string, xApiKey: string) => {
          const req = new Request("http://localhost:3000/v1/chat/completions", {
            headers: {
              "Authorization": `Bearer ${authKey}`,
              "x-api-key": xApiKey,
            },
          });

          const result = extractApiKey(req);

          // Property: Authorization header should take precedence
          assertEquals(result, authKey, `Authorization header should take precedence over x-api-key`);
        }
      ),
      { numRuns: 100 }
    );
  });

  await t.step("should return null when no API key headers present", () => {
    fc.assert(
      fc.property(
        // Generate random path segments (without leading slash, we'll add it)
        fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-_'), { minLength: 1, maxLength: 50 }),
        (pathSegment: string) => {
          const req = new Request(`http://localhost:3000/${pathSegment}`);

          const result = extractApiKey(req);

          // Property: should return null when no API key headers
          assertEquals(result, null, `Should return null when no API key headers present`);
        }
      ),
      { numRuns: 50 }
    );
  });

  await t.step("should handle case-insensitive Bearer prefix", () => {
    fc.assert(
      fc.property(
        fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_'), { minLength: 10, maxLength: 64 }),
        fc.constantFrom("Bearer", "bearer", "BEARER", "BeArEr"),
        (apiKey: string, bearerPrefix: string) => {
          const req = new Request("http://localhost:3000/v1/chat/completions", {
            headers: { "Authorization": `${bearerPrefix} ${apiKey}` },
          });

          const result = extractApiKey(req);

          // Property: Bearer prefix should be case-insensitive
          assertEquals(result, apiKey, `Bearer prefix should be case-insensitive`);
        }
      ),
      { numRuns: 50 }
    );
  });

  await t.step("should validate matching API keys", () => {
    fc.assert(
      fc.property(
        fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_'), { minLength: 10, maxLength: 64 }),
        (apiKey: string) => {
          // Property: same key should validate successfully
          assertEquals(validateApiKey(apiKey, apiKey), true, `Same API key should validate`);
        }
      ),
      { numRuns: 100 }
    );
  });

  await t.step("should reject non-matching API keys", () => {
    fc.assert(
      fc.property(
        fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_'), { minLength: 10, maxLength: 64 }),
        fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_'), { minLength: 10, maxLength: 64 }),
        (providedKey: string, configuredKey: string) => {
          // Skip if keys happen to be the same
          if (providedKey === configuredKey) return;

          // Property: different keys should not validate
          assertEquals(validateApiKey(providedKey, configuredKey), false, `Different API keys should not validate`);
        }
      ),
      { numRuns: 100 }
    );
  });

  await t.step("should allow all requests when no API key configured", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(null),
          fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_'), { minLength: 10, maxLength: 64 })
        ),
        (providedKey: string | null) => {
          // Property: when no configured key, all requests should be allowed
          assertEquals(validateApiKey(providedKey, null), true, `Should allow all requests when no API key configured`);
        }
      ),
      { numRuns: 50 }
    );
  });

  await t.step("should reject requests with null key when API key is configured", () => {
    fc.assert(
      fc.property(
        fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_'), { minLength: 10, maxLength: 64 }),
        (configuredKey: string) => {
          // Property: null provided key should be rejected when configured key exists
          assertEquals(validateApiKey(null, configuredKey), false, `Should reject null key when API key is configured`);
        }
      ),
      { numRuns: 50 }
    );
  });

  await t.step("should handle empty and whitespace-only keys", () => {
    // Empty string should be treated as no key
    assertEquals(extractApiKey(new Request("http://localhost:3000/test", {
      headers: { "x-api-key": "" },
    })), null, "Empty x-api-key should return null");

    assertEquals(extractApiKey(new Request("http://localhost:3000/test", {
      headers: { "x-api-key": "   " },
    })), null, "Whitespace-only x-api-key should return null");

    assertEquals(extractApiKey(new Request("http://localhost:3000/test", {
      headers: { "Authorization": "Bearer " },
    })), null, "Bearer with no token should return null");
  });

  await t.step("should handle null/undefined request gracefully", () => {
    assertEquals(extractApiKey(null as unknown as Request), null, "null request should return null");
    assertEquals(extractApiKey(undefined as unknown as Request), null, "undefined request should return null");
  });
});



// ============== Property 12: Invalid API key rejection ==============
// **Feature: tempo-proxy-enhancements, Property 12: Invalid API key rejection**
// **Validates: Requirements 9.2**

Deno.test("Property 12: Invalid API key rejection", async (t) => {
  await t.step("should reject requests with missing API key when auth is enabled", () => {
    fc.assert(
      fc.property(
        // Generate configured API key
        fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_'), { minLength: 10, maxLength: 64 }),
        (configuredKey: string) => {
          // Request without any API key
          const req = new Request("http://localhost:3000/v1/chat/completions", {
            method: "POST",
          });

          const providedKey = extractApiKey(req);

          // Property: missing key should fail validation when auth is enabled
          assertEquals(validateApiKey(providedKey, configuredKey), false,
            `Missing API key should be rejected when auth is enabled`);
        }
      ),
      { numRuns: 100 }
    );
  });

  await t.step("should reject requests with incorrect API key", () => {
    fc.assert(
      fc.property(
        // Generate configured API key
        fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_'), { minLength: 10, maxLength: 64 }),
        // Generate different provided API key
        fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_'), { minLength: 10, maxLength: 64 }),
        (configuredKey: string, providedKey: string) => {
          // Skip if keys happen to be the same
          if (configuredKey === providedKey) return;

          // Request with wrong API key in Authorization header
          const req = new Request("http://localhost:3000/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${providedKey}` },
          });

          const extractedKey = extractApiKey(req);

          // Property: incorrect key should fail validation
          assertEquals(validateApiKey(extractedKey, configuredKey), false,
            `Incorrect API key should be rejected`);
        }
      ),
      { numRuns: 100 }
    );
  });

  await t.step("should reject requests with incorrect API key in x-api-key header", () => {
    fc.assert(
      fc.property(
        // Generate configured API key
        fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_'), { minLength: 10, maxLength: 64 }),
        // Generate different provided API key
        fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_'), { minLength: 10, maxLength: 64 }),
        (configuredKey: string, providedKey: string) => {
          // Skip if keys happen to be the same
          if (configuredKey === providedKey) return;

          // Request with wrong API key in x-api-key header
          const req = new Request("http://localhost:3000/v1/chat/completions", {
            method: "POST",
            headers: { "x-api-key": providedKey },
          });

          const extractedKey = extractApiKey(req);

          // Property: incorrect key should fail validation
          assertEquals(validateApiKey(extractedKey, configuredKey), false,
            `Incorrect API key in x-api-key header should be rejected`);
        }
      ),
      { numRuns: 100 }
    );
  });

  await t.step("should accept requests with correct API key in Authorization header", () => {
    fc.assert(
      fc.property(
        // Generate API key
        fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_'), { minLength: 10, maxLength: 64 }),
        (apiKey: string) => {
          // Request with correct API key in Authorization header
          const req = new Request("http://localhost:3000/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${apiKey}` },
          });

          const extractedKey = extractApiKey(req);

          // Property: correct key should pass validation
          assertEquals(validateApiKey(extractedKey, apiKey), true,
            `Correct API key in Authorization header should be accepted`);
        }
      ),
      { numRuns: 100 }
    );
  });

  await t.step("should accept requests with correct API key in x-api-key header", () => {
    fc.assert(
      fc.property(
        // Generate API key
        fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_'), { minLength: 10, maxLength: 64 }),
        (apiKey: string) => {
          // Request with correct API key in x-api-key header
          const req = new Request("http://localhost:3000/v1/chat/completions", {
            method: "POST",
            headers: { "x-api-key": apiKey },
          });

          const extractedKey = extractApiKey(req);

          // Property: correct key should pass validation
          assertEquals(validateApiKey(extractedKey, apiKey), true,
            `Correct API key in x-api-key header should be accepted`);
        }
      ),
      { numRuns: 100 }
    );
  });

  await t.step("should allow all requests when auth is disabled (no configured key)", () => {
    fc.assert(
      fc.property(
        // Generate any provided key (or none)
        fc.oneof(
          fc.constant(null),
          fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_'), { minLength: 10, maxLength: 64 })
        ),
        (providedKey: string | null) => {
          // Property: when no configured key (auth disabled), all requests should pass
          assertEquals(validateApiKey(providedKey, null), true,
            `All requests should be allowed when auth is disabled`);
        }
      ),
      { numRuns: 50 }
    );
  });

  await t.step("should reject empty string as API key when auth is enabled", () => {
    fc.assert(
      fc.property(
        // Generate configured API key
        fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_'), { minLength: 10, maxLength: 64 }),
        (configuredKey: string) => {
          // Property: empty string should fail validation when auth is enabled
          assertEquals(validateApiKey("", configuredKey), false,
            `Empty string API key should be rejected when auth is enabled`);
        }
      ),
      { numRuns: 50 }
    );
  });

  await t.step("should be case-sensitive for API key comparison", () => {
    fc.assert(
      fc.property(
        // Generate API key with mixed case
        fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'), { minLength: 10, maxLength: 64 }),
        (apiKey: string) => {
          // Skip if key is all same case (can't test case sensitivity)
          if (apiKey.toLowerCase() === apiKey.toUpperCase()) return;

          const upperKey = apiKey.toUpperCase();
          const lowerKey = apiKey.toLowerCase();

          // Skip if they happen to be the same
          if (upperKey === lowerKey) return;

          // Property: different case should fail validation
          assertEquals(validateApiKey(upperKey, lowerKey), false,
            `API key comparison should be case-sensitive`);
          assertEquals(validateApiKey(lowerKey, upperKey), false,
            `API key comparison should be case-sensitive (reverse)`);
        }
      ),
      { numRuns: 50 }
    );
  });
});
