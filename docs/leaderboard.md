# 排行榜 API

本文档描述投资收益排行榜相关的接口。

## 目录

- [GET /leaderboard](#get-leaderboard) - 获取收益排行榜
- [GET /leaderboard/:userId](#get-leaderboarduserid) - 获取指定用户持仓详情

---

## GET /leaderboard

获取投资收益排行榜数据。

### 请求

```http
GET /api/leaderboard?period=1w
```

### 查询参数

| 参数   | 类型   | 必填 | 说明                                                                                          |
| ------ | ------ | ---- | --------------------------------------------------------------------------------------------- |
| period | string | 否   | 统计周期: `1d` (1日), `1w` (1周), `1m` (1月), `3m` (3月), `1y` (1年), `all` (全部)，默认 `1d` |

### 响应

**成功 (200 OK)**

```json
{
  "period": "1w",
  "updatedAt": "2024-01-15T10:00:00Z",
  "rankings": [
    {
      "rank": 1,
      "userId": 1,
      "username": "admin",
      "profit": 50000,
      "profitRate": 25.5,
      "totalAssets": 245000
    },
    {
      "rank": 2,
      "userId": 2,
      "username": "user2",
      "profit": 30000,
      "profitRate": 15.2,
      "totalAssets": 230000
    }
  ]
}
```

### 字段说明

| 字段        | 类型   | 说明         |
| ----------- | ------ | ------------ |
| period      | string | 统计周期     |
| updatedAt   | string | 数据更新时间 |
| rankings    | array  | 排名列表     |
| rank        | number | 排名         |
| userId      | number | 用户ID       |
| username    | string | 用户名       |
| profit      | number | 收益金额     |
| profitRate  | number | 收益率 (%)   |
| totalAssets | number | 总资产       |

---

## GET /leaderboard/:userId

获取指定用户的持仓详情（用于排行榜用户详情页）。

### 请求

```http
GET /api/leaderboard/1
```

### 路径参数

| 参数   | 类型   | 说明   |
| ------ | ------ | ------ |
| userId | number | 用户ID |

### 响应

**成功 (200 OK)**

返回用户的持仓列表，格式同 [GET /fund/holdings](./holdings.md#get-fundholdings) 接口的 `holdings` 字段。

**失败 (400 Bad Request)**

```json
{
  "statusCode": 400,
  "statusText": "需要提供用户 ID。"
}
```

**失败 (500 Internal Server Error)**

```json
{
  "statusCode": 500,
  "statusText": "获取持仓详情失败。"
}
```

---

_文档版本: 1.1.0_
_最后更新: 2026-03-06_
