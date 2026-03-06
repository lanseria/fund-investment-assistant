# 持仓工具 API

本文档描述持仓相关的工具接口，包括导入导出、批量更新、实时估值刷新等功能。

## 目录

- [POST /fund/utils/import](#post-fundutilsimport) - 批量导入持仓
- [GET /fund/utils/export](#get-fundutilsexport) - 导出持仓数据
- [POST /fund/utils/update-batch](#post-fundutilsupdate-batch) - 批量更新持仓
- [POST /fund/utils/refresh-estimates](#post-fundutilsrefresh-estimates) - 刷新实时估值

---

## POST /fund/utils/import

批量导入持仓数据，支持 Excel/CSV 格式。

### 请求

```http
POST /api/fund/utils/import
Content-Type: multipart/form-data
```

### 请求参数

| 参数       | 类型    | 必填 | 说明                         |
| ---------- | ------- | ---- | ---------------------------- |
| file       | File    | 是   | 导入文件 (Excel 或 CSV)      |
| skipHeader | boolean | 否   | 是否跳过表头，默认 true      |
| overwrite  | boolean | 否   | 是否覆盖已有持仓，默认 false |

### 文件格式要求

**Excel/CSV 列定义:**

| 列名      | 类型   | 必填 | 说明                     |
| --------- | ------ | ---- | ------------------------ |
| code      | string | 是   | 基金代码                 |
| name      | string | 否   | 基金名称                 |
| shares    | number | 条件 | 持有份额                 |
| costPrice | number | 条件 | 成本价                   |
| fundType  | string | 是   | 基金类型 (open/qdii_lof) |

### 响应

**成功 (200 OK)**

```json
{
  "message": "导入成功",
  "summary": {
    "total": 10,
    "success": 8,
    "failed": 2,
    "skipped": 0
  },
  "details": [
    {
      "row": 1,
      "code": "000001",
      "status": "success",
      "message": "导入成功"
    },
    {
      "row": 2,
      "code": "000002",
      "status": "error",
      "message": "基金代码格式错误"
    }
  ]
}
```

---

## GET /fund/utils/export

导出用户的持仓数据。

### 请求

```http
GET /api/fund/utils/export
```

### 查询参数

| 参数           | 类型    | 必填 | 说明                                    |
| -------------- | ------- | ---- | --------------------------------------- |
| format         | string  | 否   | 导出格式: `excel` (默认), `csv`, `json` |
| includeHistory | boolean | 否   | 是否包含历史数据，默认 false            |

### 响应

**成功 (200 OK)**

返回文件下载。

**Content-Type:**

- Excel: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- CSV: `text/csv`
- JSON: `application/json`

---

## POST /fund/utils/update-batch

批量更新多个持仓的信息。

### 请求

```http
POST /api/fund/utils/update-batch
Content-Type: application/json
```

### 请求体

```json
{
  "holdings": [
    {
      "code": "000001",
      "shares": 15000,
      "costPrice": 1.45
    },
    {
      "code": "000002",
      "shares": 8000,
      "costPrice": 2.1
    }
  ]
}
```

### 响应

**成功 (200 OK)**

```json
{
  "message": "批量更新成功",
  "summary": {
    "total": 2,
    "success": 2,
    "failed": 0
  },
  "results": [
    {
      "code": "000001",
      "status": "success"
    },
    {
      "code": "000002",
      "status": "success"
    }
  ]
}
```

---

## POST /fund/utils/refresh-estimates

手动刷新所有持仓基金的实时估值数据。

### 请求

```http
POST /api/fund/utils/refresh-estimates
```

### 响应

**成功 (200 OK)**

```json
{
  "message": "实时估值刷新完成",
  "summary": {
    "total": 10,
    "success": 10,
    "failed": 0
  },
  "details": [
    {
      "code": "000001",
      "name": "华夏成长混合",
      "status": "success",
      "estimateNav": 1.605,
      "estimateTime": "2024-01-15 15:00:00"
    }
  ]
}
```

---

_文档版本: 1.1.0_
_最后更新: 2026-03-06_
