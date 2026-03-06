# 字典 API

本文档描述字典数据相关的公共接口。

## 目录

- [GET /dicts/all](#get-dictsall) - 获取所有字典数据

---

## GET /dicts/all

获取系统中所有字典类型的数据。

### 请求

```http
GET /api/dicts/all
```

### 响应

**成功 (200 OK)**

```json
{
  "fund_types": {
    "code": "fund_types",
    "name": "基金类型",
    "items": [
      { "value": "open", "label": "开放式基金", "sort": 1 },
      { "value": "qdii_lof", "label": "QDII-LOF", "sort": 2 },
      { "value": "etf", "label": "ETF", "sort": 3 }
    ]
  },
  "sectors": {
    "code": "sectors",
    "name": "行业板块",
    "items": [
      { "value": "technology", "label": "科技", "sort": 1 },
      { "value": "finance", "label": "金融", "sort": 2 },
      { "value": "healthcare", "label": "医药", "sort": 3 },
      { "value": "consumption", "label": "消费", "sort": 4 }
    ]
  },
  "transaction_types": {
    "code": "transaction_types",
    "name": "交易类型",
    "items": [
      { "value": "buy", "label": "买入", "sort": 1 },
      { "value": "sell", "label": "卖出", "sort": 2 },
      { "value": "convert_in", "label": "转换入", "sort": 3 },
      { "value": "convert_out", "label": "转换出", "sort": 4 }
    ]
  },
  "order_status": {
    "code": "order_status",
    "name": "订单状态",
    "items": [
      { "value": "pending", "label": "待确认", "sort": 1 },
      { "value": "confirmed", "label": "已确认", "sort": 2 },
      { "value": "cancelled", "label": "已取消", "sort": 3 },
      { "value": "failed", "label": "失败", "sort": 4 }
    ]
  }
}
```

### 字典类型说明

| 字典编码          | 名称     | 用途         |
| ----------------- | -------- | ------------ |
| fund_types        | 基金类型 | 基金分类     |
| sectors           | 行业板块 | 行业分类     |
| transaction_types | 交易类型 | 交易记录类型 |
| order_status      | 订单状态 | 交易订单状态 |

### 字典项结构

| 字段  | 类型   | 说明     |
| ----- | ------ | -------- |
| value | string | 字典值   |
| label | string | 显示标签 |
| sort  | number | 排序顺序 |

---

_文档版本: 1.1.0_
_最后更新: 2026-03-06_
