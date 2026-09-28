"""WeChat statement import: mapping, rules, duplicates, atomicity, reporting."""

from __future__ import annotations

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.core.exceptions import ConflictError, ValidationError
from app.core.money import to_minor
from app.db.seed import seed_categorisation_rules
from app.models.statement_import import (
    CategorisationRule,
    ExternalTransactionRef,
    ImportAccountMapping,
    ImportBatch,
)
from app.models.transaction import Transaction
from app.services.categorisation_service import CategorisationService
from app.services.import_staging import staging
from app.services.statement_import_service import StatementImportService
from tests import wechat_fixture as fx
from tests.conftest import category_id, make_account
from tests.test_api_end_to_end import build_client

# Row ids in the parsed statement are 0-based positions in fx.ROWS.
ROOFOODS, ALEX, FLIGHT, FRIEND, RED_PACKET, BILIBILI, DEEPSEEK = range(7)
TOP_UP, WITHDRAW, FUND_IN, CARD_REPAY, CLOSED, REFUND, UNKNOWN, RETURNED = range(7, 15)


@pytest.fixture(autouse=True)
def _clean_staging():
    staging.clear()
    yield
    staging.clear()


@pytest.fixture()
def rules(session) -> CategorisationService:
    seed_categorisation_rules(session)
    session.commit()
    return CategorisationService(session)


@pytest.fixture()
def importer(session, ledger, rules) -> StatementImportService:
    return StatementImportService(session, ledger, rules)


@pytest.fixture()
def accts(accounts):
    return {
        "wechat": make_account(accounts, "WeChat", "CNY", "1000.00", account_type="ewallet"),
        "boc": make_account(accounts, "中国银行", "CNY", "5000.00"),
        "cmb": make_account(accounts, "招商银行", "CNY", "5000.00"),
        "card": make_account(accounts, "招行信用卡", "CNY", "0.00", account_type="credit_card"),
        "fund": make_account(accounts, "零钱通", "CNY", "0.00", account_type="savings"),
        "gbp": make_account(accounts, "Monzo", "GBP", "100.00"),
    }


def mapping(a):
    return {
        "零钱": a["wechat"].id, fx.BOC: a["boc"].id, fx.CMB: a["cmb"].id,
        "零钱通": a["fund"].id, "招商银行信用卡(5678)": a["card"].id,
    }


def status(plan):
    return {row.row_id: row.status for row in plan.rows}


def count(session, model, *where):
    return session.scalar(select(func.count()).select_from(model).where(*where))


def test_parse_writes_nothing_and_asks_for_accounts(importer, session, accts):
    plan = importer.parse("wechat", fx.build(), "wechat.xlsx")
    assert count(session, Transaction) == 0 and count(session, ImportBatch) == 0
    labels = {item["label"]: item for item in plan.labels}
    assert set(labels) == {"零钱", fx.BOC, fx.CMB, "零钱通", "招商银行信用卡(5678)"}
    assert all(item["account_id"] is None for item in labels.values())
    review = plan.rows[ROOFOODS]
    assert review.status == "needs_review" and "Choose the account for “零钱”" in review.issues


def test_preview_classifies_maps_and_flags(importer, accts, session):
    token = importer.parse("wechat", fx.build(), None).staged.token
    plan = importer.preview(token, mapping(accts), [])
    rows = plan.rows
    assert rows[ROOFOODS].category_id == category_id(session, "Delivery")
    assert rows[ROOFOODS].reason == "Built-in rule: merchant is “ROOFOODS LTD”"
    assert rows[FLIGHT].category_id == category_id(session, "Flights")
    assert rows[BILIBILI].category_id == category_id(session, "Subscriptions")
    assert rows[DEEPSEEK].category_id == category_id(session, "Software & AI")
    assert rows[DEEPSEEK].rule_name == "DeepSeek (深度求索)"  # merchant tier beats product tier
    assert rows[RED_PACKET].category_id == category_id(session, "Gift", "income")
    assert rows[TOP_UP].kind == "transfer"
    assert (rows[TOP_UP].account_id, rows[TOP_UP].counter_account_id) == (
        accts["cmb"].id, accts["wechat"].id)
    assert (rows[WITHDRAW].account_id, rows[WITHDRAW].counter_account_id) == (
        accts["wechat"].id, accts["cmb"].id)
    assert rows[CARD_REPAY].counter_account_id == accts["card"].id
    assert status(plan)[ALEX] == "needs_review"  # "8月课时费" to a person: never guessed
    assert status(plan)[FRIEND] == "needs_review"
    assert status(plan)[REFUND] == "needs_review"
    assert status(plan)[UNKNOWN] == "needs_review"
    assert status(plan)[CLOSED] == status(plan)[RETURNED] == "ignored"
    assert plan.summary == {
        "detected": 15, "new": 15, "duplicates": 0, "ready": 9, "auto_classified": 5,
        "needs_review": 4, "ignored": 2, "permanently_ignored": 0, "to_ignore": 0,
        "skipped": 0, "invalid": 0,
    }


