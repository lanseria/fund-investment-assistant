# MCP 响应契约改造说明（fund-app-remote）

> 改造日期：2026-09-18。目的：让接入的客户端 AI **零背景**正确解读每个数值字段——单位、口径、周期、基准日全部自描述；同一含义在不同工具中格式统一。
>
> 客户端同步提示：本次改造以**新增字段 + description 重写**为主，旧字段全部保留（仅 `bias_20`、`signal` 两个标注 deprecated）。若你的解析器已适配旧格式，可平滑迁移；建议按下文对照表更新。

---

## 一、统一响应外壳（所有结构化工具）

`get_fund_details` / `get_market_index` / `get_portfolio` / `explore_user_funds` 的 JSON 输出统一为：

```jsonc
{
  "meta": {
    "as_of": "2026-09-17",            // 主数据基准日 (yyyy-MM-dd)；多市场混合时为主市场基准日
    "as_of_note": "…",                // 可选：as_of 的补充说明（指向各子区块的 as_of）
    "generated_at": "2026-09-18T16:01:33+08:00",  // 响应生成时间，含时区偏移
    "currency": "CNY",                // 金额币种；无币种数据 (指数点位) 为 null
    "unit_convention": "percent_values_are_percent_not_ratio",
    // ↑ 全局口径：所有百分比字段均为"百分数数值"，-27.02 表示 -27.02%，不是比率 -0.2702
    "staleness": { "nav": "T-1", "sector_capital": "T-0", "…": "…" },
    "time_basis": { … }               // 仅 get_market_index：每组报价的时区/延迟口径
  },
  "data": { /* 原有内容，见各工具对照表 */ }
}
```

实现位置：`server/utils/mcpMeta.ts`（`buildMcpMeta`）。纯文本确认类工具（`submit_trade_order`、`manage_*`、`explore_user_funds` 的 `list_users`）不套壳，保持原样。

---

## 二、get_fund_details

### 2.1 工具 description 全文（已替换进代码，可直接复制）

```text
获取指定基金的深度诊断信息（净值/均线/RSI/策略信号/所属板块主力资金），一次调用返回一只基金。所有响应都包在 { meta, data } 外壳中：meta.as_of 为主数据（净值）基准日，meta.staleness 声明各区块新鲜度，所有百分比类字段均为"百分数数值"（-3.10 表示 -3.10%，不是 -0.031），金额币种为人民币 CNY。

【返回内容清单】
1) info：code/name、sector（项目板块标签）、fund_type（open=普通场外, qdii_lof=场内/QDII）、operation_strategy（基金级全局操作策略文本，null=未设置）、latest_nav（最新已确认单位净值，单位元/份）、latest_date 与 nav_as_of（均为该净值日期，yyyy-MM-dd）。
2) technical_analysis（基于已确认净值序列，基准日见 as_of 字段）：ma5/ma20/ma60/ma250（移动均线，单位元/份；ma250 即年线，基金历史净值不足 250 个交易日时为 null）；bias_20_pct 与 bias_250_pct（20/250 日乖离率，数值单位 %，如 -3.10 表示净值低于对应均线 3.10%）；bias_20（旧版带 % 号的字符串字段，仅为兼容保留，已弃用，勿再解析）；rsi_6/rsi_12/rsi_24（6/12/24 日 RSI，0-100 数值，按 Wilder 平滑 SMA(X,N,1) 口径计算，与主流行情 App 展示的 RSI(6/12/24) 口径一致，平盘或数据不足时为 null）；trend（净值相对 MA20 的位置：Bullish (Above MA20) / Bearish (Below MA20) / Unknown）。
3) strategy_signals：策略引擎（外部 Python 服务）每日生成的信号，键为策略名 rsi / bollinger_bands。每条含 signal（引擎原始中文文本，如 "买入"/"卖出"/"持有/观望"，已弃用，勿依赖）、signal_enum（固定枚举 buy/hold/sell/unknown，由 signal 归一化而来）、as_of 与 date（信号对应的交易日）、reason（引擎给出的中文解释，是信号的最权威说明）、metrics（引擎指标原文）。bollinger_bands.metrics 额外注入 bband_mid_period 字段：布林带周期为 50，即 bband_mid = MA50，与 technical_analysis.ma20 是两个不同价位的均线，不可互相替代；bband_mid/bband_upper/bband_lower 单位为元/份，bband_dev_factor 为标准差倍数。
4) sector_capital：基金所属板块（东财板块）的主力资金行为，为最新交易日 (T-0) 数据，基准日见 capital_as_of 与 latest.date。latest 含 main_action（板块主力行为枚举文本：抢筹/建仓/洗盘/出货）、main_capital/retail_capital/main_hidden（主力净流入/散户净流入/主力暗盘，单位亿元人民币，正=净流入，负=净流出）、change_percent（板块当日涨跌幅，单位 %）、main_strength（主力强度，单位 %）；recent_trend 为最近 10 个交易日升序序列。bound=false 表示该基金未绑定东财板块，此时无资金数据。
5) recent_price_action：最近 days 个交易日的净值序列（升序，含 date/nav/ma5/ma20，单位元/份）；recent_price_action_meta 说明请求与实际返回行数。

【已知限制】基金净值为 T-1（净值当晚才公布），sector_capital 为 T-0，两者相差一个交易日，做联合判断时务必对齐各自 as_of；rsi_6/12/24 是本服务按净值序列计算，strategy_signals.rsi 是策略引擎的 RSI(14)（其 metrics.rsi_period=14），周期不同、数值不可互换，也与用户在 App 上看到的 6/12/24 日 RSI 数值不同；QDII 基金净值披露更晚（T-1 或 T-2）。

【典型误用警示】不要把 bias_20_pct/bias_250_pct 当绝对价差（它们是百分比）；不要把布林中轨 bband_mid 当成 MA20；不要把 strategy_signals 的 signal 文本当枚举（请用 signal_enum）；signal_enum 与 reason 语义冲突时（如"买入"但 reason 说"继续持有"），以 reason 为准并在结论中说明分歧。
```

