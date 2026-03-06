# 持仓管理 API

本文档描述基金持仓相关的接口，包括持仓的查询、创建、更新、删除，以及历史数据同步、策略执行等功能。

## 目录

### 持仓基础操作

- [GET /fund/holdings](#get-fundholdings) - 获取用户所有持仓
- [POST /fund/holdings](#post-fundholdings) - 添加新持仓
- [PUT /fund/holdings/:code](#put-fundholdingscode) - 更新持仓信息
- [DELETE /fund/holdings/:code](#delete-fundholdingscode) - 删除持仓

### 持仓明细

- [GET /fund/holdings/:code/detail](#get-fundholdingscodedetail) - 获取持仓详细信息
- [GET /fund/holdings/:code/history](#get-fundholdingscodehistory) - 获取持仓历史净值
- [GET /fund/holdings/:code/performance](#get-fundholdingscodeperformance) - 获取持仓业绩分析
- [GET /fund/holdings/:code/sector-signals](#get-fundholdingscodesector-signals) - 获取板块信号历史

### 持仓操作

- [POST /fund/holdings/:code/sync-history](#post-fundholdingscodesync-history) - 同步历史净值数据
- [POST /fund/holdings/:code/run-strategies](#post-fundholdingscoderun-strategies) - 执行策略分析
- [POST /fund/holdings/:code/clear-position](#post-fundholdingscodeclear-position) - 清仓持仓

### 批量操作

- [POST /fund/utils/import](#post-fundutilsimport) - 批量导入持仓
- [GET /fund/utils/export](#get-fundutilsexport) - 导出持仓数据
- [POST /fund/utils/update-batch](#post-fundutilsupdate-batch) - 批量更新持仓
- [POST /fund/utils/refresh-estimates](#post-fundutilsrefresh-estimates) - 刷新实时估值

### 基金转换

- [POST /fund/convert](#post-fundconvert) - 基金转换

---

## GET /fund/holdings

获取当前用户的所有持仓信息，包括持仓汇总数据和明细列表。

### 请求

```http
GET /api/fund/holdings
```

### 响应

**成功 (200 OK)**

```json
{
  "summary": {
    "totalCost": 100000,
    "totalMarketValue": 105000,
    "totalProfit": 5000,
    "totalProfitRate": 5,
    "dayProfit": 300,
    "dayProfitRate": 0.29,
    "availableCash": 50000,
    "totalAssets": 155000
  },
  "holdings": [
    {
      "id": 1,
      "code": "000001",
      "name": "华夏成长混合",
      "shares": 10000,
      "costPrice": 1.5,
      "totalCost": 15000,
      "currentNav": 1.6,
      "marketValue": 16000,
      "profit": 1000,
      "profitRate": 6.67,
      "dayGrowth": 0.5,
      "todayEstimateNav": 1.605,
      "yesterdayNav": 1.6,
      "fundType": "open",
      "sector": "科技"
    }
  ]
}
```

### 字段说明

**Summary 对象**

| 字段             | 类型   | 说明           |
| ---------------- | ------ | -------------- |
| totalCost        | number | 总持仓成本     |
| totalMarketValue | number | 总持仓市值     |
| totalProfit      | number | 累计盈亏       |
| totalProfitRate  | number | 累计收益率 (%) |
| dayProfit        | number | 当日盈亏       |
| dayProfitRate    | number | 当日收益率 (%) |
| availableCash    | number | 可用现金       |
| totalAssets      | number | 总资产         |

**Holding 对象**

| 字段             | 类型   | 说明                     |
| ---------------- | ------ | ------------------------ |
| id               | number | 持仓ID                   |
| code             | string | 基金代码                 |
| name             | string | 基金名称                 |
| shares           | number | 持有份额                 |
| costPrice        | number | 成本价                   |
| totalCost        | number | 总成本                   |
| currentNav       | number | 当前净值                 |
| marketValue      | number | 市值                     |
| profit           | number | 盈亏金额                 |
| profitRate       | number | 盈亏率 (%)               |
| dayGrowth        | number | 日涨幅 (%)               |
| todayEstimateNav | number | 今日估算净值             |
| yesterdayNav     | number | 昨日净值                 |
| fundType         | string | 基金类型 (open/qdii_lof) |
| sector           | string | 行业板块                 |

---

## POST /fund/holdings

添加新的基金持仓。

### 请求

```http
POST /api/fund/holdings
Content-Type: application/json
```

### 请求体

| 字段      | 类型   | 必填 | 说明                                               |
| --------- | ------ | ---- | -------------------------------------------------- |
| code      | string | 是   | 基金代码 (6位)                                     |
| shares    | number | 条件 | 持有份额，与 costPrice 同时填写或同时留空          |
| costPrice | number | 条件 | 成本价，与 shares 同时填写或同时留空               |
| fundType  | string | 是   | 基金类型: `open` (开放式) 或 `qdii_lof` (QDII-LOF) |

```json
{
  "code": "000001",
  "shares": 10000,
  "costPrice": 1.5,
  "fundType": "open"
}
```

**仅关注（不持有）**

```json
{
  "code": "000002",
  "fundType": "open"
}
```

### 响应

**成功 (200 OK)**

```json
{
  "id": 1,
  "userId": 1,
  "code": "000001",
  "shares": "10000",
  "costPrice": "1.5",
  "fundType": "open",
  "createdAt": "2024-01-01T00:00:00Z"
}
```

**失败 (400 Bad Request)**

```json
{
  "statusCode": 400,
  "statusText": "输入数据无效。"
}
```

**失败 (409 Conflict)**

```json
{
  "statusCode": 409,
  "statusText": "该基金的持仓已存在。"
}
```

---

## PUT /fund/holdings/:code

更新指定基金的持仓信息。

### 请求

```http
PUT /api/fund/holdings/000001
Content-Type: application/json
```

### 路径参数

| 参数 | 类型   | 说明     |
| ---- | ------ | -------- |
| code | string | 基金代码 |

### 请求体

| 字段      | 类型   | 必填 | 说明     |
| --------- | ------ | ---- | -------- |
| shares    | number | 否   | 持有份额 |
| costPrice | number | 否   | 成本价   |

```json
{
  "shares": 15000,
  "costPrice": 1.45
}
```

### 响应

**成功 (200 OK)**

```json
{
  "message": "持仓更新成功",
  "holding": {
    "id": 1,
    "code": "000001",
    "shares": "15000",
    "costPrice": "1.45"
  }
}
```

---

## DELETE /fund/holdings/:code

删除指定基金的持仓。

### 请求

```http
DELETE /api/fund/holdings/000001
```

### 路径参数

| 参数 | 类型   | 说明     |
| ---- | ------ | -------- |
| code | string | 基金代码 |

### 响应

**成功 (200 OK)**

```json
{
  "message": "持仓删除成功"
}
```

**失败 (404 Not Found)**

```json
{
  "statusCode": 404,
  "statusText": "持仓不存在"
}
```

---

## GET /fund/holdings/:code/history

获取指定基金的历史净值数据。

### 请求

```http
GET /api/fund/holdings/000001/history
```

### 路径参数

| 参数 | 类型   | 说明     |
| ---- | ------ | -------- |
| code | string | 基金代码 |

### 查询参数

| 参数      | 类型   | 必填 | 说明                  |
| --------- | ------ | ---- | --------------------- |
| startDate | string | 否   | 开始日期 (YYYY-MM-DD) |
| endDate   | string | 否   | 结束日期 (YYYY-MM-DD) |

### 响应

**成功 (200 OK)**

```json
{
  "code": "000001",
  "name": "华夏成长混合",
  "history": [
    {
      "date": "2024-01-01",
      "nav": 1.5234,
      "accNav": 2.1234,
      "dailyGrowth": 0.52
    }
  ]
}
```

---

## GET /fund/holdings/:code/performance

获取指定基金的业绩分析数据。

### 请求

```http
GET /api/fund/holdings/000001/performance
```

### 路径参数

| 参数 | 类型   | 说明     |
| ---- | ------ | -------- |
| code | string | 基金代码 |

### 响应

**成功 (200 OK)**

```json
{
  "code": "000001",
  "name": "华夏成长混合",
  "performance": {
    "totalReturn": 15.5,
    "annualizedReturn": 8.2,
    "volatility": 12.3,
    "sharpeRatio": 0.67,
    "maxDrawdown": -8.5
  },
  "periods": {
    "1m": 2.1,
    "3m": 5.3,
    "6m": 7.8,
    "1y": 15.5,
    "ytd": 8.2
  }
}
```

---

## POST /fund/holdings/:code/sync-history

手动同步指定基金的历史净值数据。

### 请求

```http
POST /api/fund/holdings/000001/sync-history
```

### 路径参数

| 参数 | 类型   | 说明     |
| ---- | ------ | -------- |
| code | string | 基金代码 |

### 响应

**成功 (200 OK)**

```json
{
  "message": "同步完成！新增 30 条历史记录。",
  "count": 30
}
```

**失败 (404 Not Found)**

```json
{
  "statusCode": 404,
  "statusText": "基金持仓不存在"
}
```

---

## POST /fund/holdings/:code/run-strategies

对指定基金执行策略分析。

### 请求

```http
POST /api/fund/holdings/000001/run-strategies
```

### 路径参数

| 参数 | 类型   | 说明     |
| ---- | ------ | -------- |
| code | string | 基金代码 |

### 响应

**成功 (200 OK)**

```json
{
  "message": "策略分析完成",
  "results": [
    {
      "strategy": "RSI",
      "signal": "buy",
      "value": 28.5,
      "description": "RSI超卖，建议买入"
    },
    {
      "strategy": "MACD",
      "signal": "hold",
      "value": 0,
      "description": "MACD平稳，建议持有"
    }
  ]
}
```

---

## POST /fund/holdings/:code/clear-position

清仓指定基金的持仓。

### 请求

```http
POST /api/fund/holdings/000001/clear-position
```

### 路径参数

| 参数 | 类型   | 说明     |
| ---- | ------ | -------- |
| code | string | 基金代码 |

### 请求体

| 字段   | 类型   | 必填 | 说明     |
| ------ | ------ | ---- | -------- |
| reason | string | 否   | 清仓原因 |

```json
{
  "reason": "止损清仓"
}
```

### 响应

**成功 (200 OK)**

```json
{
  "message": "持仓已清仓",
  "code": "000001",
  "shares": 0,
  "realizedProfit": 1500.5
}
```

---

## GET /fund/holdings/:code/detail

获取指定基金的详细信息，包括基金基础信息和用户持仓数据。

### 请求

```http
GET /api/fund/holdings/000001/detail
```

### 路径参数

| 参数 | 类型   | 说明     |
| ---- | ------ | -------- |
| code | string | 基金代码 |

### 响应

**成功 (200 OK)**

```json
{
  "code": "000001",
  "name": "华夏成长混合",
  "sector": "科技",
  "fundType": "open",
  "yesterdayNav": 1.5234,
  "todayEstimateNav": 1.5312,
  "percentageChange": 0.51,
  "todayEstimateUpdateTime": "2024-01-15T15:00:00Z",
  "shares": 10000,
  "costPrice": 1.5,
  "holdingAmount": 15312,
  "holdingProfitAmount": 312,
  "holdingProfitRate": 2.08
}
```

**失败 (404 Not Found)**

```json
{
  "statusCode": 404,
  "statusText": "未找到该基金"
}
```

---

## GET /fund/holdings/:code/sector-signals

获取指定基金所属板块的历史量化决策信号。

### 请求

```http
GET /api/fund/holdings/000001/sector-signals
```

### 路径参数

| 参数 | 类型   | 说明     |
| ---- | ------ | -------- |
| code | string | 基金代码 |

### 响应

**成功 (200 OK)**

```json
[
  {
    "id": 1,
    "strategyName": "sector_quant",
    "signal": "买入",
    "reason": "[板块决策: 左侧建仓] 状态: 冰点筑底\n换手率: 0.85% (日差: +0.12%)\n成交额占比: 2.34%\n涨跌幅: -0.52%",
    "latestDate": "2024-01-10",
    "latestClose": 1.5123,
    "metrics": {
      "turnoverRate": 0.85,
      "volumeRatio": 2.34,
      "changeRate": -0.52,
      "diffTurnoverRate": 0.12
    }
  }
]
```

**说明**：如果基金未绑定板块，则返回空数组 `[]`。

---

_文档版本: 1.1.0_
_最后更新: 2026-03-06_
