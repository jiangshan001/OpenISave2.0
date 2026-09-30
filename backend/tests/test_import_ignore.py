"""Import review: "Skip this import" versus "Ignore permanently"."""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.core.exceptions import ConflictError
from app.models.statement_import import ImportBatch, ImportIgnoredItem
from app.models.transaction import Transaction
from app.services.categorisation_service import CategorisationService
from app.services.import_staging import staging
from app.services.statement_import_service import StatementImportService
from tests import wechat_fixture as fx
from tests.conftest import make_account
from tests.test_api_end_to_end import build_client

ROOFOODS, ALEX, UNKNOWN = 0, 1, 2
ROWS = [fx.ROWS[0], fx.ROWS[1], fx.ROWS[13]]  # auto-classified, person transfer, unknown shop


@pytest.fixture(autouse=True)
def _clean_staging():
    staging.clear()
    yield
    staging.clear()


@pytest.fixture()
def importer(session, ledger):
    return StatementImportService(session, ledger, CategorisationService(session))


@pytest.fixture()
def maps(accounts):
    wechat = make_account(accounts, "WeChat", "CNY", "1000.00", account_type="ewallet")
    return {"零钱": wechat.id}


def count(session, model):
    return session.scalar(select(func.count()).select_from(model))


def statuses(plan):
    return [(row.status, row.ignore_state) for row in plan.rows]


def test_skip_is_for_this_import_only(importer, maps, session):
    token = importer.parse("wechat", fx.build(rows=ROWS), None).staged.token
    skip = [{"row_id": ALEX, "skip": True}, {"row_id": UNKNOWN, "skip": True}]
    plan = importer.preview(token, maps, skip)
    assert plan.rows[ALEX].status == "skipped" and plan.rows[ALEX].reason == "Skipped for this import"
    importer.confirm(token, maps, skip)
    assert count(session, ImportIgnoredItem) == 0
    again = importer.parse("wechat", fx.build(rows=ROWS), None)
    assert statuses(again) == [("duplicate", None), ("needs_review", None), ("needs_review", None)]


def test_ignore_permanently_is_remembered(importer, maps, session):
    token = importer.parse("wechat", fx.build(rows=ROWS), None).staged.token
    ignore = [{"row_id": ALEX, "ignore": True}, {"row_id": UNKNOWN, "skip": True}]
    plan = importer.preview(token, maps, ignore)
    assert statuses(plan)[ALEX] == ("ignored", "pending")
    assert plan.summary["to_ignore"] == 1 and plan.summary["needs_review"] == 0
    batch = importer.confirm(token, maps, ignore)
    assert batch.imported_count == 1

    item = session.scalars(select(ImportIgnoredItem)).one()
    assert (item.source, item.external_id) == ("wechat", fx.tid(2))
    assert item.import_batch_id == batch.id and item.raw_merchant == "Alex Test"
    assert item.amount_minor == 90000 and item.source_date == date(2026, 9, 18)
    assert count(session, Transaction) == 1  # the ignored row never reached the ledger

    again = importer.parse("wechat", fx.build(rows=ROWS), None)
    assert statuses(again) == [
        ("duplicate", None), ("ignored", "permanent"), ("needs_review", None)]
    assert again.rows[ALEX].reason == "Ignored permanently by you"
    assert again.summary["permanently_ignored"] == 1 and again.summary["needs_review"] == 1


def test_ignore_only_import_is_allowed_and_restore_brings_the_row_back(importer, maps, session):
    token = importer.parse("wechat", fx.build(rows=[fx.ROWS[1]]), None).staged.token
    batch = importer.confirm(token, maps, [{"row_id": 0, "ignore": True}])
    assert batch.imported_count == 0 and batch.ignored_count == 1
    [item] = importer.list_ignored("wechat")
    importer.restore_ignored(item.id)
    assert count(session, ImportIgnoredItem) == 0
    plan = importer.parse("wechat", fx.build(rows=[fx.ROWS[1]]), None)
    assert statuses(plan) == [("needs_review", None)]


def test_already_imported_wins_over_ignore(importer, maps, session):
    token = importer.parse("wechat", fx.build(rows=[fx.ROWS[0]]), None).staged.token
    importer.confirm(token, maps, [])
    token = importer.parse("wechat", fx.build(rows=[fx.ROWS[0]]), None).staged.token
    plan = importer.preview(token, maps, [{"row_id": 0, "ignore": True}])
    assert statuses(plan) == [("duplicate", None)]
    importer.confirm(token, maps, [{"row_id": 0, "ignore": True}])
    assert count(session, ImportIgnoredItem) == 0


def test_ignore_is_part_of_the_atomic_import(importer, maps, session, ledger, monkeypatch):
    token = importer.parse("wechat", fx.build(rows=ROWS), None).staged.token

    def boom(*_args, **_kwargs):
        raise RuntimeError("crash")

    monkeypatch.setattr(ledger, "create_transaction", boom)
    with pytest.raises(RuntimeError):
        importer.confirm(token, maps, [{"row_id": ALEX, "ignore": True}, {"row_id": UNKNOWN, "skip": True}])
    assert count(session, ImportIgnoredItem) == 0 and count(session, ImportBatch) == 0


def test_database_enforces_one_ignore_per_external_id(importer, maps, session, monkeypatch):
    token = importer.parse("wechat", fx.build(rows=[fx.ROWS[1]]), None).staged.token
    importer.confirm(token, maps, [{"row_id": 0, "ignore": True}])
    token = importer.parse("wechat", fx.build(rows=[fx.ROWS[1]]), None).staged.token
    monkeypatch.setattr(importer, "_ignored_ids", lambda *_: set())  # stale pre-check
    with pytest.raises(ConflictError):
        importer.confirm(token, maps, [{"row_id": 0, "ignore": True}])
    session.add(ImportIgnoredItem(source="wechat", external_id=fx.tid(2)))
    with pytest.raises(IntegrityError):
        session.flush()
    session.rollback()


def test_ignored_items_api(session):
    client = build_client(session)
    account = client.post("/api/v1/accounts", json={
        "name": "WeChat", "account_type": "ewallet", "currency": "CNY", "opening_balance_minor": 0,
    }).json()
    headers = {"Content-Type": "application/octet-stream"}
    preview = client.post("/api/v1/imports/wechat/parse", content=fx.build(rows=[fx.ROWS[1]]),
                          headers=headers).json()
    body = {"mappings": {"零钱": account["id"]}, "overrides": [{"row_id": 0, "ignore": True}]}
    planned = client.post(f"/api/v1/imports/sessions/{preview['token']}/preview", json=body).json()
    assert planned["rows"][0]["ignore_state"] == "pending"
    assert planned["summary"]["to_ignore"] == 1
    assert client.post(f"/api/v1/imports/sessions/{preview['token']}/confirm", json=body).status_code == 201

    items = client.get("/api/v1/imports/ignored?source=wechat").json()
    assert len(items) == 1 and items[0]["external_id"] == fx.tid(2)
    assert items[0]["raw_merchant"] == "Alex Test" and items[0]["source_date"] == "2026-09-18"
    again = client.post("/api/v1/imports/wechat/parse", content=fx.build(rows=[fx.ROWS[1]]),
                        headers=headers).json()
    assert again["rows"][0]["status"] == "ignored" and again["rows"][0]["ignore_state"] == "permanent"

    assert client.delete(f"/api/v1/imports/ignored/{items[0]['id']}").status_code == 204
    assert client.get("/api/v1/imports/ignored").json() == []
    assert client.delete(f"/api/v1/imports/ignored/{items[0]['id']}").status_code == 404