def test_confirm_refuses_unresolved_rows(importer, accts, session):
    token = importer.parse("wechat", fx.build(), None).staged.token
    with pytest.raises(ConflictError, match="4 rows still need review"):
        importer.confirm(token, mapping(accts), [])
    assert count(session, Transaction) == 0


def _resolve(session, accts):
    return [
        {"row_id": ALEX, "category_id": category_id(session, "Courses"),
         "remember": {"match_field": "merchant", "match_type": "exact", "pattern": "Alex Test"}},
        {"row_id": FRIEND, "counter_account_id": accts["boc"].id},
        {"row_id": REFUND, "skip": True},
        {"row_id": UNKNOWN, "category_id": category_id(session, "Shopping"),
         "remember": {"match_field": "merchant", "match_type": "contains", "pattern": "Unknown Shop"}},
    ]


def test_full_import_goes_through_the_ledger(importer, accts, session, accounts, reports):
    token = importer.parse("wechat", fx.build(), "statement.xlsx").staged.token
    batch = importer.confirm(token, mapping(accts), _resolve(session, accts))
    assert (batch.imported_count, batch.duplicate_count, batch.skipped_count, batch.ignored_count) == (
        12, 0, 1, 2)
    assert count(session, ExternalTransactionRef) == 12

    txs = session.scalars(select(Transaction).where(Transaction.import_batch_id == batch.id)).all()
    assert len(txs) == 12
    assert all(t.external_source == "wechat" and t.fx_source == "identity" for t in txs)
    for t in txs:
        assert sum(p.base_amount_minor for p in t.postings) == 0

    roofoods = next(t for t in txs if t.external_transaction_id == fx.tid(1))
    rule = session.get(CategorisationRule, roofoods.classification_rule_id)
    assert rule.system_key == "sys:merchant-roofoods"
    alex = next(t for t in txs if t.external_transaction_id == fx.tid(2))
    assert session.get(CategorisationRule, alex.classification_rule_id).pattern == "Alex Test"
    friend = next(t for t in txs if t.external_transaction_id == fx.tid(4))
    assert friend.type == "transfer" and friend.from_account_id == accts["boc"].id

    ref = session.scalar(select(ExternalTransactionRef).where(
        ExternalTransactionRef.external_id == fx.tid(3)))
    assert ref.raw_payment_method == fx.BOC and ref.raw_merchant == "同程旅行"
    assert ref.occurred_at == "2026-09-17T09:30:00+08:00" and ref.raw_note == "已优惠¥3.81"

    # WeChat: 1000 - 190.93 - 900 + 200 (from 中国银行) + 88.88 - 25 - 50 + 500 - 100 - 300
    #         - 400 - 66
    assert accounts.balance_minor(accts["wechat"]) == to_minor("-243.05", "CNY")
    assert accounts.balance_minor(accts["boc"]) == to_minor("3565.50", "CNY")  # 5000 - 1234.5 - 200
    assert accounts.balance_minor(accts["card"]) == to_minor("400.00", "CNY")
    summary = reports.monthly(2026, 9)["summary"]
    assert summary["income_minor"] == to_minor("88.88", "CNY")  # transfers excluded
    assert summary["expense_minor"] == to_minor("2466.43", "CNY")
    expenses = {r["category_name"]: r["amount_minor"] for r in reports.monthly(2026, 9)["expense_by_category"]}
    assert expenses["Delivery"] == 19093 and expenses["Flights"] == 123450

    saved = {m.label: m.account_id for m in session.scalars(select(ImportAccountMapping))}
    assert saved == mapping(accts)
    assert count(session, CategorisationRule, CategorisationRule.origin == "user") == 2


