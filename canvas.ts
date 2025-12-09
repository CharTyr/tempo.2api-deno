/**
 * Canvas Manager - Canvas ID 提取和验证
 */

/**
 * UUID v4 正则表达式
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * 验证 Canvas ID 是否为有效的 UUID 格式
 */
export function validateCanvasId(canvasId: string): boolean {
  if (!canvasId || typeof canvasId !== "string") {
    return false;
  }
  return UUID_REGEX.test(canvasId);
}

/**
 * 从请求中提取 Canvas ID
 * 优先级: x-canvas-id header > canvas_id query parameter > 环境变量默认值
 */
export function getCanvasIdFromRequest(req: Request, defaultCanvasId: string): string {
  // 1. 检查 x-canvas-id header
  const headerCanvasId = req.headers.get("x-canvas-id");
  if (headerCanvasId) {
    return headerCanvasId;
  }

  // 2. 检查 canvas_id query parameter
  const url = new URL(req.url);
  const queryCanvasId = url.searchParams.get("canvas_id");
  if (queryCanvasId) {
    return queryCanvasId;
  }

  // 3. 返回默认值
  return defaultCanvasId;
}
