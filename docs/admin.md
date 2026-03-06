# 管理员 API

本文档描述管理员相关的接口，包括用户管理、字典管理、AI 日志等功能。

## 目录

### 用户管理

- [GET /admin/users](#get-adminusers) - 获取用户列表
- [POST /admin/users](#post-adminusers) - 创建用户
- [PUT /admin/users/:id](#put-adminusersid) - 更新用户
- [DELETE /admin/users/:id](#delete-adminusersid) - 删除用户
- [POST /admin/users/:id/clone](#post-adminusersidclone) - 克隆用户持仓
- [POST /admin/users/merge-holdings](#post-adminusersmerge-holdings) - 合并用户持仓

### 字典管理

- [GET /admin/dict-types](#get-admindict-types) - 获取字典类型列表
- [POST /admin/dict-types](#post-admindict-types) - 创建字典类型
- [PUT /admin/dict-types/:type](#put-admindict-typestype) - 更新字典类型
- [DELETE /admin/dict-types/:type](#delete-admindict-typestype) - 删除字典类型
- [GET /admin/dict-data/:id](#get-admindict-dataid) - 获取字典数据
- [POST /admin/dict-data](#post-admindict-data) - 创建字典数据
- [PUT /admin/dict-data/:id](#put-admindict-dataid) - 更新字典数据
- [DELETE /admin/dict-data/:id](#delete-admindict-dataid) - 删除字典数据

### AI 日志

- [GET /admin/ai-logs](#get-adminai-logs) - 获取 AI 执行日志

### 交易管理

- [POST /admin/transactions/batch-replace](#post-admintransactionsbatch-replace) - 批量替换交易记录
- [POST /admin/transactions/ai-fix](#post-admintransactionsai-fix) - AI 修复交易记录

---

## GET /admin/users

获取所有用户列表（仅管理员）。

### 请求

```http
GET /api/admin/users
```

### 响应

**成功 (200 OK)**

```json
[
  {
    "id": 1,
    "username": "admin",
    "role": "admin",
    "isAiAgent": false,
    "aiSystemPrompt": null,
    "availableCash": 50000,
    "cash": 50000,
    "fundValue": 105000,
    "holdingCount": 3,
    "watchingCount": 2,
    "totalAssets": 155000,
    "createdAt": "2024-01-01T00:00:00Z"
  },
  {
    "id": 2,
    "username": "user1",
    "role": "user",
    "isAiAgent": true,
    "aiSystemPrompt": "你是一个专业的投资顾问...",
    "availableCash": 30000,
    "cash": 30000,
    "fundValue": 80000,
    "holdingCount": 2,
    "watchingCount": 1,
    "totalAssets": 110000,
    "createdAt": "2024-01-02T00:00:00Z"
  }
]
```

---

## POST /admin/users

创建新用户（仅管理员）。

### 请求

```http
POST /api/admin/users
Content-Type: application/json
```

### 请求体

| 字段          | 类型   | 必填 | 说明                           |
| ------------- | ------ | ---- | ------------------------------ |
| username      | string | 是   | 用户名                         |
| password      | string | 是   | 密码                           |
| role          | string | 否   | 角色: `user` (默认) 或 `admin` |
| availableCash | number | 否   | 初始可用现金，默认 0           |

```json
{
  "username": "newuser",
  "password": "securepassword",
  "role": "user",
  "availableCash": 100000
}
```

### 响应

**成功 (200 OK)**

```json
{
  "message": "用户创建成功",
  "user": {
    "id": 3,
    "username": "newuser",
    "role": "user",
    "availableCash": 100000,
    "createdAt": "2024-01-15T10:00:00Z"
  }
}
```

---

## GET /admin/ai-logs

获取 AI 执行日志（仅管理员）。

### 请求

```http
GET /api/admin/ai-logs
```

### 查询参数

| 参数      | 类型   | 必填 | 说明                                       |
| --------- | ------ | ---- | ------------------------------------------ |
| startDate | string | 否   | 开始日期                                   |
| endDate   | string | 否   | 结束日期                                   |
| userId    | number | 否   | 用户ID筛选                                 |
| type      | string | 否   | 日志类型: `trade`, `analysis`, `rebalance` |
| limit     | number | 否   | 返回数量，默认 50                          |

### 响应

**成功 (200 OK)**

```json
{
  "total": 100,
  "logs": [
    {
      "id": 1,
      "userId": 2,
      "username": "user1",
      "type": "trade",
      "input": {
        "marketData": {...},
        "holdings": [...]
      },
      "output": {
        "decision": "buy",
        "fundCode": "000001",
        "amount": 5000,
        "reason": "RSI指标显示超卖..."
      },
      "tokensUsed": 1523,
      "executionTime": 2500,
      "createdAt": "2024-01-15T10:00:00Z"
    }
  ]
}
```

---

_文档版本: 1.1.0_
_最后更新: 2026-03-06_