入参 `days`：`z.number().int().min(1).max(250).optional().default(10)`，描述为"返回最近 N 个交易日的净值序列 (recent_price_action)。默认 10，最大 250。注意单位是'交易日'而非自然日；该参数不影响 technical_analysis 等区块，它们始终基于最新数据计算。"

### 2.2 字段对照表（改造前 → 改造后）

| 位置 | 改造前 | 改造后 | 说明 |
|---|---|---|---|
| 响应顶层 | 直接是数据对象 | `{ meta, data }` 外壳 | data 内才是原有内容 |
| — | — | `meta.as_of / generated_at / currency / unit_convention / staleness` | 新增 |
| `info` | `latest_date` | 保留 + 新增 `nav_as_of`（值相同，显式命名）+ `fund_type` + `price_unit:"元/份"` | 问题5 |
| `technical_analysis` | `ma5 / ma20 / ma60` | 保留 + 新增 `ma250`（年线，不足 250 交易日为 null） | 问题9 |
| `technical_analysis` | `bias_20` = `"-3.10%"` 字符串 | 保留（deprecated）+ 新增 `bias_20_pct` 数值 + 新增 `bias_250_pct` 数值 | 问题3 |
| `technical_analysis` | — | 新增 `rsi_6 / rsi_12 / rsi_24`（Wilder 口径，0-100 数值，null=数据不足/平盘）+ `rsi_method` 说明 | 问题9 |
| `technical_analysis` | — | 新增 `as_of`（净值基准日）、`price_basis:"confirmed_nav"` | 问题5 |
| `strategy_signals.*` | `signal`（中文文本）、`date`、`reason`、`metrics` | 全部保留 + 新增 `signal_enum`（buy/hold/sell/unknown）+ `as_of`（=date） | 问题6 |
| `strategy_signals.bollinger_bands.metrics` | `bband_period: 50`（无人解释） | 保留 + 注入 `bband_mid_period: 50` 显式字段 | 问题4 |
| `sector_capital` | `latest.date` | 保留 + 新增 `capital_as_of`（=latest.date）+ `unit` 字典（金额=亿元、百分比=%） | 问题5 |
| `recent_price_action` | 恒为 10 行数组，`days` 参数无效 | **真正按 `days` 返回**（1-250 交易日，默认 10），仍为数组（升序） | 问题1 |
| — | — | 新增 `recent_price_action_meta`：`{ as_of, requested_days, returned_days, note }` | 验收1 |

