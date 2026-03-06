# 用户数据 API

本文档描述用户相关的数据接口，包括用户信息、收益分析、AI 设置等功能。

## 目录

- [GET /user/context-data](#get-usercontext-data) - 获取用户上下文数据
- [GET /user/profit-analysis](#get-userprofit-analysis) - 获取收益分析
- [PUT /user/ai-status](#put-userai-status) - 更新 AI 配置
- [POST /user/api-token](#post-userapi-token) - 生成 API Token

---

## GET /user/context-data

获取用户投资相关的上下文数据，用于 AI 分析或前端展示。

### 请求

```http
GET /api/user/context-data
```

### 响应

**成功 (200 OK)**

```json
{
  "user": {
    "id": 1,
    "username": "admin",
    "availableCash": 50000,
    "isAiAgent": false
  },
  "holdings": [
    {
      "code": "000001",
      "name": "华夏成长混合",
      "shares": 10000,
      "costPrice": 1.5,
      "currentNav": 1.6,
      "profitRate": 6.67
    }
  ],
  "market": {
    "shanghai": {
      "index": 3050.23,
      "change": 0.52,
      "changePercent": 0.02
    },
    "shenzhen": {
      "index": 9850.45,
      "change": 1.23,
      "changePercent": 0.01
    }
  },
  "recentTransactions": [
    {
      "date": "2024-01-15",
      "type": "buy",
      "fundCode": "000001",
      "amount": 10000
    }
  ]
}
```

---

## GET /user/profit-analysis

获取用户的收益分析数据，包括历史收益曲线、日历热力图等。

### 请求

```http
GET /api/user/profit-analysis
```

### 响应

**成功 (200 OK)**

```json
{
  "summary": {
    "yesterdayProfit": 300,
    "yearProfit": 5000,
    "totalProfitRate": 8.5,
    "totalAssets": 155000
  },
  "history": [
    {
      "date": "2024-01-01",
      "totalAssets": 100000,
      "dayProfit": 0,
      "dayProfitRate": 0,
      "totalProfit": 0,
      "totalProfitRate": 0
    },
    {
      "date": "2024-01-02",
      "totalAssets": 100500,
      "dayProfit": 500,
      "dayProfitRate": 0.5,
      "totalProfit": 500,
      "totalProfitRate": 0.5
    }
  ],
  "calendar": {
    "2024-01-01": 0,
    "2024-01-02": 500,
    "2024-01-03": -200
  }
}
```

### 字段说明

**Summary 对象**

| 字段            | 类型   | 说明           |
| --------------- | ------ | -------------- |
| yesterdayProfit | number | 昨日盈亏       |
| yearProfit      | number | 本年盈亏       |
| totalProfitRate | number | 累计收益率 (%) |
| totalAssets     | number | 总资产         |

**History 数组项**

| 字段            | 类型   | 说明           |
| --------------- | ------ | -------------- |
| date            | string | 日期           |
| totalAssets     | number | 当日总资产     |
| dayProfit       | number | 当日盈亏       |
| dayProfitRate   | number | 当日收益率 (%) |
| totalProfit     | number | 累计盈亏       |
| totalProfitRate | number | 累计收益率 (%) |

**Calendar 对象**

键为日期字符串，值为当日盈亏金额。用于前端日历热力图展示。

---

## PUT /user/ai-status

更新用户的 AI 代理配置（支持部分更新）。

### 请求

```http
PUT /api/user/ai-status
Content-Type: application/json
```

### 请求体

所有字段都是可选的，可以只更新部分字段。

| 字段           | 类型           | 必填 | 说明             |
| -------------- | -------------- | ---- | ---------------- |
| isAiAgent      | boolean        | 否   | 是否启用 AI 代理 |
| aiSystemPrompt | string \| null | 否   | AI 系统提示词    |
| availableCash  | number         | 否   | 可用现金余额     |

```json
{
  "isAiAgent": true,
  "aiSystemPrompt": "你是一个专业的基金投资助手，帮助用户分析市场趋势...",
  "availableCash": 50000
}
```

### 响应

**成功 (200 OK)**

```json
{
  "message": "配置已更新",
  "config": {
    "isAiAgent": true,
    "aiSystemPrompt": "你是一个专业的基金投资助手...",
    "availableCash": "50000"
  }
}
```

---

## POST /user/api-token

生成用于 MCP 认证的 API Token（会覆盖旧 Token）。

### 请求

```http
POST /api/user/api-token
```

### 响应

**成功 (200 OK)**

```json
{
  "message": "API Token 已生成，请立即复制保存，它不会再次显示。",
  "token": "fat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
}
```

**重要**: Token 只在创建时显示一次，请妥善保存。Token 使用 SHA-256 哈希存储在数据库中。

---

_文档版本: 1.1.0_
_最后更新: 2026-03-06_
