#!/usr/bin/env python3
"""基金助手 iOS App 开发用 Mock 服务器（模拟 Nuxt 后端接口，端口 8888）。

仅用于本地开发调试 iOS App，不依赖任何数据库。
用法：python3 mock_server.py
登录：任意用户名/密码（如 demo / demo）。
"""
import json
import math
import random
import threading
from datetime import date, datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

PORT = 8888
LOCK = threading.Lock()

# ---------------------------------------------------------------- 数据构造

TODAY = date.today()


def dstr(d: date) -> str:
    return d.strftime("%Y-%m-%d")


def now_str() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def iso_utc_now() -> str:
    """估值时间：与真实后端 toISOString() 一致，返回 UTC ISO 字符串"""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def gen_history(days: int, base: float, drift: float = 0.0003, vol: float = 0.012):
    """生成 days 个交易日（跳过周末）的净值随机漫步 + MA 线。"""
    rng = random.Random(42)
    dates, navs = [], []
    d, nav = TODAY, base
    while len(dates) < days:
        if d.weekday() < 5:
            nav *= 1 + rng.gauss(drift, vol)
            dates.append(d)
            navs.append(round(nav, 4))
        d -= timedelta(days=1)
    dates.reverse()
    navs.reverse()

    def ma(window):
        out = []
        for i in range(len(navs)):
            seg = navs[max(0, i - window + 1): i + 1]
            out.append(round(sum(seg) / len(seg), 4) if len(seg) == window else None)
        return out

    history = [
        {"date": dstr(dates[i]), "nav": navs[i],
         "ma5": ma(5)[i], "ma10": ma(10)[i], "ma20": ma(20)[i], "ma120": ma(120)[i]}
        for i in range(len(dates))
    ]
    return history


HISTORY = {
    "161725": gen_history(300, 1.85),
    "005827": gen_history(300, 2.66),
    "270042": gen_history(300, 0.94),
}

STOCKS = [
    {"stockCode": "600519", "stockName": "贵州茅台", "pct": 9.62, "price": 1456.00, "changePct": 1.23, "quoteDate": dstr(TODAY), "quoteTime": "15:00:02"},
    {"stockCode": "000858", "stockName": "五粮液", "pct": 8.15, "price": 132.50, "changePct": -0.86, "quoteDate": dstr(TODAY), "quoteTime": "15:00:02"},
    {"stockCode": "601318", "stockName": "中国平安", "pct": 6.44, "price": 58.32, "changePct": 0.41, "quoteDate": dstr(TODAY), "quoteTime": "15:00:02"},
    {"stockCode": "000333", "stockName": "美的集团", "pct": 4.88, "price": 78.16, "changePct": 2.05, "quoteDate": dstr(TODAY), "quoteTime": "15:00:02"},
    {"stockCode": "600036", "stockName": "招商银行", "pct": 4.31, "price": 41.20, "changePct": -1.12, "quoteDate": dstr(TODAY), "quoteTime": "15:00:02"},
]


def fees_for(code: str):
    return {
        "fundCode": code,
        "purchaseFee": "0.15%",
        "redemptionFees": [
            {"holdingPeriod": "0-6 天", "rate": "1.50%"},
            {"holdingPeriod": "7-364 天", "rate": "0.50%"},
            {"holdingPeriod": "365-729 天", "rate": "0.25%"},
            {"holdingPeriod": "730 天以上", "rate": "0.00%"},
        ],
        "managementFee": "1.20%/年",
        "custodyFee": "0.20%/年",
        "rawText": None,
    }

