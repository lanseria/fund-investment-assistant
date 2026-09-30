# 基金助手 iOS App

将 PC 网页版（`../app`，Nuxt 全栈）的「基金查看与操作」功能迁移而来的 SwiftUI 原生应用。

- **工程**：`FundAssistant.xcodeproj`（folder-synchronized，新增 Swift 文件自动纳入编译）
- **技术栈**：SwiftUI + Swift Charts + `@Observable`，最低 **iOS 26.0**
- **后端**：默认连接外网部署的 `http://62.234.29.20:9999`；本地调试可改为 `http://localhost:8888`（App 内会自动容错去掉误填的 `/api` 后缀）

## 功能对照

| 网页版功能                            | iOS 实现                                                                                                                                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 登录 / 会话保持                       | Cookie 认证（URLSession + HTTPCookieStorage），401 自动 `POST /api/auth/refresh` 并重试，等价网页端 `apiFetch`                                                                        |
| 持仓列表（index.vue）                 | 持仓 Tab：资产汇总卡（总资产/今日预估盈亏/持仓市值/昨日收益）、持仓行（今日估值、持有收益、昨日收益、BIAS20、策略信号标签、待确认提示）、按金额/估值涨跌/收益率/BIAS20 排序、下拉刷新 |
| 刷新估值                              | 工具栏「刷新估值」按钮（`POST /api/fund/utils/refresh-estimates`，scope=user）                                                                                                        |
| 基金详情（fund/[code]）               | 概览卡（估值/净值/份额/成本/持有收益）、区间涨跌、净值走势图（Swift Charts，净值 + MA5/10/20/120 可切换，3月/6月/1年/2年/全部）、重仓股、费率阶梯、最近交易                           |
| 买入 / 卖出                           | 行滑动或详情页按钮 → TradeSheet（金额/份额、可用份额冻结计算与网页端一致、日期）                                                                                                      |
| 基金转换                              | ConvertSheet（转出份额 + 从持仓选择转入基金）                                                                                                                                         |
| 添加 / 编辑 / 删除持仓、清仓转关注    | AddEditHoldingSheet（份额与成本同有同无校验、关注等级、操作策略）+ 确认对话框                                                                                                         |
| 修改板块                              | 详情页点击板块标签 → SectorEditSheet                                                                                                                                                  |
| 撤销 / 批准待确认交易                 | 详情页「待确认交易」区块（draft 可批准，pending 可撤销）                                                                                                                              |
| 定投计划                              | 定投 Tab：列表（启停开关、下次/上次扣款日）、新建（每日/每周/每两周/每月 + 锚点日）、删除                                                                                             |
| 收益总览（fund-profits.vue）          | 收益 Tab：累计收益/持有市值汇总、全部/持有中/已清仓筛选、单基金收益行                                                                                                                 |
| 执行策略分析 / 同步历史数据           | 详情页操作按钮                                                                                                                                                                        |
| 导入导出、排行榜、板块资金、AI 对话等 | 未迁移（后续可按同一模式扩展）                                                                                                                                                        |

涨跌配色遵循 A 股习惯：**红涨绿跌**。

## 运行

```bash
# 1. 启动后端（仓库根目录，需要 PostgreSQL/Redis 等依赖）
pnpm dev          # 端口 8888

# 2. 打开 iOS 工程
cd ios && open FundAssistant.xcodeproj
# 模拟器直接 Run；真机请在 App 内「设置 → 修改服务器地址」填电脑局域网 IP
```

### 无后端调试

仓库没起后端时可用 Mock 服务器（任意用户名/密码登录）：

```bash
python3 MockServer/mock_server.py   # 监听 8888，内置三只示例基金与完整接口模拟
```

### UI 测试启动参数

- `-FATab 0..3`：启动直达指定 Tab（持仓/收益/定投/设置）
- `-FAFund <code>`：启动后直接打开基金详情
- `-FALogin user:pass`：启动时自动登录（配合 Mock 服务器做 UI 测试）

例如：`xcrun simctl launch <udid> com.fundassistant.app -FAFund 161725`

## 结构

```
ios/
├── FundAssistant/
│   ├── FundAssistantApp.swift   # 入口 + 登录态路由
│   ├── Models/Models.swift      # Codable 模型（与 app/types/* 逐字段对齐）
│   ├── Networking/APIClient.swift # URLSession + Cookie + 401 刷新重试 + h3 错误解析
│   ├── Stores/                  # AuthStore / HoldingsStore / DcaPlanStore（@Observable）
│   └── Views/                   # 登录、持仓、详情(Swift Charts)、交易表单、定投、收益、设置
├── MockServer/mock_server.py    # 开发用 Mock 后端
└── FundAssistant.xcodeproj
```
