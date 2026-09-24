from __future__ import annotations

import os
import tempfile

# Isolation first, before anything imports app settings: tests get a throwaway
# data directory, no legacy database to migrate, and an in-memory key store.
# They can never reach the real vault or the real Credential Manager entry.
# (Test modules also import this file as `tests.conftest`; reuse the root.)
_TEST_ROOT = os.environ.get("OPENISAVE_TEST_ROOT") or tempfile.mkdtemp(prefix="openisave-tests-")
os.environ["OPENISAVE_TEST_ROOT"] = _TEST_ROOT
os.environ["OPENISAVE_DATA_ROOT"] = os.path.join(_TEST_ROOT, "data")
os.environ["OPENISAVE_LEGACY_DATA_ROOT"] = os.path.join(_TEST_ROOT, "no-legacy")
os.environ["OPENISAVE_KEY_STORE"] = "memory"
os.environ["OPENISAVE_CREDENTIAL_SERVICE"] = "OpenISave2-Tests/DatabaseEncryptionKey"
os.environ.pop("OPENISAVE_DEV_LOCAL_DATA", None)

from datetime import date  # noqa: E402
from decimal import Decimal  # noqa: E402

import pytest  # noqa: E402
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import settings as _settings  # noqa: E402
from app.core.money import to_minor  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.db.seed import seed_all
from app.models import *  # noqa: F401,F403
from app.providers.fx.base import FxProvider, RateQuote
from app.repositories.fx import FxRateRepository
from app.services.account_service import AccountService
from app.services.asset_service import AssetService
from app.services.budget_service import BudgetService
from app.services.category_service import CategoryService
from app.services.dashboard_service import DashboardService
from app.services.fx_service import FxService
from app.services.goal_service import GoalService
from app.services.ledger_service import LedgerService
from app.services.liability_service import LiabilityService
from app.services.networth_service import NetWorthService
from app.services.report_service import ReportService

assert str(_settings.data_root).startswith(_TEST_ROOT), "tests must never use real data"

TODAY = date.today()

# Deterministic test rates: how many CNY one unit of each currency buys.
TEST_RATES_TO_CNY = {
    "GBP": Decimal("9.6500"),
    "USD": Decimal("7.1200"),
    "EUR": Decimal("7.8000"),
    "JPY": Decimal("0.0480"),
    "CAD": Decimal("5.2000"),
    "AUD": Decimal("4.7000"),
}


class StubFxProvider(FxProvider):
    """Offline provider returning fixed rates; no test touches the network."""

    name = "stub"

    def __init__(self, fail: bool = False) -> None:
        self.fail = fail

    def get_latest_rates(self, base: str, quotes: list[str]) -> list[RateQuote]:
        if self.fail:
            from app.core.exceptions import FxProviderError

            raise FxProviderError("provider offline")
        return [
            RateQuote(base, code, Decimal(1) / TEST_RATES_TO_CNY[code], TODAY, self.name)
            for code in quotes
            if code in TEST_RATES_TO_CNY
        ]

    def get_rate(self, base: str, quote: str, on_date: date) -> RateQuote | None:
        rates = self.get_latest_rates(base, [quote])
        return rates[0] if rates else None


@pytest.fixture()
def session() -> Session:
    # StaticPool keeps one shared in-memory database; check_same_thread is
    # disabled because TestClient serves requests on a worker thread.
    engine = create_engine(
        "sqlite://",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def _fk(dbapi_connection, _record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    db = factory()
    seed_all(db)
    try:
        yield db
    finally:
        db.close()
        engine.dispose()


@pytest.fixture()
def fx(session: Session) -> FxService:
    service = FxService(session, StubFxProvider())
    service.refresh()
    return service


@pytest.fixture()
def fx_empty(session: Session) -> FxService:
    """An FX service with no cached rates at all."""
    return FxService(session, StubFxProvider(fail=True))


@pytest.fixture()
def accounts(session: Session, fx: FxService) -> AccountService:
    return AccountService(session, fx)


@pytest.fixture()
def ledger(session: Session, accounts: AccountService, fx: FxService) -> LedgerService:
    return LedgerService(session, accounts, fx)


@pytest.fixture()
def assets(session: Session, fx: FxService, ledger: LedgerService) -> AssetService:
    return AssetService(session, fx, ledger)


@pytest.fixture()
def liabilities(session: Session, accounts: AccountService) -> LiabilityService:
    return LiabilityService(session, accounts)


@pytest.fixture()
def categories(session: Session) -> CategoryService:
    return CategoryService(session)


@pytest.fixture()
def networth(
    session: Session, accounts: AccountService, assets: AssetService
) -> NetWorthService:
    return NetWorthService(session, accounts, assets)


@pytest.fixture()
def goals(session: Session, accounts: AccountService, fx: FxService) -> GoalService:
    return GoalService(session, accounts, fx)


@pytest.fixture()
def budgets(session: Session) -> BudgetService:
    return BudgetService(session)


@pytest.fixture()
def dashboard(
    session: Session,
    accounts: AccountService,
    networth: NetWorthService,
    goals: GoalService,
    budgets: BudgetService,
    fx: FxService,
) -> DashboardService:
    return DashboardService(session, accounts, networth, goals, budgets, fx)


@pytest.fixture()
def reports(
    session: Session,
    accounts: AccountService,
    networth: NetWorthService,
    goals: GoalService,
    budgets: BudgetService,
    dashboard: DashboardService,
) -> ReportService:
    return ReportService(session, accounts, networth, goals, budgets, dashboard)


# ------------------------------------------------------------------ factories


def make_account(service: AccountService, name: str, currency: str, opening: str, **kwargs):
    payload = {
        "name": name,
        "currency": currency,
        "account_type": kwargs.pop("account_type", "bank"),
        "opening_balance_minor": to_minor(opening, currency),
    }
    payload.update(kwargs)
    return service.create(payload)


def category_id(session: Session, name: str, kind: str = "expense") -> int:
    from app.repositories.categories import CategoryRepository

    for row in CategoryRepository(session).list(kind=kind):
        if row.name == name:
            return row.id
    raise AssertionError(f"category {name} not seeded")


def seed_rate(session: Session, currency: str, rate: str, on_date: date) -> None:
    FxRateRepository(session).upsert(currency, "CNY", Decimal(rate), on_date, "manual")
    session.commit()
