# 基金转换 API

本文档描述基金转换相关的接口。

## 目录

- [POST /fund/convert](#post-fundconvert) - 基金转换

---

## POST /fund/convert

执行基金转换操作（将持有的某只基金转换为另一只基金）。

### 请求

```http
POST /api/fund/convert
Content-Type: application/json
```

### 请求体

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| fromCode | string | 是 | 转出基金代码 |
| toCode | string | 是 | 转入基金代码 |
| shares | number | 条件 | 转出份额，与 `amount` 二选一 |
| amount | number | 条件 | 转出金额，与 `shares` 二选一 |
| date | string | 是 | 转换日期 (YYYY-MM-DD) |

### 转换方式

**按份额转换:**

```json
{
  "fromCode": "000001",
  "toCode": "000002",
  "shares": 5000,
  "date": "2024-01-15"
}
```

**按金额转换:**

```json
{
  "fromCode": "000001",
  "toCode": "000002",
  "amount": 8000,
  "date": "2024-01-15"
}
```

### 响应

**成功 (200 OK)**

```json
{
  "message": "基金转换请求已提交",
  "conversion": {
    "id": 1,
    "fromCode": "000001",
    "fromName": "华夏成长混合",
    "toCode": "000002",
    "toName": "易方达蓝筹精选",
    "type": "convert_out",
    "status": "pending",
    "orderShares": "5000",
    "orderDate": "2024-01-15",
    "createdAt": "2024-01-15T10:00:00Z"
  },
  "pairedConversion": {
    "id": 2,
    "type": "convert_in",
    "status": "pending",
    "linkedId": 1
  }
}
```

**失败 (400 Bad Request)**

```json
{
  "statusCode": 400,
  "statusText": "转出基金不存在"
}
```

**失败 (400 Bad Request)**

```json
{
  "statusCode": 400,
  "statusText": "持有份额不足，当前持有 3000 份"
}
```

**失败 (400 Bad Request)**

```json
{
  "statusCode": 400,
  "statusText": "两只基金不支持互相转换"
}
```

---

*文档版本: 1.0.0*