def test_reimport_is_all_duplicates_and_mappings_are_remembered(importer, accts, session):
    token = importer.parse("wechat", fx.build(), None).staged.token
    importer.confirm(token, mapping(accts), _resolve(session, accts))
    again = importer.parse("wechat", fx.build(), None)
    assert again.summary["duplicates"] == 12
    assert again.summary["ready"] == 0 and again.summary["ignored"] == 2
    assert status(again)[REFUND] == "needs_review"  # skipped last time, still not imported
    assert all(item["remembered"] for item in again.labels)
    batch = importer.confirm(again.staged.token, {}, [], skip_unresolved=True)
    assert batch.imported_count == 0 and batch.duplicate_count == 12
    assert count(session, Transaction, Transaction.external_source == "wechat") == 12


def test_learned_rule_classifies_the_next_statement(importer, accts, session):
    token = importer.parse("wechat", fx.build(), None).staged.token
    importer.confirm(token, mapping(accts), _resolve(session, accts))
    newer = [fx.row(101, "2026-09-25 10:00:00", "转账", "Alex Test", "转账备注:9月", "支出", 900, "零钱", "对方已收钱"),
             fx.row(102, "2026-09-25 11:00:00", "商户消费", "Unknown Shop Ltd (Oxford)", "x", "支出", 5, "零钱", "支付成功")]
    plan = importer.parse("wechat", fx.build(rows=newer), None)
    assert [row.status for row in plan.rows] == ["ready", "ready"]
    assert plan.rows[0].category_id == category_id(session, "Courses")
    assert plan.rows[0].reason.startswith("Your rule")


def test_remembered_rule_applies_to_similar_rows_in_the_same_file(importer, accts, session):
    rows = [fx.ROWS[UNKNOWN], fx.row(201, "2026-09-05 10:00:00", "商户消费", "Unknown Shop Ltd", "b", "支出", 7, "零钱", "支付成功")]
    token = importer.parse("wechat", fx.build(rows=rows), None).staged.token
    override = [{"row_id": 0, "category_id": category_id(session, "Shopping"),
                 "remember": {"match_field": "merchant", "match_type": "exact", "pattern": "Unknown Shop Ltd"}}]
    plan = importer.preview(token, mapping(accts), override)
    assert [r.status for r in plan.rows] == ["ready", "ready"]
    assert plan.rows[1].rule_id < 0  # pending until confirmed
    importer.confirm(token, mapping(accts), override)
    rule_ids = set(session.scalars(select(Transaction.classification_rule_id)))
    assert len(rule_ids) == 1 and next(iter(rule_ids)) > 0


def test_user_rule_beats_builtin_and_disabled_rule_is_ignored(importer, rules, accts, session):
    user_rule = rules.create({"match_field": "merchant", "match_type": "contains",
                              "pattern": "roofoods", "category_id": category_id(session, "Restaurants")})
    token = importer.parse("wechat", fx.build(rows=[fx.ROWS[ROOFOODS]]), None).staged.token
    plan = importer.preview(token, mapping(accts), [])
    assert plan.rows[0].category_id == category_id(session, "Restaurants")
    rules.update(user_rule.id, {"is_enabled": False})
    plan = importer.preview(token, mapping(accts), [])
    assert plan.rows[0].category_id == category_id(session, "Delivery")


def test_archived_category_rule_falls_through_to_review(importer, accts, session, categories):
    delivery = category_id(session, "Delivery")
    categories.archive(delivery, True)
    token = importer.parse("wechat", fx.build(rows=[fx.ROWS[ROOFOODS]]), None).staged.token
    plan = importer.preview(token, mapping(accts), [])
    assert plan.rows[0].status == "needs_review"
    assert "No rule matched: choose a category" in plan.rows[0].issues
    bad = [{"row_id": 0, "category_id": delivery}]
    plan = importer.preview(token, mapping(accts), bad)
    assert "The chosen category is archived or missing" in plan.rows[0].issues
    with pytest.raises(ValidationError):
        CategorisationService(session).create(
            {"match_field": "merchant", "pattern": "x", "category_id": delivery})


def test_foreign_currency_account_cannot_take_cny_rows(importer, accts):
    token = importer.parse("wechat", fx.build(rows=[fx.ROWS[ROOFOODS]]), None).staged.token
    plan = importer.preview(token, {"零钱": accts["gbp"].id}, [])
    assert plan.rows[0].status == "needs_review"
    assert "Monzo holds GBP" in plan.rows[0].issues[0]