HOLDINGS = [
    {
        "code": "161725", "name": "招商中证白酒指数(LOF)A", "sector": "consumer", "attentionLevel": 3,
        "operationStrategy": "白酒板块波段操作，回撤超 8% 补仓",
        "shares": 12800.0, "costPrice": 1.6210, "yesterdayNav": 1.8532,
        "holdingAmount": 23720.96, "holdingProfitAmount": 2968.96, "holdingProfitRate": 14.32,
        "todayEstimateNav": 1.8861, "todayEstimateAmount": 24142.08, "percentageChange": 1.78,
        "todayEstimateUpdateTime": iso_utc_now(),
        "yesterdayChangeRate": 0.65, "yesterdayProfit": 152.83, "prevNav": 1.8412,
        "signals": {"base": "建仓", "rsi": "超卖反弹", "bollinger_bands": "中轨上方"},
        "bias20": 3.21,
        "pendingTransactions": [
            {"id": 101, "type": "buy", "status": "pending", "orderAmount": 2000.0, "orderShares": None,
             "orderDate": dstr(TODAY), "createdAt": now_str()},
        ],
        "recentTransactions": [
            {"id": 88, "type": "buy", "date": dstr(TODAY - timedelta(days=3)), "amount": 3000.0, "shares": 1623.28, "nav": 1.8481},
            {"id": 80, "type": "sell", "date": dstr(TODAY - timedelta(days=15)), "amount": 1500.0, "shares": 800.0, "nav": 1.8750},
        ],
        "fees": fees_for("161725"),
    },
    {
        "code": "005827", "name": "易方达蓝筹精选混合", "sector": "bluechip", "attentionLevel": 2,
        "operationStrategy": "长期定投，跌 5% 加仓一档",
        "shares": 6420.55, "costPrice": 2.4180, "yesterdayNav": 2.6612,
        "holdingAmount": 17085.30, "holdingProfitAmount": 1558.62, "holdingProfitRate": 10.05,
        "todayEstimateNav": 2.6375, "todayEstimateAmount": 16933.99, "percentageChange": -0.89,
        "todayEstimateUpdateTime": iso_utc_now(),
        "yesterdayChangeRate": -0.42, "yesterdayProfit": -71.86, "prevNav": 2.6724,
        "signals": {"base": "洗盘", "rsi": "中性", "bollinger_bands": "中轨附近"},
        "bias20": -1.05,
        "pendingTransactions": [],
        "recentTransactions": [
            {"id": 76, "type": "buy", "date": dstr(TODAY - timedelta(days=7)), "amount": 1000.0, "shares": 375.80, "nav": 2.6610},
        ],
        "fees": fees_for("005827"),
    },
    {
        "code": "270042", "name": "广发纳斯达克100ETF联接(QDII)A", "sector": "us_stock", "attentionLevel": 1,
        "operationStrategy": None,
        "shares": None, "costPrice": None, "yesterdayNav": 0.9412,
        "holdingAmount": None, "holdingProfitAmount": None, "holdingProfitRate": None,
        "todayEstimateNav": None, "todayEstimateAmount": None, "percentageChange": None,
        "todayEstimateUpdateTime": None,
        "yesterdayChangeRate": 1.02, "yesterdayProfit": None, "prevNav": 0.9317,
        "signals": {"rsi": "偏多"},
        "bias20": None,
        "pendingTransactions": [],
        "recentTransactions": [],
        "fees": fees_for("270042"),
    },
]

SUMMARY = {
    "totalHoldingAmount": 40806.26,
    "totalEstimateAmount": 41076.07,
    "totalProfitLoss": 4527.58,
    "totalPercentageChange": 0.57,
    "count": 3,
    "cash": 5230.00,
    "totalAssets": 46306.07,
    "staleCount": 1,
    "yesterdayProfit": 80.97,
    "yesterdayProfitRate": 0.20,
}

FUND_PROFITS = {
    "funds": [
        {"code": "161725", "name": "招商中证白酒指数(LOF)A", "sector": "消费", "status": "held",
         "firstTradeDate": "2025-03-12", "lastTradeDate": dstr(TODAY - timedelta(days=3)),
         "shares": 12800.0, "costPrice": 1.6210, "totalCost": 20748.80, "holdingAmount": 23720.96,
         "dayProfit": 152.83, "dayProfitRate": 0.65, "estimateProfit": 421.12,
         "holdingProfit": 2968.96, "holdingProfitRate": 14.32, "totalProfit": 3518.42, "latestNav": 1.8532},
        {"code": "005827", "name": "易方达蓝筹精选混合", "sector": "蓝筹", "status": "held",
         "firstTradeDate": "2025-01-20", "lastTradeDate": dstr(TODAY - timedelta(days=7)),
         "shares": 6420.55, "costPrice": 2.4180, "totalCost": 15520.85, "holdingAmount": 17085.30,
         "dayProfit": -71.86, "dayProfitRate": -0.42, "estimateProfit": -151.31,
         "holdingProfit": 1558.62, "holdingProfitRate": 10.05, "totalProfit": 2018.60, "latestNav": 2.6612},
        {"code": "110022", "name": "易方达消费行业股票", "sector": "消费", "status": "sold",
         "firstTradeDate": "2024-06-01", "lastTradeDate": "2025-02-10",
         "shares": None, "costPrice": None, "totalCost": None, "holdingAmount": None,
         "dayProfit": None, "dayProfitRate": None, "estimateProfit": None,
         "holdingProfit": None, "holdingProfitRate": None, "totalProfit": 3120.45, "latestNav": 4.1205},
    ],
    "summary": {"fundCount": 3, "heldCount": 2, "soldCount": 1,
                "totalHoldingAmount": 40806.26, "totalProfit": 8657.47},
}

