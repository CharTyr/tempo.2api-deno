# Tempo API Proxy - Deno 版

将 [Tempo.build](https://tempo.build) 的 AI 聊天接口封装成 OpenAI 兼容格式。

**单文件版本，无需安装依赖，直接运行！**

---

## ✨ 功能特点

- 🔄 **OpenAI 兼容** - 支持标准 Chat Completions API
- 🌊 **流式响应** - 支持 SSE 流式输出
- 🔑 **自动刷新 Token** - 无需手动更新，自动从 Clerk API 获取 Session ID
- 🆓 **免费模式** - 自动启用，不消耗 credits
- 🧠 **深度思考** - `-reasoning` 后缀
- 🔍 **网络搜索** - `-search` 后缀
- 💬 **多轮对话** - 完整上下文支持
- 🎨 **多 Canvas 支持** - 可在请求中指定不同的 Canvas ID
- 🔁 **自动重试** - 网络错误自动重试，指数退避
- 🚦 **速率限制** - 可选的请求频率限制
- 📊 **请求队列** - 并发控制，防止上游 API 过载
- 📈 **统计信息** - 实时 API 使用统计
- 🔐 **API Key 认证** - 可选的代理访问保护
- 💚 **健康检查** - 服务状态监控端点

---

## 📋 支持的模型

| 基础模型 | 提供商 |
|----------|--------|
| `claude-4-5-opus` | Anthropic |
| `claude-4-5-sonnet` | Anthropic |
| `claude-4-5-haiku` | Anthropic |
| `claude-4-sonnet` | Anthropic |
| `gemini-3-pro` | Google |
| `gemini-2.5-pro` | Google |
| `gpt-5.1` | OpenAI |
| `auto` | Tempo 自动选择 |

**每个模型都有 4 个变体：**

| 模型名 | 功能 |
|--------|------|
| `claude-4-5-opus` | 普通模式 |
| `claude-4-5-opus-reasoning` | 深度思考 |
| `claude-4-5-opus-search` | 网络搜索 |
| `claude-4-5-opus-reasoning-search` | 思考 + 搜索 |

---

## 🔑 获取凭证

你需要获取两个东西：**Client Token** 和 **Canvas ID**

### 1. 获取 Client Token

1. 打开浏览器，登录 https://app.tempo.build
2. 按 `F12` 打开开发者工具
3. 点击顶部的 **Application**（应用程序）标签
4. 在左侧边栏找到 **Storage** → **Cookies** → `https://app.tempo.build`
5. 在右侧列表中找到名为 `__client` 的 Cookie
6. 双击 **Value** 列，复制整个值

```
__client 的值类似这样（很长的一串）：
eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImNsaWVudF8...
```

> ⚠️ **重要：** 这个 Token 有效期约 1-2 年，请妥善保管！

### 2. 获取 Canvas ID

1. 在 Tempo 中打开任意一个项目（或创建一个新项目）
2. 看浏览器地址栏，URL 格式如下：
   ```
   https://app.tempo.build/canvases/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   ```
3. 复制 `canvases/` 后面的那串 UUID

**示例：**
- URL: `https://app.tempo.build/canvases/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
- Canvas ID: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`

---

## 🚀 运行

### 前提条件

安装 [Deno](https://deno.land/)：

```bash
# macOS/Linux
curl -fsSL https://deno.land/install.sh | sh

# Windows (PowerShell)
irm https://deno.land/install.ps1 | iex
```

### 一键启动脚本（推荐）

项目提供了便捷的启动脚本，会自动检查环境并提示输入必要的配置：

**Windows:**
```cmd
cd deno
start.bat
```

**Linux / macOS:**
```bash
cd deno
chmod +x start.sh
./start.sh
```

启动脚本会：
- ✅ 检查 Deno 是否已安装
- ✅ 提示输入缺失的环境变量
- ✅ 显示当前配置状态
- ✅ 启动代理服务

### 手动运行

#### Linux / macOS

```bash
# 设置环境变量
export TEMPO_CLIENT_TOKEN="你的client_token"
export TEMPO_CANVAS_ID="你的canvas_id"

# 运行
cd deno
deno run --allow-net --allow-env main.ts
```

#### Windows (PowerShell)

```powershell
# 设置环境变量
$env:TEMPO_CLIENT_TOKEN="你的client_token"
$env:TEMPO_CANVAS_ID="你的canvas_id"

# 运行
cd deno
deno run --allow-net --allow-env main.ts
```


#### Windows (CMD)

```cmd
set TEMPO_CLIENT_TOKEN=你的client_token
set TEMPO_CANVAS_ID=你的canvas_id
cd deno
deno run --allow-net --allow-env main.ts
```

启动成功后会显示：

```
╔═══════════════════════════════════════════╗
║     Tempo API Proxy (Deno 版)             ║
╠═══════════════════════════════════════════╣
║  端口: 3000                               ║
║  POST /v1/chat/completions                ║
║  GET  /v1/models                          ║
║  GET  /health                             ║
║  GET  /stats                              ║
╚═══════════════════════════════════════════╝
```

---

## ⚙️ 环境变量配置

### 必填变量

| 变量 | 说明 |
|------|------|
| `TEMPO_CLIENT_TOKEN` | Tempo Client Token（从 Cookie 获取） |
| `TEMPO_CANVAS_ID` | 默认 Canvas ID（UUID 格式） |

### 可选变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3000` | 服务端口 |
| `PROXY_API_KEY` | (空) | 代理 API Key，设置后需要认证才能访问 |
| `RATE_LIMIT_ENABLED` | `false` | 是否启用速率限制 |
| `RATE_LIMIT_WINDOW` | `60000` | 速率限制时间窗口（毫秒） |
| `RATE_LIMIT_MAX` | `60` | 时间窗口内最大请求数 |
| `MAX_CONCURRENT` | `5` | 最大并发请求数 |
| `MAX_QUEUE_SIZE` | `100` | 最大队列长度 |
| `MAX_RETRIES` | `3` | 请求失败最大重试次数 |

### 配置示例

```bash
# 基础配置
export TEMPO_CLIENT_TOKEN="eyJhbGciOiJSUzI1NiIs..."
export TEMPO_CANVAS_ID="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

# 启用 API Key 认证
export PROXY_API_KEY="my-secret-api-key"

# 启用速率限制（每分钟最多 30 个请求）
export RATE_LIMIT_ENABLED=true
export RATE_LIMIT_WINDOW=60000
export RATE_LIMIT_MAX=30

# 调整并发控制
export MAX_CONCURRENT=10
export MAX_QUEUE_SIZE=200
```

---

## 📖 API 接口

### OpenAI 兼容接口

#### POST /v1/chat/completions

```json
{
  "model": "claude-4-5-opus",
  "messages": [
    {"role": "system", "content": "你是一个助手"},
    {"role": "user", "content": "你好"}
  ],
  "stream": false
}
```

#### GET /v1/models

获取可用模型列表。

### Anthropic 兼容接口 (Claude Code)

#### POST /v1/messages

```json
{
  "model": "claude-4-5-opus",
  "max_tokens": 4096,
  "system": "你是一个助手",
  "messages": [
    {"role": "user", "content": "你好"}
  ],
  "stream": true
}
```

### 健康检查

#### GET /health

返回服务状态信息：

```json
{
  "status": "ok",
  "uptime": 3600,
  "version": "1.0.0",
  "tokenStatus": "valid"
}
```

| 字段 | 说明 |
|------|------|
| `status` | 服务状态：`ok`（正常）、`degraded`（降级）、`error`（错误） |
| `uptime` | 运行时间（秒） |
| `version` | 版本号 |
| `tokenStatus` | Token 状态：`valid`（有效）、`expired`（过期）、`unknown`（未知） |

### 统计信息

#### GET /stats

返回 API 使用统计：

```json
{
  "uptime": 3600,
  "totalRequests": 100,
  "successCount": 95,
  "errorCount": 5,
  "successRate": 95.0,
  "averageResponseTime": 1500,
  "modelUsage": {
    "claude-4-5-opus": 50,
    "claude-4-5-sonnet": 30,
    "auto": 20
  }
}
```

| 字段 | 说明 |
|------|------|
| `uptime` | 运行时间（秒） |
| `totalRequests` | 总请求数 |
| `successCount` | 成功请求数 |
| `errorCount` | 失败请求数 |
| `successRate` | 成功率（百分比） |
| `averageResponseTime` | 平均响应时间（毫秒） |
| `modelUsage` | 各模型使用次数 |

---

## 🎨 多 Canvas 支持

可以在请求中指定不同的 Canvas ID，优先级如下：

1. `x-canvas-id` 请求头
2. `canvas_id` 查询参数
3. 环境变量 `TEMPO_CANVAS_ID`（默认值）

### 使用示例

```bash
# 通过请求头指定
curl http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "x-canvas-id: another-canvas-uuid" \
  -d '{"model": "auto", "messages": [{"role": "user", "content": "你好"}]}'

# 通过查询参数指定
curl "http://localhost:3000/v1/chat/completions?canvas_id=another-canvas-uuid" \
  -H "Content-Type: application/json" \
  -d '{"model": "auto", "messages": [{"role": "user", "content": "你好"}]}'
```

---

## 🔐 API Key 认证

设置 `PROXY_API_KEY` 环境变量后，所有请求都需要提供有效的 API Key。

### 认证方式

支持两种方式提供 API Key：

1. **Authorization 头**（推荐）
```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"model": "auto", "messages": [{"role": "user", "content": "你好"}]}'
```

2. **x-api-key 头**
```bash
curl http://localhost:3000/v1/chat/completions \
  -H "x-api-key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"model": "auto", "messages": [{"role": "user", "content": "你好"}]}'
```

### 错误响应

未提供或提供无效的 API Key 时返回 401：

```json
{
  "error": {
    "message": "Invalid API key",
    "type": "authentication_error"
  }
}
```

---

## 🚦 速率限制

启用速率限制后，超过限制的请求会返回 429 错误。

### 配置

```bash
export RATE_LIMIT_ENABLED=true
export RATE_LIMIT_WINDOW=60000   # 60 秒窗口
export RATE_LIMIT_MAX=60         # 每窗口最多 60 个请求
```

### 错误响应

```json
{
  "error": {
    "message": "Rate limit exceeded",
    "type": "rate_limit_error",
    "retryAfter": 30
  }
}
```

响应头包含 `Retry-After` 字段，指示多少秒后可以重试。

---

## 📊 请求队列

代理使用请求队列控制并发，防止上游 API 过载。

### 配置

```bash
export MAX_CONCURRENT=5    # 最大并发请求数
export MAX_QUEUE_SIZE=100  # 最大队列长度
```

### 队列满时的响应

```json
{
  "error": {
    "message": "Service busy",
    "type": "service_unavailable"
  }
}
```

返回 503 状态码，响应头包含 `Retry-After: 5`。

---

## 🔁 自动重试

网络错误或 5xx 服务器错误会自动重试，使用指数退避策略。

- 最大重试次数：3（可通过 `MAX_RETRIES` 配置）
- 退避延迟：1s → 2s → 4s（最大 10s）
- 4xx 客户端错误不会重试

### 重试失败响应

```json
{
  "error": {
    "message": "Upstream error after 3 retries",
    "type": "api_error",
    "retryCount": 3
  }
}
```

---

## 🔧 客户端配置

### CherryStudio / ChatBox / 其他客户端

| 配置项 | 值 |
|--------|-----|
| API Base URL | `http://localhost:3000/v1` |
| API Key | 你设置的 `PROXY_API_KEY`（未设置则任意值） |
| 模型 | 从列表选择，如 `claude-4-5-opus-reasoning` |

### Claude Code

Claude Code 使用 Anthropic API 格式，本代理已支持。

**配置方法：**

```bash
# Linux/macOS
export ANTHROPIC_BASE_URL="http://localhost:3000"
export ANTHROPIC_API_KEY="your-proxy-api-key"  # 或任意值（如未设置 PROXY_API_KEY）

# Windows PowerShell
$env:ANTHROPIC_BASE_URL="http://localhost:3000"
$env:ANTHROPIC_API_KEY="your-proxy-api-key"
```

### cURL 测试

```bash
# 普通请求
curl http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-4-5-opus",
    "messages": [{"role": "user", "content": "你好"}]
  }'

# 流式请求
curl http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-4-5-opus",
    "messages": [{"role": "user", "content": "你好"}],
    "stream": true
  }'

# 带思考和搜索
curl http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-4-5-opus-reasoning-search",
    "messages": [{"role": "user", "content": "搜索最新的AI新闻"}]
  }'

# 健康检查
curl http://localhost:3000/health

# 统计信息
curl http://localhost:3000/stats

# 获取模型列表
curl http://localhost:3000/v1/models
```

### Python

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:3000/v1",
    api_key="your-proxy-api-key"  # 或任意值
)

response = client.chat.completions.create(
    model="claude-4-5-opus-reasoning",
    messages=[{"role": "user", "content": "你好"}]
)
print(response.choices[0].message.content)
```

### JavaScript/TypeScript

```javascript
import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'http://localhost:3000/v1',
  apiKey: 'your-proxy-api-key',  // 或任意值
});

