# Webhook API

本文档描述系统对外提供的 Webhook 接口。

## 目录

- [POST /webhooks/trend-radar](#post-webhookstrend-radar) - 趋势雷达 Webhook

---

## POST /webhooks/trend-radar

接收外部趋势雷达系统的推送数据。

### 请求

```http
POST /api/webhooks/trend-radar
Content-Type: application/json
X-Webhook-Secret: your-webhook-secret
```

### 请求头

| 字段             | 必填 | 说明                           |
| ---------------- | ---- | ------------------------------ |
| X-Webhook-Secret | 是   | Webhook 密钥，用于验证请求来源 |

### 请求体

```json
{
  "event": "trend_alert",
  "timestamp": "2024-01-15T10:00:00Z",
  "data": {
    "symbol": "000001",
    "name": "华夏成长混合",
    "alertType": "breakout",
    "direction": "up",
    "currentPrice": 1.65,
    "targetPrice": 1.60,
    "volume": 1500000,
    "message": "突破阻力位，建议关注"
  }
}
```

### 事件类型

| 事件名       | 说明       |
| ------------ | ---------- |
| trend_alert  | 趋势告警   |
| breakout     | 突破信号   |
| reversal     | 反转信号   |
| volume_spike | 成交量异常 |

### 响应

**成功 (200 OK)**

```json
{
  "message": "Webhook 接收成功",
  "processed": true,
  "id": "evt_abc123"
}
```

**失败 (401 Unauthorized)**

```json
{
  "statusCode": 401,
  "statusText": "无效的 Webhook 密钥"
}
```

---

_文档版本: 1.1.0_
_最后更新: 2026-03-06_
