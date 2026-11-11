from datetime import date

import pytest

from app.core.exceptions import ConflictError, ValidationError
from app.services.liability_service import LiabilityService
from tests.conftest import make_account
from tests.test_api_end_to_end import build_client


def test_backfill_corrects_cash_once_without_changing_debt_or_income(session, accounts, ledger, budgets, networth):
    service = LiabilityService(session, accounts, ledger)
    bank = make_account(accounts, 'Bank', 'CNY', '100')
    debt = service.create({'name': 'Old loan', 'liability_type': 'loan', 'currency': 'CNY',
                           'original_amount_minor': 3000000, 'outstanding_amount_minor': 2500000})
    original_debt = service.view(debt).outstanding_minor
    before = networth.calculate().net_worth_minor
    tx = service.record_legacy_receipt(debt.id, {'account_id': bank.id, 'amount_minor': 3000000,
                                                  'transaction_date': date(2026, 1, 5)})
    assert tx.type == 'adjustment' and sum(p.base_amount_minor for p in tx.postings) == 0
    assert accounts.balance_for(bank.id).balance_minor == 3010000
    assert service.view(debt).outstanding_minor == original_debt
    assert networth.calculate().net_worth_minor == before + 3000000
    assert budgets.transactions.period_totals(date(2026, 1, 1), date(2026, 1, 31)) == {'income': 0, 'expense': 0}
    with pytest.raises(ValidationError): ledger.update_transaction(tx.id, {'description': 'Reclassify'})
    with pytest.raises(ConflictError):
        service.record_legacy_receipt(debt.id, {'account_id': bank.id, 'amount_minor': 3000000})
    ledger.void(tx.id)
    assert accounts.balance_for(bank.id).balance_minor == 10000
    assert service.view(debt).receipt_status == 'available'
    service.record_legacy_receipt(debt.id, {'account_id': bank.id, 'amount_minor': 3000000})
    assert accounts.balance_for(bank.id).balance_minor == 3010000


def test_backfill_marker_survives_contract_removal_and_blocks_new_loan_receipt(session, accounts, ledger):
    service = LiabilityService(session, accounts, ledger)
    bank = make_account(accounts, 'Bank', 'CNY', '0')
    old = service.create({'name': 'Old loan', 'currency': 'CNY', 'original_amount_minor': 3000000})
    service.record_legacy_receipt(old.id, {'account_id': bank.id, 'amount_minor': 3000000})
    account_id = old.account_id
    service.delete(old.id)
    replacement = service.create({'name': 'Attached again', 'account_id': account_id,
                                   'original_amount_minor': 3000000})
    assert service.view(replacement).receipt_status == 'recorded'
    with pytest.raises(ConflictError):
        service.record_legacy_receipt(replacement.id, {'account_id': bank.id, 'amount_minor': 3000000})
    new = service.create({'name': 'New loan', 'currency': 'CNY', 'original_amount_minor': 10000,
                          'receipt_account_id': bank.id})
    assert service.view(new).receipt_status == 'unavailable'


def test_legacy_receipt_rejects_wrong_currency_and_excess(session, accounts, ledger):
    service = LiabilityService(session, accounts, ledger)
    bank = make_account(accounts, 'Pounds', 'GBP', '0')
    loan = service.create({'name': 'Old loan', 'currency': 'CNY', 'original_amount_minor': 10000})
    with pytest.raises(ValidationError): service.record_legacy_receipt(loan.id, {'account_id': bank.id, 'amount_minor': 10000})
    cny = make_account(accounts, 'Cash', 'CNY', '0')
    with pytest.raises(ValidationError): service.record_legacy_receipt(loan.id, {'account_id': cny.id, 'amount_minor': 10001})


def test_repayment_history_api_is_filtered_and_paged(session, accounts, ledger):
    service = LiabilityService(session, accounts, ledger)
    cash = make_account(accounts, 'Cash', 'CNY', '1000')
    loan = service.create({'name': 'Loan', 'currency': 'CNY', 'original_amount_minor': 10000})
    for amount in (100, 200, 300):
        ledger.create_transfer(service.record_repayment(loan.id, {'from_account_id': cash.id,
            'amount_minor': amount, 'transaction_date': date(2026, 1, 1)}))
    client = build_client(session)
    result = client.get(f'/api/v1/liabilities/{loan.id}/repayments?limit=2&offset=0').json()
    assert result['total'] == 3 and [row['amount_minor'] for row in result['items']] == [300, 200]
    assert len(client.get(f'/api/v1/liabilities/{loan.id}/repayments?limit=2&offset=2').json()['items']) == 1
    with pytest.raises(ValidationError):
        service.record_repayment(loan.id, {'from_account_id': cash.id, 'amount_minor': 100000})


def test_backfill_api_requires_confirmation_and_rejects_duplicate(session, accounts, ledger):
    service = LiabilityService(session, accounts, ledger)
    bank = make_account(accounts, 'Bank', 'CNY', '0')
    loan = service.create({'name': 'Old debt', 'currency': 'CNY', 'original_amount_minor': 10000})
    client = build_client(session)
    payload = {'account_id': bank.id, 'amount_minor': 10000, 'transaction_date': '2026-01-01'}
    assert client.post(f'/api/v1/liabilities/{loan.id}/receipt', json=payload).status_code == 422
    payload['confirm_missing'] = True
    created = client.post(f'/api/v1/liabilities/{loan.id}/receipt', json=payload)
    assert created.status_code == 201 and created.json()['type'] == 'adjustment'
    assert client.post(f'/api/v1/liabilities/{loan.id}/receipt', json=payload).status_code == 409
