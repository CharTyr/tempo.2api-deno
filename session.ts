/**
 * Session Manager - 动态获取和管理 Session ID
 */

// ============== Types ==============

export interface ClientTokenPayload {
  userId: string;
  clientId: string;
}

export interface SessionCache {
  sessionId: string;
  expiresAt: number;
}

export interface ClerkSession {
  id: string;
  status: string;
  expire_at: number;
  last_active_at: number;
}

export interface ClerkClientResponse {
  response: {
    sessions: ClerkSession[];
  };
}

// ============== Session Manager ==============

// Session cache with expiry
let cachedSession: SessionCache | null = null;

// Default cache duration: 5 minutes
const SESSION_CACHE_DURATION_MS = 5 * 60 * 1000;

// Retry configuration for session fetching
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
};

/**
 * 解析 Client Token (JWT) 提取 userId 和 clientId
 * Client Token 是存储在 __client Cookie 中的长期令牌
 * 
 * @param token - JWT 格式的 client token
 * @returns 包含 userId 和 clientId 的对象，解析失败时返回空字符串
 */
export function parseClientToken(token: string): ClientTokenPayload {
  try {
    if (!token || typeof token !== "string") {
      return { userId: "", clientId: "" };
    }

    // JWT 格式: header.payload.signature
    const parts = token.split(".");
    if (parts.length !== 3) {
      return { userId: "", clientId: "" };
    }

    // Base64URL 解码 payload
    const payloadBase64 = parts[1];
    // 处理 Base64URL 编码 (替换 - 为 +, _ 为 /)
    const base64 = payloadBase64.replace(/-/g, "+").replace(/_/g, "/");
    // 添加 padding
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    
    const payloadJson = atob(padded);
    const payload = JSON.parse(payloadJson);

    // Clerk JWT 中 sub 字段是 userId, 可能有 client_id 或 azp 字段
    const userId = payload.sub || payload.user_id || "";
    const clientId = payload.client_id || payload.azp || payload.aud || "";

    return { userId, clientId };
  } catch {
    // 解析失败时返回空值
    return { userId: "", clientId: "" };
  }
}

/**
 * 计算指数退避延迟
 * @param attempt - 当前重试次数 (0-indexed)
 * @returns 延迟时间 (毫秒)
 */
export function calculateBackoff(attempt: number): number {
  const delay = RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt);
  return Math.min(delay, RETRY_CONFIG.maxDelayMs);
}

/**
 * 延迟执行
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 从 Clerk API 获取活跃的 Session ID
 * 
 * @param clientToken - Client Token (存储在 __client Cookie 中)
 * @returns 活跃的 Session ID
 * @throws 如果无法获取 Session ID
 */
export async function fetchSessionIdFromClerk(clientToken: string): Promise<string> {
  const url = "https://clerk.tempo.build/v1/client?_clerk_js_version=5.56.0-snapshot.v20250530185653";
  
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < RETRY_CONFIG.maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Cookie": `__client=${clientToken}`,
          "Origin": "https://app.tempo.build",
        },
      });

      if (!response.ok) {
        throw new Error(`Clerk API 返回错误: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as ClerkClientResponse;
      
      // 查找活跃的 session
      const sessions = data.response?.sessions || [];
      const activeSession = sessions.find((s) => s.status === "active");
      
      if (!activeSession) {
        throw new Error("没有找到活跃的 Session");
      }

      return activeSession.id;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`[Session] 获取 Session ID 失败 (尝试 ${attempt + 1}/${RETRY_CONFIG.maxRetries}):`, lastError.message);
      
      if (attempt < RETRY_CONFIG.maxRetries - 1) {
        const delay = calculateBackoff(attempt);
        console.log(`[Session] ${delay}ms 后重试...`);
        await sleep(delay);
      }
    }
  }

  throw lastError || new Error("获取 Session ID 失败");
}

/**
 * 获取 Session ID (带缓存)
 * 
 * @param clientToken - Client Token
 * @param forceRefresh - 是否强制刷新缓存
 * @returns Session ID
 */
export async function getSessionId(clientToken: string, forceRefresh = false): Promise<string> {
  // 检查缓存是否有效
  if (!forceRefresh && cachedSession && Date.now() < cachedSession.expiresAt) {
    return cachedSession.sessionId;
  }

  // 从 Clerk API 获取新的 Session ID
  const sessionId = await fetchSessionIdFromClerk(clientToken);
  
  // 更新缓存
  cachedSession = {
    sessionId,
    expiresAt: Date.now() + SESSION_CACHE_DURATION_MS,
  };

  console.log(`[Session] Session ID 已缓存: ${sessionId.substring(0, 10)}...`);
  
  return sessionId;
}

/**
 * 清除 Session 缓存
 */
export function clearSessionCache(): void {
  cachedSession = null;
}

/**
 * 获取当前缓存状态 (用于测试)
 */
export function getSessionCacheStatus(): { cached: boolean; expiresAt: number | null } {
  return {
    cached: cachedSession !== null,
    expiresAt: cachedSession?.expiresAt || null,
  };
}
