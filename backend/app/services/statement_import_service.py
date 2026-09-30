"""Statement import workflow: parse -> preview -> review -> atomic import.

    parse     bytes -> rows, held in memory under a token (nothing in the DB)
    preview   rows + account mappings + overrides -> a plan per row
    confirm   the plan's ready rows -> ledger, in ONE database transaction

Every transaction is written by the LedgerService, exactly as if typed by
hand. Each imported row also gets an ExternalTransactionRef whose
UNIQUE(source, external_id) makes a second import of the same statement row
impossible at the database level, whatever the frontend sends.

Privacy: rows are never logged; log lines carry counts and ids only.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.core.logging import get_logger
from app.importers import UnsupportedStatementError, get_importer
from app.models.account import Account
from app.models.category import Category
from app.models.statement_import import (
    ExternalTransactionRef,
    ImportAccountMapping,
    ImportBatch,
    ImportIgnoredItem,
)
from app.services.categorisation_service import CategorisationService, RuleSpec
from app.services.import_preview import (
    DUPLICATE, IGNORED, READY, REVIEW, SKIPPED, PlannedRow, PreviewBuilder, RowOverride,
    pending_rules,
)
from app.services.import_staging import StagedStatement, staging
from app.services.ledger_service import LedgerService

logger = get_logger(__name__)


@dataclass
class ImportPlan:
    staged: StagedStatement
    rows: list[PlannedRow]
    labels: list[dict]
    mappings: dict[str, int | None]
    saved_mappings: dict[str, int]
    rules: dict[int, RuleSpec]  # proposing row id -> pending rule

    def count(self, status: str) -> int:
        return sum(1 for row in self.rows if row.status == status)

    @property
    def summary(self) -> dict:
        errors = len(self.staged.parsed.errors)
        return {
            "detected": len(self.rows) + errors,
            "new": sum(1 for row in self.rows if row.status != DUPLICATE),
            "duplicates": self.count(DUPLICATE),
            "ready": self.count(READY),
            # Rows a rule classified, whether or not their account is mapped yet.
            "auto_classified": sum(
                1 for row in self.rows if row.status in (READY, REVIEW) and row.method == "rule"
            ),
            "needs_review": self.count(REVIEW),
            "ignored": self.count(IGNORED),
            "permanently_ignored": sum(1 for r in self.rows if r.ignore_state == "permanent"),
            "to_ignore": sum(1 for r in self.rows if r.ignore_state == "pending"),
            "skipped": self.count(SKIPPED),
            "invalid": errors,
        }


class StatementImportService:
    def __init__(
        self, session: Session, ledger: LedgerService, rules: CategorisationService
    ) -> None:
        self.session = session
        self.ledger = ledger
        self.rules = rules

    # ---------------------------------------------------------------- parse

    def parse(self, source: str, content: bytes, file_name: str | None) -> ImportPlan:
        try:
            importer = get_importer(source)
            parsed = importer.parse(content)
        except UnsupportedStatementError as exc:
            raise ValidationError(str(exc)) from exc
        if not parsed.rows and not parsed.errors:
            raise ValidationError("The statement contains no transactions.")
        staged = staging.put(source, (file_name or "")[:255] or None, parsed)
        logger.info(
            "statement_parsed source=%s rows=%s invalid=%s",
            source, len(parsed.rows), len(parsed.errors),
        )
        return self.preview(staged.token, {}, [])

    # -------------------------------------------------------------- preview

    def saved_mappings(self, source: str) -> dict[str, int]:
        rows = self.session.scalars(
            select(ImportAccountMapping).where(ImportAccountMapping.source == source)
        )
        return {row.label: row.account_id for row in rows}

    def _known_ids(self, model, source: str, ids: list[str]) -> set[str]:
        found: set[str] = set()
        for start in range(0, len(ids), 500):
            chunk = ids[start:start + 500]
            found.update(
                self.session.scalars(
                    select(model.external_id).where(
                        model.source == source, model.external_id.in_(chunk)
                    )
                )
            )
        return found

    def _imported_ids(self, source: str, ids: list[str]) -> set[str]:
        return self._known_ids(ExternalTransactionRef, source, ids)

    def _ignored_ids(self, source: str, ids: list[str]) -> set[str]:
        return self._known_ids(ImportIgnoredItem, source, ids)

    def preview(self, token: str, mappings: dict, overrides: list[dict]) -> ImportPlan:
        staged = staging.get(token)
        parsed = staged.parsed
        importer = get_importer(staged.source)
        saved = self.saved_mappings(staged.source)
        effective: dict[str, int | None] = {**saved}
        for label, account_id in (mappings or {}).items():
            effective[str(label)] = int(account_id) if account_id else None

        parsed_overrides = [RowOverride.parse(item) for item in overrides or []]
        by_row = {item.row_id: item for item in parsed_overrides}
        proposals = pending_rules(parsed_overrides, parsed.rows)
        ids = [row.external_id for row in parsed.rows]
        builder = PreviewBuilder(
            source=staged.source,
            currency=importer.currency,
            mappings=effective,
            accounts={a.id: a for a in self.session.scalars(select(Account))},
            categories={c.id: c for c in self.session.scalars(select(Category))},
            imported_ids=self._imported_ids(staged.source, ids),
            ignored_ids=self._ignored_ids(staged.source, ids),
            classifier=self.rules.classifier(extra=list(proposals.values())),
        )
        seen: set[str] = set()
        planned = [
            builder.plan(index, row, seen, by_row.get(index)) for index, row in enumerate(parsed.rows)
        ]
        for row_id, spec in proposals.items():
            # A remembered correction is explained by the rule it creates.
            if planned[row_id].method == "manual" and planned[row_id].kind != "transfer":
                planned[row_id].rule_id, planned[row_id].rule_name = spec.id, spec.name
        return ImportPlan(
            staged, planned, self._labels(planned, effective, saved), effective, saved, proposals
        )

    @staticmethod
    def _labels(rows: list[PlannedRow], effective: dict, saved: dict) -> list[dict]:
        counts: dict[str, int] = {}
        for row in rows:
            if row.status in (DUPLICATE, IGNORED):
                continue
            for label in (row.source.source_label, row.source.dest_label):
                if label:
                    counts[label] = counts.get(label, 0) + 1
        return [
            {
                "label": label,
                "account_id": effective.get(label),
                "remembered": label in saved,
                "row_count": count,
            }
            for label, count in sorted(counts.items(), key=lambda item: -item[1])
        ]

    # -------------------------------------------------------------- confirm

    def confirm(
        self,
        token: str,
        mappings: dict,
        overrides: list[dict],
        *,
        remember_mappings: bool = True,
        skip_unresolved: bool = False,
    ) -> ImportBatch:
        plan = self.preview(token, mappings, overrides)
        unresolved = plan.count(REVIEW)
        if unresolved and not skip_unresolved:
            raise ConflictError(
                f"{unresolved} row{'s' if unresolved != 1 else ''} still need review. "
                "Resolve them, or choose to skip unresolved rows.",
                details={"needs_review": unresolved},
            )
        ready = [row for row in plan.rows if row.status == READY]
        source = plan.staged.source
        period_start, period_end = plan.staged.parsed.period
        try:
            batch = ImportBatch(
                source=source,
                file_name=plan.staged.file_name,
                period_start=period_start,
                period_end=period_end,
                detected_count=plan.summary["detected"],
                imported_count=len(ready),
                duplicate_count=plan.count(DUPLICATE),
                skipped_count=plan.count(SKIPPED) + unresolved + len(plan.staged.parsed.errors),
                ignored_count=plan.count(IGNORED),
            )
            self.session.add(batch)
            self.session.flush()
            rule_ids = self._persist_rules(plan, ready)
            if remember_mappings:
                self._persist_mappings(plan, ready)
            for row in ready:
                self._write_row(row, batch, source, rule_ids)
            for row in plan.rows:
                if row.ignore_state == "pending":
                    self._ignore_row(row, batch, source)
            self.session.flush()
            self.session.commit()
        except IntegrityError as exc:
            self.session.rollback()
            logger.info("statement_import_conflict source=%s", source)
            raise ConflictError(
                "Some of these rows were imported in the meantime. Nothing was imported; "
                "reopen the preview to see the current state."
            ) from exc
        except Exception:
            self.session.rollback()
            logger.info("statement_import_rolled_back source=%s", source)
            raise
        staging.discard(token)
        logger.info(
            "statement_imported batch=%s source=%s imported=%s duplicates=%s ignored_now=%s",
            batch.id, source, batch.imported_count, batch.duplicate_count,
            plan.summary["to_ignore"],
        )
        return batch

    def _persist_rules(self, plan: ImportPlan, ready: list[PlannedRow]) -> dict[int, int]:
        """Save each remembered rule that at least one imported row relies on.

        Returns temporary (negative) rule id -> saved rule id.
        """
        used = {row.rule_id for row in ready if row.rule_id is not None and row.rule_id < 0}
        mapping: dict[int, int] = {}
        for spec in plan.rules.values():
            if spec.id not in used:
                continue
            rule = self.rules.create(
                {
                    "name": spec.name,
                    "match_field": spec.match_field,
                    "match_type": spec.match_type,
                    "pattern": spec.pattern,
                    "direction": spec.direction,
                    "category_id": spec.category_id,
                },
                commit=False,
            )
            mapping[spec.id] = rule.id
        return mapping

    def _persist_mappings(self, plan: ImportPlan, ready: list[PlannedRow]) -> None:
        used = {
            label for row in ready
            for label in (row.source.source_label, row.source.dest_label) if label
        }
        for label in used:
            account_id = plan.mappings.get(label)
            if account_id is None or plan.saved_mappings.get(label) == account_id:
                continue
            existing = self.session.scalar(
                select(ImportAccountMapping).where(
                    ImportAccountMapping.source == plan.staged.source,
                    ImportAccountMapping.label == label,
                )
            )
            if existing is None:
                self.session.add(
                    ImportAccountMapping(
                        source=plan.staged.source, label=label, account_id=account_id
                    )
                )
            else:
                existing.account_id = account_id

    def _write_row(
        self, row: PlannedRow, batch: ImportBatch, source: str, rule_ids: dict[int, int]
    ) -> None:
        statement = row.source
        provenance = {
            "import_batch_id": batch.id,
            "external_source": source,
            "external_transaction_id": statement.external_id,
        }
        if row.kind == "transfer":
            transaction = self.ledger.create_transfer(
                {
                    "from_account_id": row.account_id,
                    "to_account_id": row.counter_account_id,
                    "amount_minor": statement.amount_minor,
                    "transaction_date": statement.source_date,
                    "description": row.description,
                    "note": row.note,
                    **provenance,
                },
                commit=False,
            )
        else:
            rule_id = row.rule_id
            if rule_id is not None and rule_id < 0:
                rule_id = rule_ids.get(rule_id)
            transaction = self.ledger.create_transaction(
                {
                    "type": row.kind,
                    "account_id": row.account_id,
                    "amount_minor": statement.amount_minor,
                    "currency": statement.currency,
                    "transaction_date": statement.source_date,
                    "description": row.description,
                    "note": row.note,
                    "category_id": row.category_id,
                    "classification_rule_id": rule_id,
                    **provenance,
                },
                commit=False,
            )
        self.session.add(
            ExternalTransactionRef(
                source=source,
                external_id=statement.external_id,
                transaction_id=transaction.id,
                import_batch_id=batch.id,
                occurred_at=statement.occurred_at.isoformat(),
                source_date=statement.source_date,
                source_timezone=statement.source_timezone or None,
                raw_type=statement.source_type[:64] or None,
                raw_direction=statement.raw_direction[:16] or None,
                raw_merchant=statement.counterparty[:255] or None,
                raw_product=(statement.product or statement.note) or None,
                raw_payment_method=statement.payment_method[:128] or None,
                raw_status=statement.status[:64] or None,
                raw_note=statement.remark or None,
                merchant_order_id=statement.merchant_order_id[:128] or None,
                classification_reason=(row.reason or None) and row.reason[:255],
            )
        )
        self.session.flush()  # the duplicate guard fires here, inside the transaction

    def _ignore_row(self, row: PlannedRow, batch: ImportBatch, source: str) -> None:
        statement = row.source
        self.session.add(
            ImportIgnoredItem(
                source=source,
                external_id=statement.external_id,
                import_batch_id=batch.id,
                occurred_at=statement.occurred_at.isoformat(),
                source_date=statement.source_date,
                amount_minor=statement.amount_minor,
                currency=statement.currency,
                raw_type=statement.source_type[:64] or None,
                raw_direction=statement.raw_direction[:16] or None,
                raw_merchant=statement.counterparty[:255] or None,
                raw_product=(statement.product or statement.note) or None,
            )
        )
        self.session.flush()  # UNIQUE(source, external_id) is checked here

    # ------------------------------------------------------ history/mapping

    def history(self) -> list[ImportBatch]:
        return list(self.session.scalars(select(ImportBatch).order_by(ImportBatch.id.desc())))

    def batch_transactions(self, batch_id: int) -> list[int]:
        if self.session.get(ImportBatch, batch_id) is None:
            raise NotFoundError(f"Import {batch_id} was not found.")
        return list(
            self.session.scalars(
                select(ExternalTransactionRef.transaction_id)
                .where(ExternalTransactionRef.import_batch_id == batch_id)
                .order_by(ExternalTransactionRef.transaction_id)
            )
        )

    def list_mappings(self, source: str | None = None) -> list[ImportAccountMapping]:
        stmt = select(ImportAccountMapping).order_by(ImportAccountMapping.label)
        if source:
            stmt = stmt.where(ImportAccountMapping.source == source)
        return list(self.session.scalars(stmt))

    def delete_mapping(self, mapping_id: int) -> None:
        mapping = self.session.get(ImportAccountMapping, mapping_id)
        if mapping is None:
            raise NotFoundError(f"Mapping {mapping_id} was not found.")
        self.session.delete(mapping)
        self.session.commit()

    def list_ignored(self, source: str | None = None) -> list[ImportIgnoredItem]:
        stmt = select(ImportIgnoredItem).order_by(
            ImportIgnoredItem.source_date.desc(), ImportIgnoredItem.id.desc()
        )
        if source:
            stmt = stmt.where(ImportIgnoredItem.source == source)
        return list(self.session.scalars(stmt))

    def restore_ignored(self, item_id: int) -> None:
        """Forget a permanent ignore: the row can be imported again."""
        item = self.session.get(ImportIgnoredItem, item_id)
        if item is None:
            raise NotFoundError(f"Ignored item {item_id} was not found.")
        source = item.source
        self.session.delete(item)
        self.session.commit()
        logger.info("import_ignore_restored id=%s source=%s", item_id, source)

    def discard(self, token: str) -> None:
        staging.discard(token)
