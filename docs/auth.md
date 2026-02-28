# 认证授权 API

本文档描述用户认证相关的接口，包括登录、登出、Token 刷新等功能。

## 目录

- [POST /auth/login](#post-authlogin) - 用户登录
- [GET /auth/me](#get-authme) - 获取当前用户信息
- [POST /auth/logout](#post-authlogout) - 用户登出
- [POST /auth/refresh](#post-authrefresh) - 刷新访问令牌

---

## POST /auth/login

用户登录接口，验证用户名密码，成功后设置 Cookie 并返回用户信息。

### 请求

```http
POST /api/auth/login
Content-Type: application/json
```

### 请求体

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| username | string | 是 | 用户名 |
| password | string | 是 | 密码 |

```json
{
  "username": "admin",
  "password": "your-password"
}
```

### 响应

**成功 (200 OK)**

```json
{
  "user": {
    "id": 1,
    "username": "admin",
    "role": "admin",
    "isAiAgent": false,
    "aiSystemPrompt": null,
    "availableCash": "100000.00"
  },
  "token": "v4.local.xxx..."
}
```

**同时设置以下 Cookie:**
- `auth-token`: 访问令牌 (HttpOnly, 15天有效期)
- `auth-refresh-token`: 刷新令牌 (HttpOnly, 1个月有效期)

**失败 (401 Unauthorized)**

```json
{
  "statusCode": 401,
  "statusText": "用户名或密码错误。"
}
```

---

## GET /auth/me

获取当前登录用户的详细信息。

### 请求

```http
GET /api/auth/me
Cookie: auth-token=xxx
```

### 响应

**成功 (200 OK)**

```json
{
  "id": 1,
  "username": "admin",
  "role": "admin",
  "isAiAgent": false,
  "aiSystemPrompt": null,
  "availableCash": "100000.00"
}
```

**失败 (401 Unauthorized)**

Token 无效或已过期时返回 401。

---

## POST /auth/logout

用户登出，清除 Cookie 中的认证信息。

### 请求

```http
POST /api/auth/logout
```

### 响应

**成功 (200 OK)**

```json
{
  "message": "登出成功"
}
```

**同时清除以下 Cookie:**
- `auth-token`
- `auth-refresh-token`

---

## POST /auth/refresh

使用刷新令牌获取新的访问令牌。

### 请求

```http
POST /api/auth/refresh
Cookie: auth-refresh-token=xxx
```

### 响应

**成功 (200 OK)**

```json
{
  "message": "Token refreshed successfully"
}
```

**同时更新 Cookie:**
- `auth-token`: 新的访问令牌

**失败 (401 Unauthorized)**

刷新令牌无效或已过期时返回 401。

---

## 用户角色说明

| 角色 | 说明 |
|------|------|
| `admin` | 管理员，拥有所有权限 |
| `user` | 普通用户，只能操作自己的数据 |

---

*文档版本: 1.0.0*
