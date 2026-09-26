# Encryption Migration Report — OpenISave 2.0.0 → 2.1.0

Historical validation of the 2.0-to-2.1 SQLCipher migration using a packaged
2.1.0 desktop app. This report is deliberately redacted for a public source
repository. It does not establish that a 2.1.1 package was smoke-tested.

No financial amounts, record counts, account names, asset details, recovery
keys, or machine-specific backup names are included. Content comparisons used
salted digests that were discarded after the run.

## Result

**Migration succeeded.** All records were preserved; all checks passed.

| Item | Value |
|---|---|
| Old data location | `%LOCALAPPDATA%\OpenISave2\data\finance.db` (+ `-wal`, `-shm`) |
| New encrypted database | `%LOCALAPPDATA%\OpenISave2Data\vault\finance.db` |
| Encryption | SQLCipher 4.12.0 community (AES-256, HMAC-SHA512, OpenSSL 3.6) |
| Key storage | Windows Credential Manager — `OpenISave2/DatabaseEncryptionKey` |
| Schema | `042bb366d803` (2.0) → `5d1c7e9a2b40` (2.1, asset net-worth classification) |
| Original plaintext files | Preserved and verified byte-identical at validation time |
| Plaintext migration backup | Stored under `%LOCALAPPDATA%\OpenISave2Data\migration\<timestamp>\` and not committed |
| Machine-readable report | Stored in that migration directory and not committed |

## Safety measures taken before migration

1. OpenISave was confirmed closed; no OpenISave process was running.
2. The live database had an un-checkpointed WAL — recent entries existed only
   there. Before anything opened the
   database, all three files were copied byte-for-byte to
   a private rollback directory outside the repository
   and SHA-256 verified.
3. The migration was dry-run on a copy of that snapshot (isolated folder,
   in-memory key) and passed every check; the copy was securely deleted.
4. Immediately before the real migration the live files were re-hashed and
   confirmed identical to the snapshot.

## Pre-existing index damage (found and repaired)

`PRAGMA integrity_check` on the 2.0 data (with its WAL applied) reported:

```text
row missing from several secondary transaction indexes
```

The `transactions` table itself was intact (page structure valid, foreign keys
valid, its posting legs present); only the five secondary indexes lacked an
entries. In 2.0 this could hide transactions from index-driven
lists (by date or type) while balances, which sum postings, still included it.

The damage predates this work; its cause cannot be determined from the files.
The migration repaired it on its private work copy only:

| Check | Result |
|---|---|
| Errors limited to index entries | yes |
| `REINDEX` performed | yes |
| Table contents identical before/after repair (salted per-table digests) | **yes** |
| `integrity_check` after repair | ok |

The original files were not modified.

## Tables preserved

All application tables were compared between the plaintext source and the
encrypted vault. For each table, every row and column (including frozen FX
rates and base amounts) produced the same salted digest. Table names and
record counts from the user's database are omitted from this public report.

## Verification checks

| Check | Result |
|---|---|
| Source integrity (after index repair) | pass |
| Encrypted: `PRAGMA cipher_integrity_check` (every page HMAC) | pass |
| Encrypted: `PRAGMA integrity_check` | ok |
| Encrypted: foreign keys | 0 violations |
| Encrypted file not readable by ordinary SQLite | pass ("file is not a database") |
| All records identical (per-table digests) | pass |
| Account balances, net worth (new rule), transaction totals, goals, budgets identical between source and vault | pass |
| Reopened with key freshly read from Credential Manager, re-verified | pass |
| Original files unchanged during migration (SHA-256) | pass |
| Work folder with plaintext copies securely removed | pass |

## Net worth reclassification

Personal possessions that counted toward net worth under 2.0 were still fully
tracked after migration, but were reported separately and excluded from Total
Assets and Net Worth under the new default. Their counts and values are
omitted. Any asset can be opted back in individually.

## Post-migration desktop smoke test (packaged 2.1.0)

| Step | Result |
|---|---|
| 1. Migration of existing data on first launch | succeeded |
| 2. Launch | vault `ready` |
| 3–8. Accounts, transactions, goals, budgets, assets, liabilities intact | pass; counts omitted |
| Account balances and frozen FX amounts identical to pre-migration | yes |
| 9. Net worth reflects new exclusion rules | yes (matches independent recomputation; value omitted) |
| 10. Close normally | clean exit, no orphan process |
| 11–12. Reopen, data readable (key from Credential Manager) | yes |
| 13. Kill app abnormally (`taskkill /F`) | sidecar terminated with it (job object), no orphan |
| 14. Reopen | vault `ready`, all data intact |
| 15. Database integrity | `cipher_integrity_check` ok, `integrity_check` ok, 0 FK violations |
| Encrypted backups (daily/weekly/monthly) verify with key, not plaintext | yes |
| Log contains no amounts, keys or recovery keys | yes |
| Original 2.0 plaintext files still byte-identical afterwards | yes |

The final installer build was reinstalled and re-verified the same way.

## Remaining plaintext copies (user action)

Migration preserves plaintext rollback copies in the legacy data and migration
directories. Their presence and names are deliberately not asserted here;
the app's **Settings → Data & Security** page shows the current state. After
verifying access to the encrypted vault, users can export a recovery key and
choose **Securely remove old plaintext backup** there.
