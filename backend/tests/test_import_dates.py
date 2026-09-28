"""Regression: an imported WeChat row keeps its Asia/Shanghai calendar date.

2026-09-12 01:30 in Beijing is 2026-09-11 18:30 in London. The row must be
filed under 12 Sep in the ledger, budgets, reports and the heatmap, whatever
time zone the computer runs in.
"""

from __future__ import annotations

import os
import subprocess
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import pytest
from sqlalchemy import select

from app.core.money import to_minor
from app.importers.base import source_calendar_date
from app.importers.wechat import CHINA_TZ, WeChatStatementImporter, parse_time
from app.models.statement_import import ExternalTransactionRef
from app.models.transaction import Transaction
from app.services.activity_service import ActivityService
from app.services.categorisation_service import CategorisationService
from app.services.import_staging import staging
from app.services.statement_import_service import StatementImportService
from tests import wechat_fixture as fx
from tests.conftest import category_id, make_account

BACKEND = Path(__file__).resolve().parents[1]
LATE_NIGHT = fx.row(1, "2026-09-12 01:30:00", "商户消费", "ROOFOODS LTD", "x", "支出", 30, "零钱", "支付成功")


def test_source_date_uses_the_statement_zone_not_utc_or_local():
    beijing = datetime(2026, 9, 12, 1, 30, tzinfo=CHINA_TZ)
    assert source_calendar_date(beijing, CHINA_TZ) == date(2026, 9, 12)
    assert beijing.astimezone(timezone(timedelta(hours=1))).date() == date(2026, 9, 11)  # London
    assert beijing.astimezone(timezone.utc).date() == date(2026, 9, 11)
    with pytest.raises(ValueError):
        source_calendar_date(datetime(2026, 9, 12, 1, 30), CHINA_TZ)  # naive: refused


@pytest.mark.parametrize(
    "cell",
    [
        datetime(2026, 9, 12, 1, 30),  # naive Excel cell: statement wall-clock time
        "2026-09-12 01:30:00",
        "2026/09/12 01:30",
        datetime(2026, 9, 11, 17, 30, tzinfo=timezone.utc),  # same instant, UTC-aware
        datetime(2026, 9, 11, 18, 30, tzinfo=timezone(timedelta(hours=1))),  # London BST
    ],
)
def test_every_time_representation_lands_on_the_china_date(cell):
    instant = parse_time(cell)
    assert instant.utcoffset() == timedelta(hours=8)
    assert instant.isoformat() == "2026-09-12T01:30:00+08:00"
    assert source_calendar_date(instant, CHINA_TZ) == date(2026, 9, 12)


def test_parsed_row_carries_source_date_and_zone():
    row = WeChatStatementImporter().parse(fx.build(rows=[LATE_NIGHT])).rows[0]
    assert row.source_date == date(2026, 9, 12)
    assert row.source_timezone == "Asia/Shanghai"
    assert row.occurred_at.isoformat() == "2026-09-12T01:30:00+08:00"


_CHILD = r"""
import sys, time, datetime
sys.path.insert(0, sys.argv[1])
from tests import wechat_fixture as fx
from app.importers.wechat import WeChatStatementImporter
row = fx.row(1, "2026-09-12 01:30:00", "商户消费", "M", "x", "支出", 30, "零钱", "支付成功")
parsed = WeChatStatementImporter().parse(fx.build(rows=[row])).rows[0]
local = datetime.datetime(2026, 9, 11, 17, 30, tzinfo=datetime.timezone.utc).astimezone()
print(parsed.source_date.isoformat(), parsed.occurred_at.isoformat(), local.utcoffset().total_seconds())
"""


@pytest.mark.parametrize(
    "tz, local_offset_hours",
    [("GMT0BST", 1), ("UTC0", 0), ("PST8PDT", -7), ("CST-8", 8)],
)
def test_parsing_is_independent_of_the_computer_time_zone(tz, local_offset_hours):
    """Run the parser in a fresh process whose local zone is London, UTC, LA, China."""
    env = {**os.environ, "TZ": tz, "PYTHONIOENCODING": "utf-8"}
    out = subprocess.run(
        [sys.executable, "-c", _CHILD, str(BACKEND)],
        env=env, capture_output=True, text=True, encoding="utf-8", check=True, cwd=BACKEND,
    ).stdout.split()
    source_date, occurred_at, offset = out[0], out[1], float(out[2])
    assert offset == local_offset_hours * 3600  # the zone really took effect
    assert source_date == "2026-09-12"
    assert occurred_at == "2026-09-12T01:30:00+08:00"


# ------------------------------------------- ledger, budget, report, heatmap


@pytest.fixture()
def importer(session, ledger):
    staging.clear()
    yield StatementImportService(session, ledger, CategorisationService(session))
    staging.clear()


def test_month_boundary_follows_the_statement_calendar(importer, accounts, session, budgets, reports):
    wechat = make_account(accounts, "WeChat", "CNY", "0.00", account_type="ewallet")
    rows = [
        # 30 Sep 23:30 Beijing (30 Sep 16:30 London): September.
        fx.row(1, "2026-09-30 23:30:00", "商户消费", "ROOFOODS LTD", "a", "支出", 10, "零钱", "支付成功"),
        # 1 Oct 00:30 Beijing = 30 Sep 17:30 in London: must be OCTOBER.
        fx.row(2, "2026-10-01 00:30:00", "商户消费", "ROOFOODS LTD", "b", "支出", 20, "零钱", "支付成功"),
    ]
    token = importer.parse("wechat", fx.build(rows=rows), None).staged.token
    plan = importer.preview(token, {"零钱": wechat.id}, [])
    assert [r.source.source_date for r in plan.rows] == [date(2026, 9, 30), date(2026, 10, 1)]
    food = category_id(session, "Food")
    budgets.replace_period(2026, 10, [{"category_id": food, "amount_minor": to_minor("100", "CNY")}])
    importer.confirm(token, {"零钱": wechat.id}, [])

    dates = {t.external_transaction_id: t.transaction_date for t in session.scalars(select(Transaction))}
    assert dates == {fx.tid(1): date(2026, 9, 30), fx.tid(2): date(2026, 10, 1)}
    assert reports.monthly(2026, 9)["summary"]["expense_minor"] == 1000
    assert reports.monthly(2026, 10)["summary"]["expense_minor"] == 2000
    assert budgets.get_period(2026, 10).lines[0].actual_minor == 2000

    days = ActivityService(session).daily_activity(today=date(2026, 10, 31), months=2)
    expense_days = {d["date"]: d["amount_minor"] for d in days["series"]["expense"]["days"]}
    assert expense_days["2026-09-30"] == 1000 and expense_days["2026-10-01"] == 2000

    ref = session.scalar(select(ExternalTransactionRef).where(ExternalTransactionRef.external_id == fx.tid(2)))
    assert ref.source_date == date(2026, 10, 1) and ref.source_timezone == "Asia/Shanghai"
    assert ref.occurred_at == "2026-10-01T00:30:00+08:00"