def test_same_id_twice_in_one_file(importer, accts):
    token = importer.parse("wechat", fx.build(rows=[fx.ROWS[ROOFOODS], fx.ROWS[ROOFOODS]]), None).staged.token
    plan = importer.preview(token, mapping(accts), [])
    assert [r.status for r in plan.rows] == ["ready", "duplicate"]
    assert plan.rows[1].reason == "Repeated in this file"


def test_database_constraint_is_the_real_duplicate_guard(importer, accts, session, monkeypatch):
    token = importer.parse("wechat", fx.build(rows=[fx.ROWS[ROOFOODS]]), None).staged.token
    importer.confirm(token, mapping(accts), [])
    token = importer.parse("wechat", fx.build(rows=[fx.ROWS[ROOFOODS], fx.ROWS[BILIBILI]]), None).staged.token
    monkeypatch.setattr(importer, "_imported_ids", lambda *_: set())  # a stale/lying pre-check
    with pytest.raises(ConflictError, match="Nothing was imported"):
        importer.confirm(token, mapping(accts), [])
    assert count(session, Transaction) == 1 and count(session, ImportBatch) == 1
    tx = session.scalars(select(Transaction)).first()
    session.add(ExternalTransactionRef(source="wechat", external_id=fx.tid(1), transaction_id=tx.id))
    with pytest.raises(IntegrityError):
        session.flush()
    session.rollback()


def test_failure_mid_import_rolls_everything_back(importer, accts, session, ledger, monkeypatch):
    token = importer.parse("wechat", fx.build(), None).staged.token
    original = ledger.create_transaction
    calls = {"n": 0}

    def flaky(data, *, commit=True):
        calls["n"] += 1
        if calls["n"] == 5:
            raise RuntimeError("disk full")
        return original(data, commit=commit)

    monkeypatch.setattr(ledger, "create_transaction", flaky)
    with pytest.raises(RuntimeError):
        importer.confirm(token, mapping(accts), _resolve(session, accts))
    for model in (Transaction, ExternalTransactionRef, ImportBatch, ImportAccountMapping):
        assert count(session, model) == 0, model.__name__
    assert count(session, CategorisationRule, CategorisationRule.origin == "user") == 0
    monkeypatch.undo()
    batch = importer.confirm(token, mapping(accts), _resolve(session, accts))  # still staged
    assert batch.imported_count == 12


def test_edit_keeps_external_identity(importer, accts, session, ledger):
    token = importer.parse("wechat", fx.build(rows=[fx.ROWS[ROOFOODS]]), None).staged.token
    importer.confirm(token, mapping(accts), [])
    tx = session.scalars(select(Transaction)).one()
    replacement = ledger.update_transaction(tx.id, {"category_id": category_id(session, "Restaurants")})
    assert replacement.external_transaction_id == fx.tid(1)
    assert replacement.classification_rule_id is None  # re-filed by hand
    ref = session.scalars(select(ExternalTransactionRef)).one()
    assert ref.transaction_id == replacement.id
    plan = importer.parse("wechat", fx.build(rows=[fx.ROWS[ROOFOODS]]), None)
    assert plan.rows[0].status == "duplicate"


def test_expired_or_unknown_token(importer):
    with pytest.raises(Exception, match="expired"):
        importer.preview("nope", {}, [])


def test_unsupported_file_is_a_clear_validation_error(importer):
    with pytest.raises(ValidationError, match="xlsx"):
        importer.parse("wechat", b"not a workbook", None)


# --------------------------------------------------------------------- HTTP


