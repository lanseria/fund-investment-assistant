# 用户数据 API

本文档描述用户相关的数据接口，包括用户信息、收益分析、排行榜、AI 设置等功能。

## 目录

- [GET /user/context-data](#get-usercontext-data) - 获取用户上下文数据
- [GET /user/profit-analysis](#get-userprofit-analysis) - 获取收益分析
- [PUT /user/ai-status](#put-userai-status) - 更新 AI 代理状态
- [POST /user/api-token](#post-userapi-token) - 创建 API Token
- [GET /leaderboard](#get-leaderboard) - 获取收益排行榜
- [GET /leaderboard/:userId](#get-leaderboarduserid) - 获取指定用户排名

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

| 字段 | 类型 | 说明 |
|------|------|------|
| yesterdayProfit | number | 昨日盈亏 |
| yearProfit | number | 本年盈亏 |
| totalProfitRate | number | 累计收益率 (%) |
| totalAssets | number | 总资产 |

**History 数组项**

| 字段 | 类型 | 说明 |
|------|------|------|
| date | string | 日期 |
| totalAssets | number | 当日总资产 |
| dayProfit | number | 当日盈亏 |
| dayProfitRate | number | 当日收益率 (%) |
| totalProfit | number | 累计盈亏 |
| totalProfitRate | number | 累计收益率 (%) |

**Calendar 对象**

键为日期字符串，值为当日盈亏金额。用于前端日历热力图展示。

---

## PUT /user/ai-status

更新用户的 AI 代理状态。

### 请求

```http
PUT /api/user/ai-status
Content-Type: application/json
```

### 请求体

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| isAiAgent | boolean | 是 | 是否启用 AI 代理 |
| aiSystemPrompt | string | 条件 | AI 系统提示词，启用时必填 |

```json
{
  "isAiAgent": true,
  "aiSystemPrompt": "你是一个专业的基金投资助手，帮助用户分析市场趋势..."
}
```

### 响应

**成功 (200 OK)**

```json
{
  "message": "AI 状态已更新",
  "isAiAgent": true,
  "aiSystemPrompt": "你是一个专业的基金投资助手..."
}
```

---

## POST /user/api-token

创建 API Token，用于第三方应用访问。

### 请求

```http
POST /api/user/api-token
Content-Type: application/json
```

### 请求体

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 是 | Token 名称 |
| expiresIn | number | 否 | 过期天数，默认 30 天 |

```json
{
  "name": "Trading Bot",
  "expiresIn": 90
}
```

### 响应

**成功 (200 OK)**

```json
{
  "message": "API Token 创建成功",
  "token": {
    "id": 1,
    "name": "Trading Bot",
    "token": "pat_xxx...",
    "expiresAt": "2024-04-15T00:00:00Z",
    "createdAt": "2024-01-15T00:00:00Z"
  }
}
```

**重要**: Token 只在创建时显示一次，请妥善保存。

---

## GET /leaderboard

获取收益排行榜。

### 请求

```http
GET /api/leaderboard
```

### 查询参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| type | string | 否 | 排行类型: `total` (总收益, 默认), `monthly` (月收益), `yearly` (年收益) |
| limit | number | 否 | 返回数量，默认 10 |

### 响应

**成功 (200 OK)**

```json
{
  "type": "total",
  "updatedAt": "2024-01-15T10:00:00Z",
  "rankings": [
    {
      "rank": 1,
      "userId": 1,
      "username": "admin",
      "totalProfit": 50000,
      "totalProfitRate": 25.5,
      "totalAssets": 245000
    },
    {
      "rank": 2,
      "userId": 2,
      "username": "user2",
      "totalProfit": 30000,
      "totalProfitRate": 15.2,
      "totalAssets": 230000
    }
  ]
}
```

---

## GET /leaderboard/:userId

获取指定用户在排行榜中的排名详情。

### 请求

```http
GET /api/leaderboard/1
```

### 路径参数

| 参数 | 类型 | 说明 |
|------|------|------|
| userId | number | 用户ID |

### 查询参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| type | string | 否 | 排行类型，同 `/leaderboard` |

### 响应

**成功 (200 OK)**

```json
{
  "rank": 1,
  "userId": 1,
  "username": "admin",
  "totalProfit": 50000,
  "totalProfitRate": 25.5,
  "totalAssets": 245000,
  "totalUsers": 100,
  "percentile": 1
}
```

---

*文档版本: 1.0.0*
