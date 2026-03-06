# 交易记录 API

本文档描述基金交易记录相关的接口，包括交易记录的创建、查询、删除，以及每日交易汇总等功能。

## 目录

- [POST /fund/transactions](#post-fundtransactions) - 创建交易记录
- [DELETE /fund/transactions/:id](#delete-fundtransactionsid) - 删除交易记录
- [GET /transactions/daily](#get-transactionsdaily) - 获取每日交易汇总
- [DELETE /transactions/daily](#delete-transactionsdaily) - 删除每日交易记录

---

## POST /fund/transactions

创建新的交易记录（买入/卖出）。

### 请求

```http
POST /api/fund/transactions
Content-Type: application/json
```

### 请求体

| 字段     | 类型   | 必填 | 说明                                    |
| -------- | ------ | ---- | --------------------------------------- |
| fundCode | string | 是   | 基金代码                                |
| type     | string | 是   | 交易类型: `buy` (买入) 或 `sell` (卖出) |
| amount   | number | 条件 | 买入金额，买入时必填                    |
| shares   | number | 条件 | 卖出份额，卖出时必填                    |
| date     | string | 是   | 交易日期 (YYYY-MM-DD)                   |

**买入示例:**

```json
{
  "fundCode": "000001",
  "type": "buy",
  "amount": 10000,
  "date": "2024-01-15"
}
```

**卖出示例:**

```json
{
  "fundCode": "000001",
  "type": "sell",
  "shares": 5000,
  "date": "2024-02-15"
}
```

### 响应

**成功 (200 OK)**

```json
{
  "statusText": "交易请求已记录",
  "record": {
    "id": 1,
    "userId": 1,
    "fundCode": "000001",
    "type": "buy",
    "status": "pending",
    "orderAmount": "10000",
    "orderShares": null,
    "orderDate": "2024-01-15",
    "createdAt": "2024-01-15T10:00:00Z"
  }
}
```

**失败 (400 Bad Request)**

```json
{
  "statusCode": 400,
  "statusText": "买入需提供金额，卖出需提供份额"
}
```

---

## DELETE /fund/transactions/:id

删除指定的交易记录。

### 请求

```http
DELETE /api/fund/transactions/1
```

### 路径参数

| 参数 | 类型   | 说明       |
| ---- | ------ | ---------- |
| id   | number | 交易记录ID |

### 响应

**成功 (200 OK)**

```json
{
  "message": "交易记录已删除"
}
```

**失败 (404 Not Found)**

```json
{
  "statusCode": 404,
  "statusText": "交易记录不存在"
}
```

---

## GET /transactions/daily

获取指定日期的交易记录汇总。

### 请求

```http
GET /api/transactions/daily?date=2024-01-15
```

### 查询参数

| 参数 | 类型   | 必填 | 说明              |
| ---- | ------ | ---- | ----------------- |
| date | string | 是   | 日期 (YYYY-MM-DD) |

### 响应

**成功 (200 OK)**

```json
{
  "date": "2024-01-15",
  "summary": {
    "totalBuyAmount": 50000,
    "totalSellShares": 0,
    "totalBuyCount": 3,
    "totalSellCount": 0
  },
  "transactions": [
    {
      "id": 1,
      "fundCode": "000001",
      "fundName": "华夏成长混合",
      "type": "buy",
      "status": "confirmed",
      "orderAmount": "10000",
      "confirmedAmount": "9950",
      "confirmedShares": "6500",
      "orderDate": "2024-01-15"
    }
  ]
}
```

---

## DELETE /transactions/daily

删除指定日期的所有交易记录。

### 请求

```http
DELETE /api/transactions/daily?date=2024-01-15
```

### 查询参数

| 参数 | 类型   | 必填 | 说明              |
| ---- | ------ | ---- | ----------------- |
| date | string | 是   | 日期 (YYYY-MM-DD) |

### 响应

**成功 (200 OK)**

```json
{
  "message": "已删除 3 条交易记录",
  "deletedCount": 3
}
```

---

_文档版本: 1.1.0_
_最后更新: 2026-03-06_
