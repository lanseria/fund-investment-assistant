# 市场行情 API

本文档描述市场行情相关的接口，包括市场数据获取和实时数据推送功能。

## 目录

- [GET /market](#get-market) - 获取市场数据
- [GET /sse/market](#get-ssemarket) - 市场数据 SSE 推送
- [GET /sse/holdings](#get-sseholdings) - 持仓数据 SSE 推送

---

## GET /market

获取当前市场概况数据，包括主要指数、板块涨跌等信息。

### 请求

```http
GET /api/market
```

### 响应

**成功 (200 OK)**

```json
{
  "indices": {
    "shanghai": {
      "name": "上证指数",
      "code": "000001",
      "price": 3050.23,
      "change": 15.68,
      "changePercent": 0.52,
      "volume": 35210000000,
      "turnover": 452300000000
    },
    "shenzhen": {
      "name": "深证成指",
      "code": "399001",
      "price": 9850.45,
      "change": 23.45,
      "changePercent": 0.24,
      "volume": 45210000000,
      "turnover": 523100000000
    },
    "chinext": {
      "name": "创业板指",
      "code": "399006",
      "price": 1850.12,
      "change": -5.23,
      "changePercent": -0.28,
      "volume": 15230000000,
      "turnover": 182500000000
    }
  },
  "sectors": {
    "rising": [
      { "name": "半导体", "changePercent": 3.52 },
      { "name": "新能源", "changePercent": 2.18 },
      { "name": "医药", "changePercent": 1.85 }
    ],
    "falling": [
      { "name": "银行", "changePercent": -0.85 },
      { "name": "地产", "changePercent": -0.62 },
      { "name": "煤炭", "changePercent": -0.45 }
    ]
  },
  "overview": {
    "upCount": 2850,
    "downCount": 1523,
    "flatCount": 127,
    "limitUp": 45,
    "limitDown": 8
  },
  "updatedAt": "2024-01-15T15:00:00Z"
}
```

### 字段说明

**Index 对象**

| 字段          | 类型   | 说明       |
| ------------- | ------ | ---------- |
| name          | string | 指数名称   |
| code          | string | 指数代码   |
| price         | number | 当前点位   |
| change        | number | 涨跌点数   |
| changePercent | number | 涨跌幅 (%) |
| volume        | number | 成交量     |
| turnover      | number | 成交额     |

---

## GET /sse/market

通过 Server-Sent Events (SSE) 实时推送市场数据。

### 请求

```http
GET /api/sse/market
Accept: text/event-stream
```

### 响应

SSE 数据流格式：

```
event: market
data: {"type": "index", "data": {"shanghai": {"price": 3050.23, "changePercent": 0.52}}}

event: market
data: {"type": "sector", "data": {"semiconductor": {"changePercent": 3.52}}}
```

### 事件类型

| 事件名      | 说明         |
| ----------- | ------------ |
| `index`     | 指数数据更新 |
| `sector`    | 板块数据更新 |
| `overview`  | 市场概况更新 |
| `heartbeat` | 心跳保活     |

---

## GET /sse/holdings

通过 Server-Sent Events (SSE) 实时推送持仓数据更新。

### 请求

```http
GET /api/sse/holdings
Accept: text/event-stream
```

### 响应

SSE 数据流格式：

```
event: holdings
data: {"type": "estimate", "code": "000001", "data": {"todayEstimateNav": 1.605, "estimateTime": "2024-01-15 15:00:00"}}

event: holdings
data: {"type": "nav", "code": "000001", "data": {"nav": 1.61, "navDate": "2024-01-15"}}

event: holdings
data: {"type": "sync_complete", "data": {"code": "000001", "count": 1}}
```

### 事件类型

| 事件名              | 说明             |
| ------------------- | ---------------- |
| `estimate`          | 实时估值更新     |
| `nav`               | 净值更新         |
| `sync_complete`     | 历史数据同步完成 |
| `strategy_complete` | 策略分析完成     |
| `heartbeat`         | 心跳保活         |

### 客户端使用示例

```javascript
const eventSource = new EventSource('/api/sse/holdings')

eventSource.addEventListener('holdings', (event) => {
  const data = JSON.parse(event.data)
  console.log('持仓更新:', data)
})

eventSource.onerror = (error) => {
  console.error('SSE 连接错误:', error)
}
```

---

_文档版本: 1.1.0_
_最后更新: 2026-03-06_
