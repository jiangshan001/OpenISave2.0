"""WeChat Pay statement parser: layout detection, exact amounts, ids, time zone."""

from __future__ import annotations

import os
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path

import pytest

from app.importers import UnsupportedStatementError
from app.importers.base import Movement
from app.importers.wechat import WeChatStatementImporter, parse_amount, parse_id
from tests import wechat_fixture as fx

PARSER = WeChatStatementImporter()


def parse(**kwargs):
    return PARSER.parse(fx.build(**kwargs))


def test_header_found_after_the_preamble():
    parsed = parse()
    assert parsed.header_row == len(fx.PREAMBLE) + 1 == 18
    assert len(parsed.rows) == len(fx.ROWS) and parsed.errors == []


@pytest.mark.parametrize("preamble", [[], [["说明"]] * 3, [["x"]] * 40])
def test_header_detection_does_not_depend_on_row_number(preamble):
    parsed = parse(preamble=preamble)
    assert parsed.header_row == len(preamble) + 1
    assert len(parsed.rows) == len(fx.ROWS)


def test_header_may_be_on_a_later_sheet_and_full_width():
    header = [h.replace("(", "（").replace(")", "）") for h in fx.HEADER]
    parsed = parse(sheet_first="说明", header=header)
    assert len(parsed.rows) == len(fx.ROWS)


def test_missing_required_column_is_rejected():
    header = [h for h in fx.HEADER if h != "交易单号"]
    rows = [r[:8] + r[9:] for r in fx.ROWS]
    with pytest.raises(UnsupportedStatementError, match="交易单号"):
        parse(header=header, rows=rows)


def test_non_statement_files_are_rejected():
    with pytest.raises(UnsupportedStatementError, match="xlsx"):
        PARSER.parse("交易时间,交易类型\n".encode("utf-8"))
    with pytest.raises(UnsupportedStatementError, match="columns"):
        parse(header=["a", "b", "c"], rows=[])


def test_amounts_are_exact_minor_units():
    rows = {r.external_id: r for r in parse().rows}
    assert rows[fx.tid(1)].amount_minor == 19093  # float cell 190.93
    assert rows[fx.tid(3)].amount_minor == 123450  # 1234.5
    assert rows[fx.tid(7)].amount_minor == 5000  # text "¥50.00"
    assert rows[fx.tid(5)].amount_minor == 8888
    assert all(isinstance(r.amount_minor, int) for r in rows.values())


@pytest.mark.parametrize(
    "value, expected",
    [(190.93, 19093), (0.07, 7), (1e3, 100000), ("1,234.56", 123456), (Decimal("9.10"), 910)],
)
def test_parse_amount(value, expected):
    assert parse_amount(value) == expected


@pytest.mark.parametrize("value", [0.1 + 0.2, "12.345", "abc", 0, -5, None, ""])
def test_parse_amount_rejects_imprecise_or_invalid(value):
    with pytest.raises(ValueError):
        parse_amount(value)


def test_transaction_ids_stay_strings():
    parsed = parse()
    ids = [r.external_id for r in parsed.rows]
    assert ids[0] == fx.tid(1) and len(ids[0]) == 32
    assert all(isinstance(i, str) for i in ids)
    assert parse_id("\t4200000000000000000000000000001\t") == "4200000000000000000000000000001"


def test_numeric_transaction_id_is_refused_not_rounded():
    bad = list(fx.ROWS[0])
    bad[8] = 4200000000000000000000000000001  # Excel number: precision already lost
    parsed = parse(rows=[bad, fx.ROWS[1]])
    assert len(parsed.rows) == 1
    assert parsed.errors[0].row_number == 19 and "number" in parsed.errors[0].message


def test_times_are_china_time_not_local_time():
    rows = {r.external_id: r for r in parse().rows}
    late = rows[fx.tid(15)]  # 2026-07-01 01:52:37 in Shanghai = 30 Jun 17:52 UTC
    assert late.occurred_at.utcoffset() == timedelta(hours=8)
    assert late.source_date == date(2026, 7, 1)
    assert late.occurred_at.isoformat() == "2026-07-01T01:52:37+08:00"


def test_blank_and_footer_rows_are_skipped():
    rows = [fx.ROWS[0], [None] * 11, ["", "", "", "", "", "", "", "", "", "", ""], ["备注：以上为全部"]]
    parsed = parse(rows=rows)
    assert len(parsed.rows) == 1 and parsed.errors == []


def test_movement_interpretation():
    rows = {int(r.external_id[4:]): r for r in parse().rows}
    assert rows[1].movement == Movement.EXPENSE and rows[1].source_label == "零钱"
    assert rows[3].source_label == fx.BOC
    assert rows[4].movement == Movement.INCOME and rows[4].source_label == "零钱"
    assert (rows[8].movement, rows[8].source_label, rows[8].dest_label) == (
        Movement.TRANSFER, fx.CMB, "零钱")
    assert (rows[9].source_label, rows[9].dest_label) == ("零钱", fx.CMB)
    assert (rows[10].source_label, rows[10].dest_label) == ("零钱", "零钱通")
    assert (rows[11].movement, rows[11].dest_label) == (Movement.TRANSFER, "招商银行信用卡(5678)")
    assert rows[12].movement == Movement.IGNORED
    assert rows[13].movement == Movement.REVIEW and "Refund" in rows[13].review_reason
    assert rows[15].movement == Movement.IGNORED


def test_transfer_message_is_separated_from_product():
    rows = {int(r.external_id[4:]): r for r in parse().rows}
    assert rows[2].note == "8月课时费" and rows[2].product == ""
    assert rows[3].remark == "已优惠¥3.81"


SAMPLE = os.environ.get("OPENISAVE_WECHAT_SAMPLE")


@pytest.mark.skipif(not SAMPLE, reason="set OPENISAVE_WECHAT_SAMPLE to a real .xlsx to validate")
def test_real_statement_sample_parses():
    """Structural checks only; the sample is read in place and never copied."""
    parsed = PARSER.parse(Path(SAMPLE).read_bytes())
    assert parsed.rows and not parsed.errors
    assert all(isinstance(r.external_id, str) and len(r.external_id) >= 20 for r in parsed.rows)
    assert all(r.occurred_at.utcoffset() == timedelta(hours=8) for r in parsed.rows)
    assert len({r.external_id for r in parsed.rows}) == len(parsed.rows)