已删除：无。查询窗口从 `max(days+90,120)` 扩大到 `ceil((days+250+120)*1.5)` 自然日，保证 MA250 / RSI24 / days 行数同时有足够数据。

---

## 三、get_market_index

### 3.1 工具 description 全文（已替换进代码）

```text
获取大盘指数与代表性个股/ETF/期货的最新报价，用于判断大盘整体走势和市场情绪。所有响应都包在 { meta, data } 外壳中；data 以分组标签为键，每组是条目数组。以下分组与成员清单与实际返回一一对应（分组名=入参 group 值）：

【分组与成员】
- group="A"（键 "A 股"，北京时间，实时）：上证指数(sh000001)、沪深300(sh000300)、上证50(sh000016)、Ｂ股指数(sh000003)、科创50(sh000688)，全部 kind=index。
- group="B"（键 "深市"，北京时间，实时）：深证成指(sz399001)、创业板指(sz399006)、深证综指(sz399106)、成份Ｂ指(sz399003)，全部 kind=index。注意：本服务不提供中证1000。
- group="HK"（键 "港股"，港/北京时间，实时）：恒生指数(hkHSI, index)、GX恒生科技(hk02837, etf——恒生科技指数的 ETF 代理，非指数本身)、小米集团-W(hk01810, stock)、中芯国际(hk00981, stock)、阿里巴巴-W(hk09988, stock)、腾讯控股(hk00700, stock)。
- group="US"（键 "美股"，美东时间）：道琼斯(usDJI, index)、纳斯达克(usIXIC, index)、特斯拉(usTSLA, stock)、苹果(usAAPL, stock)、英伟达(usNVDA, stock)。
- group="JP"（键 "日本"，延迟行情）：日经指数期货(fuNIY, futures——日经225 的期货代理)。
- group="Futures"（键 "期货"，延迟行情，当地时间为准）：COMEX黄金(fuGC, futures)、NYMEX WTI原油(fuCL, futures)、泛美白银(usPAAS, stock)、白银ETF-iShares(usSLV, etf)。
- group="all"：以上全部分组（默认）。

【每个条目的字段】code（含市场前缀 sh/sz/hk/us/fu，如 sh000001、hk00700）、name、kind（index|stock|etf|futures）、price（指数为点位；个股/ETF/商品为当地计价价格）、changeAmount（较前一收盘的变动量，与 price 同单位）、changeRate（涨跌幅，数值单位 %，如 1.5 表示 +1.5%）、as_of（报价日期 yyyy-MM-dd，交易所当地时间口径）、time（报价时间 HH:mm:ss，交易所当地时区）、delayed（true=延迟行情）、datetime（报价完整时间）。

【已知限制】不同市场的 as_of 不同——美股/期货可能是北京的"昨天"，跨市场比较请以各条目 as_of 为准（meta.time_basis 说明每组时区）；条目 time 只有时刻没有日期，日期一律看 as_of；行情源缓存约 60 秒。

【典型误用警示】不要假设所有条目都是指数——HK/US 组含个股、ETF，JP/Futures 组是期货代理；不要把 GX恒生科技 ETF 当成恒生科技指数本身；Ｂ股指数(sh000003)与成份Ｂ指(sz399003)对情绪判断参考价值低；不要把 changeRate 当小数比率（0.58 表示 +0.58%）。
```

### 3.2 字段对照表

