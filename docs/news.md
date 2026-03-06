# 新闻分析 API

本文档描述新闻和 AI 分析相关的接口，包括新闻获取、AI 分析等功能。

## 目录

- [GET /news/:date](#get-newsdate) - 获取指定日期的新闻
- [POST /news/analyze](#post-newsanalyze) - 分析新闻内容
- [GET /ai/prompt-preview](#get-aiprompt-preview) - 获取 AI 提示词预览

---

## GET /news/:date

获取指定日期的新闻资讯和 AI 分析报告。

### 请求

```http
GET /api/news/2024-01-15
```

### 路径参数

| 参数 | 类型   | 说明              |
| ---- | ------ | ----------------- |
| date | string | 日期 (YYYY-MM-DD) |

### 响应

**成功 (200 OK)**

```json
{
  "date": "2024-01-15",
  "title": "2024年1月15日市场资讯",
  "content": "## 市场综述\n\n今日 A 股市场...",
  "aiAnalysis": "## AI 市场分析\n\n基于今日市场数据...",
  "items": [
    {
      "id": 1,
      "date": "2024-01-15",
      "title": "央行宣布降准0.5个百分点",
      "content": "中国人民银行决定...",
      "source": "新华社",
      "url": "https://...",
      "category": "宏观政策",
      "sentiment": "positive",
      "createdAt": "2024-01-15T09:00:00Z"
    },
    {
      "id": 2,
      "date": "2024-01-15",
      "title": "半导体板块集体大涨",
      "content": "受业绩超预期影响...",
      "source": "证券时报",
      "url": "https://...",
      "category": "行业动态",
      "sentiment": "positive",
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ]
}
```

### 字段说明

**News Item 对象**

| 字段      | 类型   | 说明                                        |
| --------- | ------ | ------------------------------------------- |
| id        | number | 新闻ID                                      |
| date      | string | 日期                                        |
| title     | string | 标题                                        |
| content   | string | 内容摘要                                    |
| source    | string | 来源                                        |
| url       | string | 原文链接                                    |
| category  | string | 分类                                        |
| sentiment | string | 情感倾向: `positive`, `neutral`, `negative` |
| createdAt | string | 创建时间                                    |

---

## POST /news/analyze

对指定新闻内容进行 AI 分析。

### 请求

```http
POST /api/news/analyze
Content-Type: application/json
```

### 请求体

| 字段     | 类型   | 必填 | 说明                 |
| -------- | ------ | ---- | -------------------- |
| content  | string | 是   | 新闻内容             |
| title    | string | 否   | 新闻标题             |
| holdings | array  | 否   | 当前持仓基金代码列表 |

```json
{
  "title": "央行宣布降准0.5个百分点",
  "content": "中国人民银行决定下调金融机构存款准备金率0.5个百分点...",
  "holdings": ["000001", "000002"]
}
```

### 响应

**成功 (200 OK)**

```json
{
  "analysis": {
    "summary": "这是一条重大货币政策利好...",
    "sentiment": "positive",
    "impact": "high",
    "affectedSectors": ["银行", "地产", "券商"],
    "suggestions": [
      {
        "fundCode": "000001",
        "action": "hold",
        "reason": "该基金重仓银行板块，将受益于降准政策"
      }
    ]
  },
  "keywords": ["降准", "货币政策", "流动性"],
  "riskLevel": "low"
}
```

---

## GET /ai/prompt-preview

获取 AI 分析的提示词预览。

### 请求

```http
GET /api/ai/prompt-preview
```

### 查询参数

| 参数 | 类型   | 必填 | 说明                                                                       |
| ---- | ------ | ---- | -------------------------------------------------------------------------- |
| type | string | 否   | 提示词类型: `market` (市场分析), `portfolio` (持仓分析), `news` (新闻分析) |

### 响应

**成功 (200 OK)**

```json
{
  "type": "portfolio",
  "preview": "你是一位专业的基金投资顾问...",
  "variables": [
    {
      "name": "holdings",
      "description": "当前持仓数据",
      "type": "array"
    },
    {
      "name": "market",
      "description": "市场行情数据",
      "type": "object"
    }
  ]
}
```

---

_文档版本: 1.1.0_
_最后更新: 2026-03-06_
