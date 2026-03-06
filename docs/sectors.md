# 板块数据 API

本文档描述板块（行业）数据相关的接口，包括板块每日统计数据和量化决策信号。

## 目录

- [GET /sectors/stats](#get-sectorsstats) - 获取板块统计数据

---

## GET /sectors/stats

获取指定日期的所有板块统计数据，包含系统生成的量化决策信号。

### 请求

```http
GET /api/sectors/stats?date=2024-01-15
```

### 查询参数

| 参数 | 类型   | 必填 | 说明                  |
| ---- | ------ | ---- | --------------------- |
| date | string | 是   | 查询日期 (YYYY-MM-DD) |

### 响应

**成功 (200 OK)**

```json
[
  {
    "id": 1,
    "date": "2024-01-15",
    "sector": "semiconductor",
    "sectorName": "半导体",
    "changeRate": 2.35,
    "turnoverRate": 3.21,
    "volumeRatio": 5.67,
    "marketCap": 1500000000000,
    "capitalInflow": 2500000000,
    "diffVolumeRatio": 1.23,
    "diffTurnoverRate": 0.45,
    "signal": "主升浪",
    "signalCode": "up",
    "action": "持仓/加仓"
  }
]
```

### 字段说明

**板块统计对象**

| 字段             | 类型   | 说明                     |
| ---------------- | ------ | ------------------------ |
| id               | number | 记录ID                   |
| date             | string | 日期                     |
| sector           | string | 板块英文代码             |
| sectorName       | string | 板块中文名称             |
| changeRate       | number | 涨跌幅 (%)               |
| turnoverRate     | number | 换手率 (%)               |
| volumeRatio      | number | 成交额占比 (%)           |
| marketCap        | number | 总市值                   |
| capitalInflow    | number | 资金流入                 |
| diffVolumeRatio  | number | 成交额占比较昨日变化     |
| diffTurnoverRate | number | 换手率较昨日变化         |
| signal           | string | 信号描述（如"主升浪"）   |
| signalCode       | string | 信号代码（用于前端配色） |
| action           | string | 操作建议                 |

### 信号代码说明

| signalCode | 说明      | 推荐配色 |
| ---------- | --------- | -------- |
| up         | 上涨/买入 | 绿色     |
| down       | 下跌/卖出 | 红色     |
| top        | 高位/拥挤 | 橙色     |
| bottom     | 底部/筑底 | 蓝色     |
| neutral    | 震荡/中性 | 灰色     |

### 量化决策逻辑

系统基于以下多维指标生成决策信号：

1. **放量大跌** (坚决清仓)
   - 条件：涨跌幅 < -2.0% 且 换手率日差 > 1.0%

2. **极度拥挤/高位震荡** (减仓/持有)
   - 条件：成交额占比 > 10%

3. **冰点筑底** (左侧建仓)
   - 条件：换手率 < 1.0%

4. **无量阴跌** (空仓观望)
   - 条件：涨跌幅 < -2.0% 且 换手率在 1.0%-2.0% 之间

5. **主升浪** (持仓/加仓)
   - 条件：涨跌幅 > 0 且 成交额占比 3%-8% 且 换手率 > 2% 且 换手率日差 > 0

---

_文档版本: 1.1.0_
_最后更新: 2026-03-06_