DCA_PLANS = [
    {"id": 1, "fundCode": "161725", "fundName": "招商中证白酒指数(LOF)A", "amount": 500.0,
     "frequency": "weekly", "anchorDay": 3, "enabled": True,
     "nextExecutionDate": dstr(TODAY + timedelta(days=2)), "lastExecutionDate": dstr(TODAY - timedelta(days=5))},
    {"id": 2, "fundCode": "005827", "fundName": "易方达蓝筹精选混合", "amount": 300.0,
     "frequency": "daily", "anchorDay": None, "enabled": False,
     "nextExecutionDate": dstr(TODAY + timedelta(days=1)), "lastExecutionDate": dstr(TODAY - timedelta(days=20))},
]

USER = {"id": 1, "username": "demo", "role": "admin", "aiMode": "off",
        "aiSystemPrompt": "", "availableCash": 5230.00}

DICTS = {
    "sectors": [
        {"id": 1, "dictType": "sectors", "label": "消费", "value": "consumer", "sortOrder": 1, "createdAt": "2025-11-07T13:28:21.275Z"},
        {"id": 2, "dictType": "sectors", "label": "蓝筹", "value": "bluechip", "sortOrder": 2, "createdAt": "2025-11-07T13:28:21.275Z"},
        {"id": 3, "dictType": "sectors", "label": "美股", "value": "us_stock", "sortOrder": 3, "createdAt": "2025-11-07T13:28:21.275Z"},
        {"id": 4, "dictType": "sectors", "label": "医药", "value": "pharma", "sortOrder": 4, "createdAt": "2025-11-07T13:28:21.275Z"},
    ],
}

MARKET = {
    "sh000001": {"code": "sh000001", "name": "上证指数", "value": 3145.77, "changeAmount": 12.35, "changeRate": 0.39, "time": "15:00:02", "datetime": None, "as_of": dstr(TODAY), "delayed": False, "chartData": []},
    "sz399001": {"code": "sz399001", "name": "深证成指", "value": 9876.54, "changeAmount": -45.21, "changeRate": -0.46, "time": "15:00:02", "datetime": None, "as_of": dstr(TODAY), "delayed": False, "chartData": []},
    "sz399006": {"code": "sz399006", "name": "创业板指", "value": 2035.18, "changeAmount": 8.63, "changeRate": 0.43, "time": "15:00:02", "datetime": None, "as_of": dstr(TODAY), "delayed": False, "chartData": []},
    "sh000300": {"code": "sh000300", "name": "沪深300", "value": 3688.90, "changeAmount": 5.72, "changeRate": 0.16, "time": "15:00:02", "datetime": None, "as_of": dstr(TODAY), "delayed": False, "chartData": []},
    "hkHSI": {"code": "hkHSI", "name": "恒生指数", "value": 20132.45, "changeAmount": 156.30, "changeRate": 0.78, "time": "16:08:00", "datetime": None, "as_of": dstr(TODAY), "delayed": False, "chartData": []},
    "usIXIC": {"code": "usIXIC", "name": "纳斯达克", "value": 16735.02, "changeAmount": -102.55, "changeRate": -0.61, "time": "04:00:00", "datetime": None, "as_of": dstr(TODAY), "delayed": False, "chartData": []},
    "usDJI": {"code": "usDJI", "name": "道琼斯", "value": 42314.66, "changeAmount": -58.20, "changeRate": -0.14, "time": "04:00:00", "datetime": None, "as_of": dstr(TODAY), "delayed": True, "chartData": []},
}

NEXT_TX_ID = [200]


def detail_for(code: str):
    h = next((x for x in HOLDINGS if x["code"] == code), None)
    hist = HISTORY.get(code)
    latest = hist[-1]["nav"] if hist else 1.0
    return {
        "code": code,
        "name": h["name"] if h else "未知基金",
        "sector": h["sector"] if h else None,
        "fundType": "qdii_lof" if code == "270042" else "open",
        "yesterdayNav": latest,
        "todayEstimateNav": h["todayEstimateNav"] if h else None,
        "percentageChange": h["percentageChange"] if h else None,
        "todayEstimateUpdateTime": h["todayEstimateUpdateTime"] if h else None,
        "stockHoldings": {
            "reportDate": dstr(TODAY - timedelta(days=45)),
            "coverage": 33.4,
            "stocks": STOCKS,
        },
        "shares": h["shares"] if h else None,
        "costPrice": h["costPrice"] if h else None,
        "holdingAmount": h["holdingAmount"] if h else None,
        "holdingProfitAmount": h["holdingProfitAmount"] if h else None,
        "holdingProfitRate": h["holdingProfitRate"] if h else None,
        "fees": fees_for(code),
    }


