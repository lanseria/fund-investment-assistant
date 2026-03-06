# 开发工具 API

本文档描述开发调试相关的接口，仅在开发环境中使用。

## 目录

- [GET /dev/init-admin](#get-devinit-admin) - 初始化管理员账户
- [POST /dev/process-transactions](#post-devprocess-transactions) - 手动触发交易处理
- [POST /dev/trigger-ai](#post-devtrigger-ai) - 手动触发 AI 任务
- [POST /dev/sync-sectors](#post-devsync-sectors) - 同步板块数据

---

## GET /dev/init-admin

初始化管理员账户（仅在开发环境可用）。

### 请求

```http
GET /api/dev/init-admin
```

### 响应

**成功 (200 OK)**

```json
{
  "message": "管理员账户初始化成功",
  "user": {
    "id": 1,
    "username": "admin",
    "role": "admin",
    "createdAt": "2024-01-15T10:00:00Z"
  }
}
```

**失败 (403 Forbidden)**

```json
{
  "statusCode": 403,
  "statusText": "该接口仅在开发环境可用"
}
```

---

## POST /dev/process-transactions

手动触发交易处理任务（测试用）。

### 请求

```http
POST /api/dev/process-transactions
Content-Type: application/json
```

### 请求体

| 字段   | 类型   | 必填 | 说明                           |
| ------ | ------ | ---- | ------------------------------ |
| date   | string | 否   | 处理指定日期的交易，默认为昨天 |
| userId | number | 否   | 只处理指定用户的交易           |

```json
{
  "date": "2024-01-15"
}
```

### 响应

**成功 (200 OK)**

```json
{
  "message": "交易处理完成",
  "summary": {
    "processed": 10,
    "confirmed": 8,
    "pending": 2,
    "failed": 0
  },
  "details": [
    {
      "id": 1,
      "fundCode": "000001",
      "type": "buy",
      "status": "confirmed",
      "confirmedNav": 1.5234,
      "confirmedShares": 6565.25
    }
  ]
}
```

---

## POST /dev/trigger-ai

手动触发 AI 分析任务。

### 请求

```http
POST /api/dev/trigger-ai
Content-Type: application/json
```

### 请求体

| 字段   | 类型   | 必填 | 说明                                                                 |
| ------ | ------ | ---- | -------------------------------------------------------------------- |
| type   | string | 是   | 任务类型: `market_analysis`, `portfolio_rebalance`, `trade_decision` |
| userId | number | 否   | 指定用户ID，不指定则处理所有启用 AI 的用户                           |
| params | object | 否   | 额外参数                                                             |

```json
{
  "type": "market_analysis",
  "userId": 2,
  "params": {
    "date": "2024-01-15"
  }
}
```

### 响应

**成功 (200 OK)**

```json
{
  "message": "AI 任务已触发",
  "taskId": "task_abc123",
  "type": "market_analysis",
  "targetUsers": [2],
  "estimatedTime": 5000
}
```

---

## POST /dev/sync-sectors

手动同步板块统计数据。

### 请求

```http
POST /api/dev/sync-sectors
```

### 响应

**成功 (200 OK)**

```json
{
  "message": "同步成功，更新了 15 个板块数据。"
}
```

**失败 (500 Internal Server Error)**

```json
{
  "statusCode": 500,
  "statusText": "错误信息"
}
```

---

_文档版本: 1.1.0_
_最后更新: 2026-03-06_
