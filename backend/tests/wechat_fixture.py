"""Synthetic WeChat Pay statements for tests.

Everything here is invented: names, amounts and transaction ids. The layout
mirrors a real export -- a free-text preamble of variable length, then the
header row, then data -- so the parser's header detection is exercised.
Built in memory; no statement file is ever committed.
"""

from __future__ import annotations

from datetime import datetime
from io import BytesIO

from openpyxl import Workbook

HEADER = [
    "交易时间", "交易类型", "交易对方", "商品", "收/支", "金额(元)",
    "支付方式", "当前状态", "交易单号", "商户单号", "备注",
]

PREAMBLE = [
    ["微信支付账单明细"],
    ["微信昵称：[测试用户]"],
    ["起始时间：[2026-06-26 00:00:00] 终止时间：[2026-09-27 23:59:59]"],
    ["导出类型：[全部账单]"],
    ["导出时间：[2026-09-27 01:23:56]"],
    [],
    ["共15笔记录"],
    ["收入：4笔 1000.00元"],
    ["支出：9笔 3000.00元"],
    ["中性交易：2笔 0.00元"],
    ["注："],
    ["1. 充值/提现/理财通购买/零钱通存取/信用卡还款等交易，将计入中性交易"],
    ["2. 本明细仅展示当前账单中的交易，不包括已删除的记录"],
    ["3. 本明细仅供个人对账使用"],
    ["4. 此处仅为示例文字"],
    [],
    ["----------------------微信支付账单明细列表--------------------"],
]


def tid(n: int) -> str:
    """A 32-digit synthetic transaction id (too long for a float)."""
    return f"4200{n:028d}"


def row(n, when, kind, who, product, direction, amount, method, status, remark="/"):
    return [
        datetime.fromisoformat(when), kind, who, product, direction, amount,
        method, status, tid(n), f"M{n:010d}", remark,
    ]


BOC = "中国银行储蓄卡(8080)"
CMB = "招商银行(1234)"

#: (row id in the parsed statement) -> scenario, for readable assertions.
ROWS = [
    row(1, "2026-09-19 12:00:00", "商户消费", "ROOFOODS LTD", "txn_synthetic01", "支出", 190.93, "零钱", "支付成功"),
    row(2, "2026-09-18 20:10:00", "转账", "Alex Test", "转账备注:8月课时费", "支出", 900, "零钱", "对方已收钱"),
    row(3, "2026-09-17 09:30:00", "商户消费", "同程旅行", "国际机票", "支出", 1234.5, BOC, "支付成功", "已优惠¥3.81"),
    row(4, "2026-09-16 18:00:00", "转账", "Friend Test", "转账备注:微信转账", "收入", 200, "/", "已存入零钱"),
    row(5, "2026-09-15 08:00:00", "微信红包", "Friend B", "/", "收入", 88.88, "/", "已存入零钱"),
    row(6, "2026-09-14 10:00:00", "商户消费", "哔哩哔哩弹幕网", "高档充电连续包月", "支出", 25, "零钱", "支付成功"),
    row(7, "2026-09-13 11:00:00", "商户消费", "杭州深度求索人工智能", "DeepSeek-API服务", "支出", "¥50.00", "零钱", "支付成功"),
    row(8, "2026-09-12 12:00:00", "零钱充值", CMB, "/", "/", 500, CMB, "充值完成"),
    row(9, "2026-09-11 13:00:00", "零钱提现", CMB, "/", "/", 100, "零钱", "提现已到账"),
    row(10, "2026-09-10 14:00:00", "转入零钱通-来自零钱", "/", "/", "/", 300, "零钱", "支付成功"),
    row(11, "2026-09-09 15:00:00", "信用卡还款", "招商银行信用卡(5678)", "/", "支出", 400, "零钱", "支付成功"),
    row(12, "2026-09-08 16:00:00", "商户消费", "Closed Shop", "item", "支出", 30, "零钱", "已关闭"),
    row(13, "2026-09-07 17:00:00", "美团-退款", "美团", "/", "收入", 12.5, "/", "已存入零钱"),
    row(14, "2026-09-06 18:00:00", "商户消费", "Unknown Shop Ltd", "stuff", "支出", 66, "零钱", "支付成功"),
    row(15, "2026-07-01 01:52:37", "转账", "Returned Test", "转账备注:x", "支出", 10, "零钱", "对方已退还"),
]


def build(rows: list[list] | None = None, *, preamble: list[list] | None = None,
          header: list[str] | None = None, sheet_first: str | None = None) -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    if sheet_first:
        sheet.title = sheet_first
        sheet.append(["unrelated sheet"])
        sheet = workbook.create_sheet("账单")
    for line in PREAMBLE if preamble is None else preamble:
        sheet.append(line)
    sheet.append(header or HEADER)
    for data in ROWS if rows is None else rows:
        sheet.append(data)
    buffer = BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()
