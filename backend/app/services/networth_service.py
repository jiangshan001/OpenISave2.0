"""Central net worth calculation.

Invariant 8: no other module recomputes net worth. The dashboard, reports,
the accounts page and the assets page all call into here.

Net worth = every included account balance (liabilities carry negative
balances) + the current value of every held physical asset classified as a
store of wealth (include_in_net_worth).

Personal possessions -- electronics, vehicles, furniture and the like -- are
tracked at their current value in `personal_possessions_minor` for reference
only. They never enter Total Assets or Net Worth, so buying an 18,000 laptop
lowers net worth by 18,000 while buying a flat converts cash into property.
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
    #: Physical assets that count towards net worth (included in total_assets).
    physical_assets_minor: int = 0
    #: Held possessions excluded from net worth -- a reference figure only.
    personal_possessions_minor: int = 0
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
            possessions = self.assets.possession_totals()
            result.physical_assets_minor = possessions.included_minor
            result.groups["physical_assets"] = possessions.included_minor
            result.total_assets_minor += possessions.included_minor
            result.unconverted_accounts.extend(possessions.included_unconverted)
            result.personal_possessions_minor = possessions.excluded_minor

        result.net_worth_minor = result.total_assets_minor - result.total_liabilities_minor
        return result
