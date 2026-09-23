"""Central net worth calculation.

Invariant 8: no other module recomputes net worth. The dashboard, reports,
the accounts page and the assets page all call into here.

Net worth = every included account balance (liabilities carry negative
balances) + the current value of every physical asset still held. Because an
asset purchase debits an account and credits the asset in the same transaction,
buying something does not change net worth -- only its composition.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from sqlalchemy.orm import Session

from app.core.money import BASE_CURRENCY
from app.services.account_service import AccountBalance, AccountService
from app.services.asset_service import AssetService

GROUP_ORDER = ("cash", "savings", "investments", "other_assets", "physical_assets", "liabilities")


@dataclass
class NetWorth:
    base_currency: str = BASE_CURRENCY
    total_assets_minor: int = 0
    total_liabilities_minor: int = 0
    net_worth_minor: int = 0
    physical_assets_minor: int = 0
    groups: dict[str, int] = field(default_factory=dict)
    unconverted_accounts: list[str] = field(default_factory=list)
    balances: list[AccountBalance] = field(default_factory=list)


class NetWorthService:
    def __init__(
        self, session: Session, accounts: AccountService, assets: AssetService | None = None
    ) -> None:
        self.session = session
        self.accounts = accounts
        self.assets = assets

    def calculate(self) -> NetWorth:
        result = NetWorth(groups={group: 0 for group in GROUP_ORDER})
        balances = self.accounts.balances()
        result.balances = balances

        for item in balances:
            account = item.account
            if not account.include_in_net_worth or account.is_archived:
                continue
            if item.base_balance_minor is None:
                # No usable exchange rate: the account is reported but excluded
                # from consolidated totals rather than valued at a made-up rate.
                result.unconverted_accounts.append(account.name)
                continue
            base = item.base_balance_minor
            result.groups[item.group] = result.groups.get(item.group, 0) + base
            if self.accounts.is_liability_account(account):
                result.total_liabilities_minor += -base
            else:
                result.total_assets_minor += base

        if self.assets is not None:
            asset_total, unconverted_assets = self.assets.net_worth_contribution()
            result.physical_assets_minor = asset_total
            result.groups["physical_assets"] = asset_total
            result.total_assets_minor += asset_total
            result.unconverted_accounts.extend(unconverted_assets)

        result.net_worth_minor = result.total_assets_minor - result.total_liabilities_minor
        return result
