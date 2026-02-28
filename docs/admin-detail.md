# 管理员接口详情

本文档详细描述管理员相关的接口参数和响应。

## 字典类型管理

### 字典类型数据结构

| 字段 | 类型 | 说明 |
|------|------|------|
| code | string | 字典类型编码 (唯一) |
| name | string | 字典类型名称 |
| description | string | 描述说明 |
| sort | number | 排序顺序 |
| createdAt | string | 创建时间 |
| updatedAt | string | 更新时间 |

### GET /admin/dict-types

获取所有字典类型列表。

**响应示例:**

```json
[
  {
    "code": "fund_types",
    "name": "基金类型",
    "description": "基金产品分类",
    "sort": 1,
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z"
  }
]
```

### POST /admin/dict-types

创建新的字典类型。

**请求体:**

```json
{
  "code": "risk_levels",
  "name": "风险等级",
  "description": "基金风险等级划分",
  "sort": 5
}
```

### PUT /admin/dict-types/:type

更新字典类型信息。

**路径参数:**
- `type`: 字典类型编码

**请求体:**

```json
{
  "name": "风险等级(新)",
  "description": "更新后的描述",
  "sort": 6
}
```

### DELETE /admin/dict-types/:type

删除字典类型及其下所有字典数据。

---

## 字典数据管理

### 字典数据数据结构

| 字段 | 类型 | 说明 |
|------|------|------|
| id | number | 字典数据ID |
| typeCode | string | 所属字典类型编码 |
| value | string | 字典值 (唯一) |
| label | string | 显示标签 |
| sort | number | 排序顺序 |
| isDefault | boolean | 是否默认选中 |
| status | string | 状态: `enabled`, `disabled` |
| remark | string | 备注说明 |
| createdAt | string | 创建时间 |
| updatedAt | string | 更新时间 |

### GET /admin/dict-data/:id

获取指定ID的字典数据详情。

**响应示例:**

```json
{
  "id": 1,
  "typeCode": "fund_types",
  "value": "open",
  "label": "开放式基金",
  "sort": 1,
  "isDefault": true,
  "status": "enabled",
  "remark": "普通开放式基金",
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-01T00:00:00Z"
}
```

### POST /admin/dict-data

创建新的字典数据。

**请求体:**

```json
{
  "typeCode": "fund_types",
  "value": "etf",
  "label": "ETF基金",
  "sort": 3,
  "isDefault": false,
  "status": "enabled",
  "remark": "交易所交易基金"
}
```

### PUT /admin/dict-data/:id

更新字典数据。

**请求体:**

```json
{
  "label": "ETF基金(更新)",
  "sort": 4,
  "status": "enabled"
}
```

### DELETE /admin/dict-data/:id

删除字典数据。

---

## 用户管理详情

### PUT /admin/users/:id

更新用户信息。

**请求体:**

```json
{
  "username": "newname",
  "role": "admin",
  "availableCash": 100000,
  "isAiAgent": true,
  "aiSystemPrompt": "新的系统提示词..."
}
```

### DELETE /admin/users/:id

删除用户及其所有相关数据。

### POST /admin/users/:id/clone

克隆用户的持仓配置到新用户。

**请求体:**

```json
{
  "targetUserId": 3,
  "copyHoldings": true,
  "copySettings": true
}
```

### POST /admin/users/merge-holdings

合并多个用户的持仓（用于账户合并场景）。

**请求体:**

```json
{
  "sourceUserIds": [2, 3],
  "targetUserId": 1,
  "strategy": "merge" // merge: 合并, replace: 替换
}
```

---

*文档版本: 1.0.0*