| 位置 | 改造前 | 改造后 | 说明 |
|---|---|---|---|
| 响应顶层 | 直接是 `{分组: [条目]}` | `{ meta, data: {分组: [条目]} }`；meta 增加 `time_basis`（每组时区/延迟） | |
| 条目 `code` | `sh000001` 等带市场前缀 | 不变，description 明示该格式 | |
| 条目 | — | 新增 `kind`: `index / stock / etf / futures`（映射表 `shared/market.ts#marketCodeKind`） | 问题7 |
| 条目 `time` | A股=HH:mm:ss 正常；**港股/美股=乱码**（按紧凑格式截取带分隔符的时间串） | 三种上游格式（紧凑/斜杠/横杠）统一解析，恒为 `HH:mm:ss` | bug 修复 |
| 条目 | — | 新增 `as_of`（报价日期）、`datetime`（完整时间）、`delayed`（true=延迟行情） | 问题7 |
| description | 声称有"中证1000"（实际无）、"恒生科技"（实际是 ETF 代理）、未提个股 | 与实际成员一一对应，逐条标注 kind/时区/延迟；明示"不提供中证1000" | 问题7 |
| 缓存 | `market:indexes` | key 升级为 `market:indexes:v2`（旧缓存缺新字段，直接作废，首次访问即重新抓取） | |

前端影响：`MarketIndexData` 仅新增字段，`/api/market/`、SSE、`IndexCard.vue` 等消费方向后兼容。

---

## 四、get_portfolio

### 4.1 工具 description 全文（已替换进代码）

```text
获取当前认证用户的基金持仓摘要与明细（不需要参数，用户从 Bearer Token 解析）。所有响应都包在 { meta, data } 外壳中：meta.as_of 为数据生成日，meta.staleness 声明各区块口径；金额币种为人民币 CNY，单位"元"。

【返回内容清单】
1) summary：totalAssets（总资产=持仓市值+现金，单位元）、availableCash（可用现金，单位元）、totalProfit（今日有效收益额，单位元，可为负；仅统计盘中估值未过期的持仓）、dayChangeRate（今日收益率，数值单位 %，如 1.83 表示 +1.83%，不是 0.0183；同样仅统计估值未过期的持仓）、holding_count（已持仓基金数量）、estimate_stale_count（盘中估值已过期、未计入今日收益的持仓数量，>0 时 dayChangeRate/totalProfit 覆盖不全）。
2) holdings[]（按已持仓排前、市值降序）：code/name/sector；held（true=已持仓，false=观察中未持仓）；amount（持仓市值，单位元，按 T-1 已确认净值计算）；profitRate（持有收益率，数值单位 %，如 -27.02 表示 -27.02%；基于持仓成本价与 T-1 净值）；todayChange（该基金当日估算涨跌幅，数值单位 %，来自盘中估算净值）；estimate_updated_at（该基金盘中估算净值的更新时间 ISO8601，null=今日无有效估值）；shares（持有份额，单位份，未持仓为 null）、costPrice（持仓成本价，单位元/份，未持仓为 null）；recommendation（基于 RSI(14) 策略信号的粗略文案："RSI买入信号"/"RSI卖出信号"/"持有"，仅供参考，精确信号请调 get_fund_details 看 strategy_signals）；operationStrategy（基金级全局操作策略文本，null=未设置，可通过 manage_fund_strategy 修改）；recentTransactions（最近确认交易，最多 7 条：type=buy/sell、date、amount 单位元、shares 单位份、nav 单位元/份）。

【已知限制】amount/profitRate 基于 T-1 已确认净值（非实时）；todayChange 依赖盘中估算净值，QDII 与非交易时段可能过期（看 estimate_updated_at 与 estimate_stale_count）；观察中的基金（held=false）amount/profitRate/shares/costPrice 均为 null。

【典型误用警示】amount=null 或 profitRate=null 表示"观察中、未持仓"，不是数据缺失或接口故障；不要把 profitRate=-27.02 读成"亏了 27.02 元"（是 -27.02%）；不要把 totalProfit 当累计收益（它是"今日"收益额）。
```

### 4.2 字段对照表

| 位置 | 改造前 | 改造后 | 说明 |
|---|---|---|---|
| 响应顶层 | `{summary, holdings}` | `{ meta, data: {summary, holdings} }` | |
| holdings[] | `amount: null`（含义未说明） | 保留 + 新增 `held: true/false`；description 声明 null=观察中未持仓 | 问题8 |
| holdings[] | — | 新增 `estimate_updated_at`（盘中估值时间，null=今日无有效估值） | 时序定位 |
| holdings[] | — | 新增 `shares`（份）、`costPrice`（元/份），未持仓为 null | 补全 |
| summary | `totalAssets / availableCash / totalProfit / dayChangeRate` | 保留 + 新增 `holding_count`、`estimate_stale_count`；description 声明金额单位=元、收益率单位=% | 问题8 |

