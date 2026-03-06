# AI 自动交易代理 API

本文档描述 AI 自动交易代理相关的接口。

## 目录

- [GET /ai/prompt-preview](#get-aiprompt-preview) - 获取 AI Prompt 预览

---

## GET /ai/prompt-preview

获取 AI 交易代理的 Prompt 预览内容。

### 权限说明

- 管理员可以查看任何用户的 Prompt
- 普通用户只能查看自己的 Prompt

### 请求

```http
GET /api/ai/prompt-preview?userId=1
```

### 查询参数

| 参数   | 类型   | 必填 | 说明        |
| ------ | ------ | ---- | ----------- |
| userId | number | 是   | 目标用户 ID |

### 响应

**成功 (200 OK)**

```json
{
  "prompt": "完整的 AI Prompt 内容..."
}
```

**失败 (400 Bad Request)**

```json
{
  "statusCode": 400,
  "statusText": "Missing userId"
}
```

**失败 (403 Forbidden)**

```json
{
  "statusCode": 403,
  "statusText": "Forbidden"
}
```

**失败 (404 Not Found)**

```json
{
  "statusCode": 404,
  "statusText": "User not found"
}
```

---

## AI 代理定时任务

AI 自动交易代理通过定时任务执行，相关配置如下：

### Cron 表达式

默认: `30 14 * * 1-5` (每个工作日下午 14:30 执行)

可通过环境变量 `CRON_AI_AUTO_TRADE` 自定义。

### 执行流程

1. 获取用户持仓和市场数据
2. 构建 AI 分析上下文
3. 调用 AI 模型生成交易决策
4. 执行交易操作（如果启用）
5. 记录执行日志

### 相关开发工具接口

参见 [开发工具 API](./dev.md)：

- `POST /api/dev/trigger-ai` - 手动触发 AI 自动交易
- `GET /api/admin/ai-logs` - 查看 AI 执行日志（管理员）

---

_文档版本: 1.1.0_
_最后更新: 2026-03-06_
