# OpenISave 2.2 — Security and Data Storage

This document describes where OpenISave keeps your financial data, how it is
encrypted, how the key is stored, how backups, recovery and restore work, and
what happens when the app is reinstalled or you move to a new PC.

---

## 1. Where data lives

All financial data lives in one folder that is independent of the source
repository, the installation directory and any build output:

```text
%LOCALAPPDATA%\OpenISave2Data\
├── vault\
│   └── finance.db            SQLCipher-encrypted database (the only live copy)
├── backups\
│   ├── daily\                7 kept   — one per day, taken at startup
│   ├── weekly\               4 kept   — one per ISO week
│   ├── monthly\              12 kept  — one per month
│   ├── manual\               20 kept  — Settings → Back Up Now
│   └── safety\               10 kept  — automatic, before a schema change or restore
├── config\
│   └── storage.json          non-secret metadata (never a key)
├── logs\
│   └── openisave2.log        events only — never amounts or keys
└── migration\
    └── <timestamp>\          2.0 → 2.1 migration report (+ plaintext rollback copy)
```

`%LOCALAPPDATA%` is resolved with the Windows known-folder API
(`SHGetKnownFolderPath(FOLDERID_LocalAppData)`), falling back to the
environment variable. The installer (`%LOCALAPPDATA%\OpenISave\`) never
contains data, and uninstalling the app never touches the data folder.

Developers can point the app at a throwaway repo-local vault with
`OPENISAVE_DEV_LOCAL_DATA=1` (`backend\.localdata\`). Development mode uses
its own Credential Manager entry (`OpenISave2-Dev/DatabaseEncryptionKey`) and
never looks at real or legacy data.

---

## 2. What is encrypted

| Item | Protection |
|---|---|
| `vault\finance.db` | SQLCipher 4 (AES-256 page encryption, HMAC-SHA512 per page) |
| Every backup under `backups\` | Same: an encrypted SQLCipher database under the same key |
| `config\storage.json` | Not encrypted — contains no financial data and no key |
| `logs\` | Not encrypted — event names and ids only (see §9) |
| `migration\<ts>\finance-before-encryption-*.db` | **Plaintext** rollback copy of the 2.0 data until you remove it (see §7) |

Implementation: the `sqlcipher3` DB-API module (`sqlcipher3-wheels` 0.5.7:
SQLCipher 4.12.0 community edition, SQLite 3.51.1, OpenSSL 3.6 provider,
statically linked). SQLAlchemy remains the only data-access layer: the stock
`sqlite+pysqlite` dialect runs on the `sqlcipher3` module, and every pooled
connection is opened by a `creator` that applies the key before anything else
(`backend/app/db/engine.py`). Alembic migrations run over the same keyed
connections.

No encryption algorithm is invented here. The key is a random 256-bit value
passed as a raw key (`PRAGMA key = "x'…'"`), so no passphrase KDF is involved;
a wrong key is detected by the HMAC on page one.

An encrypted file cannot be opened by ordinary SQLite tools — `sqlite3`
reports "file is not a database" — and its first 16 bytes are not the SQLite
header.

---

## 3. How the key is stored

- Generated once from the OS CSPRNG: 32 bytes (`secrets.token_hex(32)`).
- Stored in **Windows Credential Manager** as a generic credential:
  target `OpenISave2/DatabaseEncryptionKey`, user `OpenISave2`.
  Credential Manager protects it with DPAPI for your Windows account.
- Accessed through the `keyring` library's WinVault backend, instantiated
  directly (no plug-in discovery that could fall back to a weaker store).
- The key is **never** hard-coded, committed, written to `.env`, a config
  file, the data folder, or a log. It never reaches the frontend: the web UI
  talks to the local API, which only ever reports *whether* a key is present.

Startup sequence:

```text
Tauri shell
  → starts the FastAPI sidecar (127.0.0.1, random free port)
    → reads the key from Windows Credential Manager
      → opens vault\finance.db with SQLCipher (HMAC verifies the key)
        → applies schema migrations (after a mandatory encrypted backup)
          → takes the day's scheduled backup
            → API ready
```

Until the vault is open, the API answers only `/health`,
`/security/status` and the recovery endpoints; every data endpoint returns
HTTP 423. The API also rejects any `Host` header other than `127.0.0.1` /
`localhost`, which blocks DNS-rebinding attacks from web pages.

---

## 4. Backup policy

| Kind | When | Kept |
|---|---|---|
| daily | first startup of each day | 7 |
| weekly | first startup of each ISO week (copy of that day's daily) | 4 |
| monthly | first startup of each month (copy of that day's daily) | 12 |
| manual | Settings → Data & Security → Back Up Now | 20 |
| safety | automatically before any schema migration or restore | 10 |

Every backup is made with `VACUUM INTO` over a keyed connection, which
writes a consistent snapshot (including anything still in the WAL) directly
into a new **encrypted** file. A plaintext backup is never produced. Each new
backup is written under a temporary name and verified — it opens with the key,
`PRAGMA cipher_integrity_check` passes (every page authenticates),
`integrity_check` passes, it is not readable as plain SQLite — before it gets
its final name.

Backups are encrypted with the vault key, so they are only useful together
with that key or the recovery key.

---

## 5. Recovery process (lost Credential Manager key)

If Credential Manager loses the key — Windows reinstalled, a new PC, a
different Windows account — the encrypted data and backups are still intact,
but locked.

**Prepare (do this once):** Settings → Data & Security → **Export Recovery
Key**. The recovery key looks like:

```text
OIS1-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX
```

It is the database key itself, encoded in Base32 (no 0/1/8/9 look-alikes)
with a 16-bit checksum that catches typos. Encoding the key directly means
recovery depends on nothing but the recovery key and an encrypted database or
backup — no additional key file has to survive a disk failure.

It is shown only on an explicit click, never written to the data folder or
the logs, and can be copied or saved as a text file you move somewhere safe
(a password manager, or printed). **Anyone with the recovery key and a copy of
your data can read it** — keep the two apart.

**Recover:** when OpenISave starts and the key is missing (or does not match
the database), it shows *"Your data is locked"* and asks for the recovery key.
The key is checked against the encrypted database (or, if the database file is
missing, against the backups) *before* it is saved to Credential Manager.
Nothing is overwritten by a wrong key.

Without either the Credential Manager entry or the recovery key, the data
cannot be decrypted by anyone — including you. That is the point of the
encryption.

---

## 6. Restore process

Settings → Data & Security → **Restore Backup**:

1. Pick a backup. **Verify** opens it with the current key, checks every
   page's HMAC, runs `integrity_check` and the foreign-key check, and confirms
   the schema revision is one this version of the app knows.
2. **Restore** repeats all checks on the server, then:
   - takes a `safety/…-pre-restore` backup of the current database;
   - pauses the API (new requests get HTTP 503, in-flight ones finish);
   - closes every database connection and checkpoints the WAL;
   - copies the backup to `finance.db.restoring`, verifies the copy, and
     atomically renames it over `finance.db`;
   - reopens the database, applies any newer schema migrations (a restored
     older backup is upgraded) and resumes the API.
3. If anything fails after the swap, the pre-restore safety backup is put back
   automatically.

The UI reloads afterwards so no stale figures remain on screen.

If `vault\finance.db` itself is missing while `storage.json` says a vault
existed, OpenISave will **not** silently create an empty database. It shows
*"Your encrypted database is missing"* and offers the backups to restore.

---

## 7. Migration from plaintext V2 (2.0.x)

OpenISave 2.0 stored an unencrypted database at
`%LOCALAPPDATA%\OpenISave2\data\finance.db`. On the first start of 2.1, when
no vault exists yet, it is migrated automatically:

1. The original `finance.db`, `-wal` and `-shm` are **copied byte-for-byte**
   into a private work folder and re-hashed to prove they did not change. The
   originals are never opened (opening would replay a pending WAL into them).
2. The work copy is opened (replaying the WAL there) and a consolidated,
   untouched plaintext backup `finance-before-encryption-<timestamp>.db` is
   written to `migration\<timestamp>\`.
3. `PRAGMA integrity_check` and `foreign_key_check` run on the work copy.
   Damage confined to index entries (`row N missing from index X`) is repaired
   with `REINDEX`, but only after proving — with content fingerprints taken
   from the tables alone — that the table data is identical before and after.
   Any other damage aborts the migration.
4. Every table is fingerprinted: row count + HMAC-SHA256 of its rows under a
   random per-run salt (comparable within the run, never stored, not
   brute-forceable afterwards).
5. The key is taken from Credential Manager, or generated, stored and read
   back.
6. `sqlcipher_export()` — SQLCipher's documented plaintext-to-encrypted
   mechanism — writes `vault\finance.db.migrating`.
7. The encrypted copy is verified: `cipher_integrity_check`,
   `integrity_check`, foreign keys, not readable as plain SQLite, fingerprints
   identical to the source for every table.
8. Pending schema migrations are applied to both copies, and every account
   balance, net worth (under the 2.1 asset classification), transaction
   total, goal and budget figure is computed by the real services on both and
   compared.
9. Everything is closed; the encrypted file is reopened with the key read
   freshly from Credential Manager and verified again.
10. Only then is it atomically renamed to `vault\finance.db` and recorded in
    `config\storage.json`.

On any failure the partial encrypted file and the work folder are removed,
the original database is left exactly as it was, and the app shows
*"Encryption migration did not complete"* with a Retry button. It never
starts an empty database instead.

After a successful migration the original 2.0 files and the
`finance-before-encryption` copy remain on disk as a rollback. The app says so:

> Encryption migration successful. An unencrypted migration backup exists.

Once at least one encrypted backup newer than the migration exists and
verifies, Settings → Data & Security offers **Securely remove old plaintext
backup**. It overwrites each file with random data, renames it and deletes it:
the 2.0 database (+ `-wal`/`-shm`), every file under
`%LOCALAPPDATA%\OpenISave2\backups\`, and the `finance-before-encryption`
copy. On SSDs overwritten blocks can survive inside the drive; BitLocker
full-disk encryption is the only complete protection for data that was once
stored unencrypted.

The migration report (`migration\<timestamp>\migration-report.json`) contains
table names, row counts and pass/fail results only — never an amount.

---

## 8. Reinstalling the app / moving to a new PC

**Reinstall or upgrade OpenISave on the same Windows account:** nothing to
do. The data folder and the Credential Manager entry are untouched by the
installer and uninstaller; the new version opens the same vault.

**Windows reinstalled, or a new Windows account on the same PC:** the data
folder may survive, but Credential Manager is new and empty. OpenISave starts
locked and asks for the recovery key; enter it and everything opens.

**New PC:**

1. Install OpenISave on the new PC, but do not start it yet.
2. Copy `%LOCALAPPDATA%\OpenISave2Data\` from the old PC (or from a copy of
   its `backups\` folder) to the same place on the new PC.
3. Start OpenISave. It finds the vault, has no key, and asks for the recovery
   key.

(If you started it before copying, it created an empty vault and a new key.
Close it and copy the old folder over the new one: the copied vault does not
match the new key, so OpenISave starts locked and the recovery key replaces the
new key once it has been checked against your data.)

If only backups were copied (no `vault\finance.db`), enter the recovery key
and restore the newest backup from the list.

The encrypted folder can be carried on a USB stick or cloud drive safely —
without the key it is unreadable. Never store the recovery key alongside it.

---

## 9. Logging

Logs record event names and identifiers only, for example `database_opened`,
`backup_created kind=daily`, `migration_completed`, `encryption_enabled`,
`restore_completed`, `recovery_key_exported`.

They never contain salaries, balances, transaction amounts, asset prices,
liability amounts, the encryption key or the recovery key. Migration failures
log the exception type and code locations only, because exception messages can
carry SQL parameters. Every log handler additionally runs a redaction filter
that masks anything shaped like a 256-bit key or a recovery key. Uvicorn access
logs are disabled.

2.0.x lost its application log after the first startup migration (Alembic's
`fileConfig` disabled all loggers); 2.1 fixes that.

### 9.1 Statement imports (2.2)

A WeChat Pay statement is sent from the window to the local backend on
127.0.0.1 as the request body and parsed **in memory**. It is never written to
disk, never kept after parsing and never uploaded anywhere; the parsed rows are
held in process memory only until the import is confirmed, cancelled or 30
minutes pass. Import log lines carry counts and ids only
(`statement_parsed source=wechat rows=18`), never merchants, amounts, card
numbers or transaction numbers. What the encrypted database keeps per imported
row is the minimum needed for duplicate protection and audit (WeChat
transaction number, raw merchant/product/payment method/status/note). A row
ignored permanently keeps its transaction number plus date, amount and
merchant so it can be recognised and restored. No AI or
network service is involved in parsing or categorisation. `.gitignore` excludes
`*.xlsx`, `*.xls` and `*微信支付账单*`; tests use synthetic workbooks built in
memory.

---

## 10. Threat model — what this protects against

Protects against:

- someone copying the data folder, a backup, or a stolen/decommissioned disk;
- cloud-sync or backup tools uploading readable financial data;
- other Windows users on the same PC (the key is DPAPI-protected per user);
- malicious web pages probing the local API (loopback-only binding, Host-header
  check, CORS, JSON-body confirmations on destructive endpoints).

Does not protect against:

- malware already running as your Windows user (it can ask Credential Manager
  for the key, as OpenISave does);
- plaintext copies that existed before encryption (see §7 on secure removal and
  BitLocker).