const response = await client.chat.completions.create({
  model: 'claude-4-5-opus-search',
  messages: [{ role: 'user', content: '搜索一下今天的新闻' }],
});
console.log(response.choices[0].message.content);
```

---

## ❓ 常见问题

### Q: 为什么返回 401？

1. 如果设置了 `PROXY_API_KEY`，检查请求是否包含正确的 API Key
2. 检查 `TEMPO_CLIENT_TOKEN` 是否正确复制，不要有多余空格

### Q: 为什么返回 429？

请求频率超过了速率限制。等待 `Retry-After` 头指示的秒数后重试。

### Q: 为什么返回 503？

请求队列已满。稍后重试，或增加 `MAX_QUEUE_SIZE` 配置。

### Q: Token 会过期吗？

Client Token 有效期很长（1-2年）。服务会自动用它刷新短期 Session Token。

### Q: 怎么开启思考/搜索？

在模型名后加后缀：
- `-reasoning` 深度思考
- `-search` 网络搜索
- `-reasoning-search` 两者都开

### Q: 支持多轮对话吗？

支持！在 `messages` 数组中传入历史消息即可。

### Q: 如何监控服务状态？

- 访问 `/health` 端点检查服务健康状态
- 访问 `/stats` 端点查看使用统计

---

## 📄 License

MIT