---

## 五、explore_user_funds（轻量改造）

`action=view` 的 JSON 返回套上 `{ meta, data }` 外壳（data 内原有 user/summary/funds/hint 不变）；description 补充了 status 字段含义与外壳说明。`list_users` 纯文本不变。

---

## 六、兼容性处理汇总

| 旧字段 | 处理方式 |
|---|---|
| `technical_analysis.bias_20`（带%字符串） | **保留但 deprecated**，同时新增数值型 `bias_20_pct`；建议一个版本周期后移除 |
| `strategy_signals.*.signal`（中文文本） | **保留但 deprecated**，同时新增 `signal_enum` 枚举 |
| `recent_price_action` 数组结构 | 不变（行数改为真正响应 `days` 参数）；行级字段不变 |
| `get_market_index` 条目 `price/changeAmount/changeRate/time` | 全部不变，仅新增字段 |
| `get_portfolio` 的 `amount/profitRate/todayChange/recommendation/…` | 全部不变，仅新增字段 |
| 旧 `days` 默认值 30（无效） | 语义修正为"默认 10（与旧行为输出一致）"，真实生效 |

---

## 七、客户端 AI 解析更新要点（对照旧解析逻辑）

1. 读百分比统一走数值字段：`bias_20_pct`（不再解析 `bias_20` 字符串）；所有 `*Rate / *_pct / change_percent / profitRate / todayChange / dayChangeRate / changeRate / main_strength` 数值含义均为"%"数值。
2. 判断持仓状态用 `held`，不要用 `amount === null` 反推（null 现在有明确语义：观察中）。
3. 时间对齐：净值判断看 `meta.as_of` / `info.nav_as_of`；板块资金看 `sector_capital.capital_as_of`；策略信号看 `strategy_signals.*.as_of`；行情看各条目 `as_of`。不同区块日期不同是正常现象。
4. 均线排列判断现在有 `ma5/ma20/ma60/ma250` 四条；"跌破年线"类策略用 `ma250`（null=基金太年轻，无年线）。
5. RSI：本地口径 `rsi_6/rsi_12/rsi_24`（与用户 App 展示一致）；`strategy_signals.rsi` 是引擎的 RSI(14)，两者不要混用/互相验证。
6. 加仓减仓价位参考：布林中轨 `bband_mid`（=MA50）与 `ma20` 是两个价位，勿混用。
7. 信号决策用 `signal_enum`（buy/hold/sell），语义冲突时以 `reason` 为准。

---

## 八、验收自证结果（2026-09-18 实测，通过 MCP JSON-RPC 端点）

| 验收项 | 结果 |
|---|---|
| `days=5/30/90` 行数 | **5/30/90 行**，互不相同（已真正实现） |
| 百分比字段类型/单位唯一说法 | bias_20_pct=−3.67（数值）；description 全局声明 unit_convention |
| 跨日期数据可定位 | nav_as_of=2026-09-17（T-1）、capital_as_of=2026-09-18（T-0）、信号各自 as_of、行情各条目 as_of |
| market_index 全条目带 kind+as_of | 25/25 条目（index=12, stock=8, etf=2, futures=3），description 成员与实际一致 |
| 冷启动 AI 三问 | 净值=上一交易日（T-1，见 nav_as_of）；RSI=6/12/24 日（引擎另有 RSI14 已注明）；布林中轨=MA50（bband_mid_period=50），均仅凭 description 可答 |
| 回归 | vitest 86/86 通过（含新增 indicators 单测）；eslint 通过；typecheck 对本次改动文件 0 错误 |

实现文件：`server/mcp/tools/{fund-details,market-index,portfolio,explore-user-funds}.ts`、`server/utils/{indicators,mcpMeta,dataFetcher,market}.ts`、`shared/market.ts`（+单测 `server/utils/__tests__/indicators.test.ts`）。