def test_import_api_end_to_end(session):
    seed_categorisation_rules(session)
    session.commit()
    client = build_client(session)
    ids = {}
    for name, kind in (("WeChat", "ewallet"), ("中国银行", "bank")):
        ids[name] = client.post("/api/v1/accounts", json={
            "name": name, "account_type": kind, "currency": "CNY", "opening_balance_minor": 0,
        }).json()["id"]
    body = fx.build(rows=[fx.ROWS[ROOFOODS], fx.ROWS[FLIGHT], fx.ROWS[UNKNOWN]])
    parsed = client.post("/api/v1/imports/wechat/parse", content=body,
                         headers={"Content-Type": "application/octet-stream",
                                  "X-File-Name": "wechat%20statement.xlsx"})
    assert parsed.status_code == 200, parsed.text
    preview = parsed.json()
    assert preview["summary"]["detected"] == 3 and preview["file_name"] == "wechat statement.xlsx"
    token = preview["token"]
    maps = {"零钱": ids["WeChat"], fx.BOC: ids["中国银行"]}
    shopping = next(c["id"] for c in client.get("/api/v1/categories?kind=expense").json()
                    if c["name"] == "Shopping")
    overrides = [{"row_id": 2, "category_id": shopping,
                  "remember": {"match_field": "merchant", "match_type": "exact"}}]
    second = client.post(f"/api/v1/imports/sessions/{token}/preview",
                         json={"mappings": maps, "overrides": overrides}).json()
    assert [r["status"] for r in second["rows"]] == ["ready", "ready", "ready"]
    assert second["rows"][0]["rule_name"] == "Deliveroo (ROOFOODS LTD)"
    done = client.post(f"/api/v1/imports/sessions/{token}/confirm",
                       json={"mappings": maps, "overrides": overrides})
    assert done.status_code == 201, done.text
    result = done.json()
    assert result["imported_count"] == 3 and len(result["transaction_ids"]) == 3
    tx = client.get(f"/api/v1/transactions/{result['transaction_ids'][0]}").json()
    assert tx["external_source"] == "wechat" and tx["external_transaction_id"].startswith("4200")
    assert client.post(f"/api/v1/imports/sessions/{token}/preview", json={}).status_code == 404

    again = client.post("/api/v1/imports/wechat/parse", content=body,
                        headers={"Content-Type": "application/octet-stream"}).json()
    assert again["summary"]["duplicates"] == 3
    history = client.get("/api/v1/imports/history").json()
    assert history[0]["imported_count"] == 3
    assert client.get(f"/api/v1/imports/history/{history[0]['id']}/transactions").json() == sorted(
        result["transaction_ids"])
    assert len(client.get("/api/v1/imports/mappings?source=wechat").json()) == 2
    rules = client.get("/api/v1/categorisation-rules").json()
    assert rules[0]["origin"] == "user" and rules[0]["pattern"] == "Unknown Shop Ltd"
    assert "Your rule" in rules[0]["explanation"]
    bad = client.post("/api/v1/imports/wechat/parse", content=b"hello",
                      headers={"Content-Type": "application/octet-stream"})
    assert bad.status_code == 422 and "xlsx" in bad.json()["message"]


def test_rules_api_crud_and_reorder(session):
    seed_categorisation_rules(session)
    session.commit()
    client = build_client(session)
    shopping = category_id(session, "Shopping")
    salary = category_id(session, "Salary", "income")
    a = client.post("/api/v1/categorisation-rules", json={
        "match_field": "merchant", "match_type": "contains", "pattern": "TESCO",
        "category_id": shopping}).json()
    b = client.post("/api/v1/categorisation-rules", json={
        "match_field": "any_text", "pattern": "工资", "category_id": salary}).json()
    assert a["direction"] == "expense" and b["direction"] == "income"
    assert b["priority"] > a["priority"]
    order = client.post("/api/v1/categorisation-rules/reorder", json={"rule_ids": [b["id"], a["id"]]}).json()
    assert [r["id"] for r in order[:2]] == [b["id"], a["id"]]
    edited = client.patch(f"/api/v1/categorisation-rules/{a['id']}", json={"is_enabled": False}).json()
    assert edited["is_enabled"] is False
    assert client.delete(f"/api/v1/categorisation-rules/{a['id']}").status_code == 204
    system = [r for r in client.get("/api/v1/categorisation-rules").json() if r["origin"] == "system"]
    assert len(system) >= 15
    assert client.patch(f"/api/v1/categorisation-rules/{system[0]['id']}",
                        json={"is_enabled": False}).json()["is_enabled"] is False


def test_builtin_rule_seeding_is_idempotent_and_respects_edits(session):
    # The session fixture already ran seed_all, which seeds the built-ins.
    first = count(session, CategorisationRule, CategorisationRule.origin == "system")
    rule = session.scalar(select(CategorisationRule).where(
        CategorisationRule.system_key == "sys:merchant-roofoods"))
    rule.is_enabled = False
    session.commit()
    assert first >= 15 and seed_categorisation_rules(session) == 0
    assert rule.is_enabled is False