def transactions_for(code: str):
    return [
        {"id": 88, "type": "buy", "status": "confirmed", "orderDate": dstr(TODAY - timedelta(days=3)),
         "confirmedAmount": "3000.0000", "confirmedShares": "1623.2800", "confirmedNav": "1.8481", "note": "手动买入"},
        {"id": 80, "type": "sell", "status": "confirmed", "orderDate": dstr(TODAY - timedelta(days=15)),
         "confirmedAmount": "1500.0000", "confirmedShares": "800.0000", "confirmedNav": "1.8750", "note": "止盈卖出"},
        {"id": 76, "type": "buy", "status": "confirmed", "orderDate": dstr(TODAY - timedelta(days=7)),
         "confirmedAmount": "1000.0000", "confirmedShares": "375.8000", "confirmedNav": "2.6610", "note": "定投"},
    ]


# ---------------------------------------------------------------- HTTP 服务

class MockHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print(f"[mock] {self.command} {self.path}")

    # --- 工具方法 ---
    def _send(self, status: int, payload=None, extra_headers=None):
        body = b"" if payload is None else json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        for k, v in (extra_headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if body:
            self.wfile.write(body)

    def _body(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            return {}
        try:
            return json.loads(self.rfile.read(length))
        except json.JSONDecodeError:
            return {}

    # --- 路由 ---
    def do_GET(self):
        path, query = urlparse(self.path).path, parse_qs(urlparse(self.path).query)

        if path == "/api/auth/me":
            return self._send(200, USER)
        if path == "/api/dicts/all":
            return self._send(200, DICTS)
        if path == "/api/market/":
            return self._send(200, MARKET)
        if path.startswith("/api/fund/holdings/") and path.endswith("/detail"):
            return self._send(200, detail_for(path.split("/")[4]))
        if path.startswith("/api/fund/holdings/") and path.endswith("/history"):
            code = path.split("/")[4]
            return self._send(200, {
                "history": HISTORY.get(code, []),
                "signals": [{"id": 1, "fundCode": code, "strategyName": "rsi", "signal": "中性",
                             "reason": "RSI 处于 45-55 中性区间", "latestDate": dstr(TODAY), "latestClose": HISTORY.get(code, [{}])[-1]["nav"]}],
                "transactions": transactions_for(code),
            })
        if path.startswith("/api/fund/holdings/") and path.endswith("/performance"):
            return self._send(200, {"1m": 3.42, "3m": 8.15, "6m": 12.66, "1y": 21.30, "2y": -4.21, "5y": 35.88, "all": 62.5})
        if path == "/api/fund/holdings/":
            with LOCK:
                return self._send(200, {"holdings": HOLDINGS, "summary": SUMMARY})
        if path == "/api/user/fund-profits":
            return self._send(200, FUND_PROFITS)
        if path == "/api/fund/dca-plans":
            return self._send(200, DCA_PLANS)
        return self._send(404, {"statusCode": 404, "statusMessage": f"未实现的 GET 接口：{path}"})

    def do_POST(self):
        path = urlparse(self.path).path
        body = self._body()

        if path == "/api/auth/login":
            return self._send(200, {"user": USER, "token": "mock-token"}, extra_headers={
                "Set-Cookie": "auth-token=mock-access; Path=/; HttpOnly; SameSite=Lax, "
                              "auth-refresh-token=mock-refresh; Path=/; HttpOnly; SameSite=Lax",
            })
        if path == "/api/auth/refresh":
            return self._send(200, USER, extra_headers={
                "Set-Cookie": "auth-token=mock-access; Path=/; HttpOnly; SameSite=Lax",
            })
        if path == "/api/auth/logout":
            return self._send(204)
        if path == "/api/fund/transactions":
            with LOCK:
                NEXT_TX_ID[0] += 1
                record = {"id": NEXT_TX_ID[0], "fundCode": body.get("fundCode"),
                          "type": body.get("type"), "status": "pending",
                          "orderAmount": body.get("amount"), "orderShares": body.get("shares"),
                          "orderDate": body.get("date")}
                for h in HOLDINGS:
                    if h["code"] == record["fundCode"]:
                        h.setdefault("pendingTransactions", []).append(
                            {**record, "createdAt": now_str()})
            return self._send(200, {"statusText": "交易请求已记录", "record": record, "message": None,
                                    "count": None, "success": None, "failed": None, "total": None, "skipped": None})
        if path == "/api/fund/convert":
            return self._send(200, {"statusText": None, "record": None, "message": "转换申请已提交",
                                    "count": None, "success": None, "failed": None, "total": None, "skipped": None})
        if path == "/api/fund/holdings/":
            return self._send(200, {"statusText": None, "record": None, "message": "添加成功",
                                    "count": None, "success": None, "failed": None, "total": None, "skipped": None})
        if path == "/api/fund/utils/refresh-estimates":
            with LOCK:
                for h in HOLDINGS:
                    h["todayEstimateUpdateTime"] = iso_utc_now()
            return self._send(200, {"statusText": None, "record": None, "message": "刷新完成",
                                    "count": None, "success": 2, "failed": 0, "total": 2, "skipped": 1})
        if path.endswith("/run-strategies"):
            return self._send(200, {"statusText": None, "record": None, "message": "策略执行完成：成功 3 个",
                                    "count": None, "success": 3, "failed": 0, "total": None, "skipped": None})
        if path.endswith("/sync-history"):
            return self._send(200, {"statusText": None, "record": None, "message": "同步完成，更新 120 条净值",
                                    "count": 120, "success": None, "failed": None, "total": None, "skipped": None})
        if path == "/api/fund/dca-plans":
            with LOCK:
                NEXT_TX_ID[0] += 1
                DCA_PLANS.append({"id": NEXT_TX_ID[0], "fundCode": body.get("fundCode", ""),
                                  "fundName": "新基金", "amount": body.get("amount", 0),
                                  "frequency": body.get("frequency", "monthly"),
                                  "anchorDay": body.get("anchorDay"), "enabled": True,
                                  "nextExecutionDate": dstr(TODAY + timedelta(days=1)),
                                  "lastExecutionDate": None})
            return self._send(200, {"statusText": "创建成功", "record": None, "message": None,
                                    "count": None, "success": None, "failed": None, "total": None, "skipped": None})
        return self._send(404, {"statusCode": 404, "statusMessage": f"未实现的 POST 接口：{path}"})

    def do_PUT(self):
        path = urlparse(self.path).path
        if path.startswith("/api/fund/transactions/") and path.endswith("/approve"):
            return self._send(200, {"statusText": None, "record": None, "message": "已确认，转为待处理状态",
                                    "count": None, "success": None, "failed": None, "total": None, "skipped": None})
        if path.startswith("/api/fund/dca-plans/"):
            return self._send(200, {"statusText": "更新成功", "record": None, "message": None,
                                    "count": None, "success": None, "failed": None, "total": None, "skipped": None})
        if path.startswith("/api/funds/") and path.endswith("/sector"):
            return self._send(200, {"statusText": None, "record": None, "message": "板块已更新",
                                    "count": None, "success": None, "failed": None, "total": None, "skipped": None})
        return self._send(404, {"statusCode": 404, "statusMessage": f"未实现的 PUT 接口：{path}"})

    def do_DELETE(self):
        path = urlparse(self.path).path
        if path.startswith("/api/fund/transactions/"):
            tx_id = int(path.rsplit("/", 1)[1])
            with LOCK:
                for h in HOLDINGS:
                    h["pendingTransactions"] = [t for t in h.get("pendingTransactions", []) if t["id"] != tx_id]
            return self._send(204)
        if path.startswith("/api/fund/dca-plans/"):
            plan_id = int(path.rsplit("/", 1)[1])
            with LOCK:
                DCA_PLANS[:] = [p for p in DCA_PLANS if p["id"] != plan_id]
            return self._send(200, {"statusText": "已删除", "record": None, "message": None,
                                    "count": None, "success": None, "failed": None, "total": None, "skipped": None})
        return self._send(404, {"statusCode": 404, "statusMessage": f"未实现的 DELETE 接口：{path}"})


if __name__ == "__main__":
    server = ThreadingHTTPServer(("0.0.0.0", PORT), MockHandler)
    print(f"Mock 服务器已启动：http://localhost:{PORT}（登录任意用户名/密码）")
    server.serve_forever()
