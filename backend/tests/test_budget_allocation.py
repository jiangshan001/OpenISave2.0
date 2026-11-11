from datetime import date

import pytest

from app.core.exceptions import ValidationError
from tests.conftest import category_id, make_account
from tests.test_api_end_to_end import build_client


def test_allocation_conserves_cents_across_year_and_keeps_cash_flow(accounts, ledger, budgets, session):
    bank = make_account(accounts, 'Rent account', 'CNY', '10000')
    rent = category_id(session, 'Rent')
    tx = ledger.create_transaction({
        'type': 'expense', 'account_id': bank.id, 'amount_minor': 10001,
        'transaction_date': date(2026, 11, 25), 'category_id': rent,
        'budget_months': 3, 'budget_start_month': date(2026, 12, 1),
    })
    assert accounts.balance_for(bank.id).balance_minor == 1000000 - 10001
    assert [budgets.get_period(y, m).overall_actual_minor for y, m in
            [(2026, 11), (2026, 12), (2027, 1), (2027, 2), (2027, 3)]] == [0, 3334, 3334, 3333, 0]
    assert budgets.transactions.period_totals(date(2026, 11, 1), date(2026, 11, 30))['expense'] == 10001
    period = budgets.replace_period(2027, 1, [{'category_id': rent, 'amount_minor': 5000}])
    assert period.lines[0].actual_minor == 3334
    assert period.overall_actual_minor == 3334
    ledger.void(tx.id)
    assert budgets.get_period(2027, 1).overall_actual_minor == 0


def test_allocating_existing_expense_does_not_rewrite_ledger(accounts, ledger, budgets, session):
    bank = make_account(accounts, 'GBP synthetic', 'GBP', '1000')
    tx = ledger.create_transaction({'type': 'expense', 'account_id': bank.id, 'amount_minor': 301,
        'transaction_date': date(2026, 1, 3), 'category_id': category_id(session, 'Groceries')})
    frozen = tx.base_amount_minor
    before_balance = accounts.balance_for(bank.id).balance_minor
    posting_ids = [p.id for p in tx.postings]
    ledger.set_budget_allocation(tx.id, 3, None)
    assert accounts.balance_for(bank.id).balance_minor == before_balance
    assert tx.base_amount_minor == frozen and [p.id for p in tx.postings] == posting_ids
    assert sum(budgets.get_period(2026, m).overall_actual_minor for m in (1, 2, 3)) == frozen
    ledger.set_budget_allocation(tx.id, 1, None)
    assert budgets.get_period(2026, 1).overall_actual_minor == frozen
    assert budgets.get_period(2026, 2).overall_actual_minor == 0


def test_edit_preserves_allocation_and_rejects_ineligible_records(accounts, ledger, budgets):
    bank = make_account(accounts, 'Bank', 'CNY', '100')
    tx = ledger.create_transaction({'type': 'expense', 'account_id': bank.id, 'amount_minor': 300,
        'transaction_date': date(2026, 3, 1), 'budget_months': 3})
    new = ledger.update_transaction(tx.id, {'description': 'Rent'})
    assert new.budget_months == 3 and tx.is_voided
    assert budgets.get_period(2026, 4).overall_actual_minor == 100
    with pytest.raises(ValidationError): ledger.set_budget_allocation(new.id, 0, None)
    with pytest.raises(ValidationError): ledger.set_budget_allocation(new.id, 37, None)
    with pytest.raises(ValidationError): ledger.set_budget_allocation(new.id, 3, date(2026, 3, 2))
    income = ledger.create_transaction({'type': 'income', 'account_id': bank.id, 'amount_minor': 50,
                                         'transaction_date': date(2026, 3, 1)})
    with pytest.raises(ValidationError): ledger.set_budget_allocation(income.id, 3, None)


def test_allocation_api_edits_existing_expense_without_replacing_it(session, accounts, ledger):
    bank = make_account(accounts, 'Bank', 'CNY', '100')
    tx = ledger.create_transaction({'type': 'expense', 'account_id': bank.id, 'amount_minor': 300,
                                    'transaction_date': date(2026, 1, 1)})
    client = build_client(session)
    response = client.put(f'/api/v1/transactions/{tx.id}/budget-allocation',
                          json={'months': 3, 'start_month': '2026-02-01'})
    assert response.status_code == 200 and response.json()['id'] == tx.id
    assert client.get('/api/v1/budgets/2026/2').json()['overall_actual_minor'] == 100
    assert client.put(f'/api/v1/transactions/{tx.id}/budget-allocation',
                      json={'months': 3, 'start_month': '2026-02-02'}).status_code == 422
