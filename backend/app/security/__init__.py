"""Encrypted storage: SQLCipher vault, OS key storage, backups and migration.

Nothing in this package ever logs or returns key material except the one
explicit, user-initiated recovery-key export.
"""
