# API 接口文档

本文档提供基金投资助手系统的完整 API 接口说明。

---

## 更新内容

### 2026-03-12 更新

| 功能模块     | 相关文档                             | 说明                                                                    |
| ------------ | ------------------------------------ | ----------------------------------------------------------------------- |
| 每日操作页面 | [transactions.md](./transactions.md) | 重构每日操作页面，新增 `GET /transactions/daily/:date/:userId` 详情接口 |
| 持仓查看     | [holdings.md](./holdings.md)         | 持仓详情和历史接口新增 `userId` 参数，支持查看他人持仓                  |
| 排行榜详情页 | [leaderboard.md](./leaderboard.md)   | 重构排行榜为详情路由模式，新增 `/leaderboard/[id]` 详情页面路由         |
| AI 交易修正  | [transactions.md](./transactions.md) | 删除接口优化为仅删除 AI 用户待处理交易，增加安全性                      |

详细更新记录请参考各文档的版本历史。

---

## 文档结构

| 模块       | 文件                                     | 说明                       |
| ---------- | ---------------------------------------- | -------------------------- |
| 认证授权   | [auth.md](./auth.md)                     | 登录、登出、Token 刷新等   |
| 持仓管理   | [holdings.md](./holdings.md)             | 基金持仓的增删改查         |
| 持仓工具   | [holdings-tools.md](./holdings-tools.md) | 导入导出、批量更新等       |
| 交易记录   | [transactions.md](./transactions.md)     | 交易记录的创建、查询、删除 |
| 基金转换   | [fund-convert.md](./fund-convert.md)     | 基金转换操作               |
| 用户数据   | [user.md](./user.md)                     | 用户信息、收益分析等       |
| 市场行情   | [market.md](./market.md)                 | 市场数据、实时推送         |
| 新闻分析   | [news.md](./news.md)                     | 新闻获取、AI 分析          |
| 策略图表   | [charts.md](./charts.md)                 | RSI、MACD 等技术指标       |
| 板块数据   | [sectors.md](./sectors.md)               | 板块统计和信号分析         |
| 排行榜     | [leaderboard.md](./leaderboard.md)       | 投资收益排行榜             |
| AI 交易    | [ai-trader.md](./ai-trader.md)           | AI 自动交易代理            |
| AI 代理    | [agent.md](./agent.md)                   | MCP Agent 集成开发         |
| 公共字典   | [dicts.md](./dicts.md)                   | 公共字典数据接口           |
| 管理员     | [admin.md](./admin.md)                   | 用户管理、字典管理、日志   |
| 管理员详情 | [admin-detail.md](./admin-detail.md)     | 管理员接口详细说明         |
| Webhook    | [webhooks.md](./webhooks.md)             | 外部系统 Webhook           |
| 开发工具   | [dev.md](./dev.md)                       | 开发调试接口               |

## 通用规范

### 基础地址

```md
http://localhost:3000/api
```

### 认证方式

系统使用 PASETO Token 进行身份认证：

1. 登录成功后，服务器通过 `HttpOnly Cookie` 设置 `auth-token` 和 `auth-refresh-token`
2. 浏览器会自动携带 Cookie 发送请求
3. 服务器验证 Token 有效性
4. Token 过期后可调用刷新接口获取新的 Token

### 响应格式

**成功响应 (200 OK)**

```json
{
  "data": "实际返回数据",
  "status": "success"
}
```

**错误响应**

```json
{
  "statusCode": 400,
  "statusText": "错误描述信息"
}
```

常见 HTTP 状态码：

| 状态码 | 说明                   |
| ------ | ---------------------- |
| 200    | 请求成功               |
| 400    | 请求参数错误           |
| 401    | 未认证或 Token 过期    |
| 403    | 权限不足               |
| 404    | 资源不存在             |
| 409    | 资源冲突（如重复创建） |
| 500    | 服务器内部错误         |

### 日期格式

所有日期字段统一使用 `YYYY-MM-DD` 格式。

### 金额精度

金额字段使用字符串或数字表示，精度保留 4 位小数。

### 分页参数

部分列表接口支持分页（需根据具体接口文档确认）：

| 参数     | 类型   | 说明            |
| -------- | ------ | --------------- |
| page     | number | 页码，从 1 开始 |
| pageSize | number | 每页条数        |

---

_文档版本: 1.2.0_
_最后更新: 2026-03-12_
