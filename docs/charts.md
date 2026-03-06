# 策略图表 API

本文档描述技术分析图表相关的接口，包括 RSI、MACD、布林带等技术指标。

## 目录

- [GET /charts/rsi/:code](#get-chartsrsicode) - 获取 RSI 指标数据
- [GET /charts/macd/:code](#get-chartsmacdcode) - 获取 MACD 指标数据
- [GET /charts/bollinger/:code](#get-chartsbollingercode) - 获取布林带数据
- [GET /charts/ma/:code](#get-chartsmacode) - 获取移动平均线数据

---

## GET /charts/rsi/:code

获取指定基金的 RSI (相对强弱指标) 数据。

### 请求

```http
GET /api/charts/rsi/000001?period=14&startDate=2024-01-01&endDate=2024-01-15
```

### 路径参数

| 参数 | 类型   | 说明     |
| ---- | ------ | -------- |
| code | string | 基金代码 |

### 查询参数

| 参数      | 类型   | 必填 | 说明                  |
| --------- | ------ | ---- | --------------------- |
| period    | number | 否   | RSI 计算周期，默认 14 |
| startDate | string | 否   | 开始日期 (YYYY-MM-DD) |
| endDate   | string | 否   | 结束日期 (YYYY-MM-DD) |

### 响应

**成功 (200 OK)**

```json
{
  "code": "000001",
  "name": "华夏成长混合",
  "indicator": "RSI",
  "period": 14,
  "data": [
    {
      "date": "2024-01-01",
      "rsi": 45.2,
      "signal": null
    },
    {
      "date": "2024-01-02",
      "rsi": 52.3,
      "signal": null
    },
    {
      "date": "2024-01-03",
      "rsi": 68.5,
      "signal": null
    },
    {
      "date": "2024-01-04",
      "rsi": 72.1,
      "signal": "overbought"
    },
    {
      "date": "2024-01-05",
      "rsi": 65.3,
      "signal": null
    }
  ],
  "summary": {
    "current": 65.3,
    "min": 45.2,
    "max": 72.1,
    "avg": 60.68,
    "overboughtCount": 1,
    "oversoldCount": 0
  },
  "thresholds": {
    "overbought": 70,
    "oversold": 30
  }
}
```

### 字段说明

**Signal 值**

| 值           | 说明                |
| ------------ | ------------------- |
| `null`       | 无信号              |
| `overbought` | 超买信号 (RSI > 70) |
| `oversold`   | 超卖信号 (RSI < 30) |

---

## GET /charts/macd/:code

获取指定基金的 MACD (指数平滑异同移动平均线) 数据。

### 请求

```http
GET /api/charts/macd/000001?fast=12&slow=26&signal=9
```

### 路径参数

| 参数 | 类型   | 说明     |
| ---- | ------ | -------- |
| code | string | 基金代码 |

### 查询参数

| 参数      | 类型   | 必填 | 说明                     |
| --------- | ------ | ---- | ------------------------ |
| fast      | number | 否   | 快线周期 (EMA)，默认 12  |
| slow      | number | 否   | 慢线周期 (EMA)，默认 26  |
| signal    | number | 否   | 信号线周期 (EMA)，默认 9 |
| startDate | string | 否   | 开始日期                 |
| endDate   | string | 否   | 结束日期                 |

### 响应

**成功 (200 OK)**

```json
{
  "code": "000001",
  "name": "华夏成长混合",
  "indicator": "MACD",
  "parameters": {
    "fast": 12,
    "slow": 26,
    "signal": 9
  },
  "data": [
    {
      "date": "2024-01-01",
      "macd": 0.12,
      "signal": 0.08,
      "histogram": 0.04,
      "signal_type": null
    },
    {
      "date": "2024-01-02",
      "macd": 0.18,
      "signal": 0.12,
      "histogram": 0.06,
      "signal_type": null
    },
    {
      "date": "2024-01-03",
      "macd": 0.15,
      "signal": 0.14,
      "histogram": 0.01,
      "signal_type": null
    },
    {
      "date": "2024-01-04",
      "macd": 0.10,
      "signal": 0.13,
      "histogram": -0.03,
      "signal_type": "death_cross"
    },
    {
      "date": "2024-01-05",
      "macd": 0.05,
      "signal": 0.11,
      "histogram": -0.06,
      "signal_type": null
    }
  ],
  "summary": {
    "goldenCrossCount": 2,
    "deathCrossCount": 1,
    "currentHistogram": -0.06,
    "trend": "bearish"
  }
}
```

### 字段说明

**MACD Data 对象**

| 字段        | 类型   | 说明                                                          |
| ----------- | ------ | ------------------------------------------------------------- |
| date        | string | 日期                                                          |
| macd        | number | MACD 线值 (DIF)                                               |
| signal      | number | 信号线值 (DEA)                                                |
| histogram   | number | 柱状图值 (MACD - Signal)                                      |
| signal_type | string | 信号类型: `golden_cross` (金叉), `death_cross` (死叉), `null` |

---

_文档版本: 1.1.0_
_最后更新: 2026-03-06_
