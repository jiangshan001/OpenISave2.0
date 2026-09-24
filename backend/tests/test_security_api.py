"""Data & Security over HTTP: the vault gate, recovery, backups and restore."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app
from app.security import cipher
from app.security.keystore import MemoryKeyStore
from app.security.runtime import StorageRuntime, VaultState, set_runtime


@pytest.fixture()
def runtime_for(tmp_path):
    def factory(store: MemoryKeyStore) -> StorageRuntime:
        runtime = StorageRuntime(
            Settings(data_root=tmp_path / "data", legacy_data_root=tmp_path / "legacy",
                     key_store="memory"),
            store,
        )
        set_runtime(runtime)
        runtime.start()
        return runtime

    yield factory
    set_runtime(None)


def _client() -> TestClient:
    return TestClient(create_app())


def _account(client: TestClient, name: str) -> dict:
    response = client.post(
        "/api/v1/accounts",
        json={"name": name, "account_type": "bank", "currency": "CNY", "opening_balance_minor": 0},
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_status_reports_encryption_without_revealing_the_key(runtime_for):
    store = MemoryKeyStore()
    runtime_for(store)
    response = _client().get("/api/v1/security/status")
    assert response.status_code == 200
    body = response.json()
    assert body["state"] == "ready"
    assert body["encryption"]["engine"] == "SQLCipher"
    assert body["encryption"]["cipher_version"].startswith("4.")
    assert body["key_storage"]["present"] is True
    assert body["database_path"].endswith("finance.db")
    assert body["last_backup"] is not None
    assert body["recovery_key"]["configured"] is False
    assert store.get() not in response.text


def test_locked_vault_gates_every_data_endpoint(runtime_for):
    store = MemoryKeyStore()
    runtime = runtime_for(store)
    client = _client()
    _account(client, "Locked away")
    recovery_key = client.post(
        "/api/v1/security/recovery-key/export", json={"confirm": True}
    ).json()["recovery_key"]

    set_runtime(None)
    locked = runtime_for(MemoryKeyStore())  # Credential Manager lost
    assert locked.state == VaultState.LOCKED
    client = _client()

    for path in ("/api/v1/accounts", "/api/v1/dashboard", "/api/v1/security/backups"):
        response = client.get(path)
        assert response.status_code == 423, path
        assert response.json()["code"] == "vault_locked"
    assert client.get("/api/v1/health").status_code == 200
    status = client.get("/api/v1/security/status").json()
    assert status["state"] == "locked" and status["reason"] == "key_missing"

    wrong = client.post("/api/v1/security/unlock", json={"recovery_key": "OIS1-AAAAA-BBBBB-CCCCC"})
    assert wrong.status_code in (409, 422)
    assert client.get("/api/v1/accounts").status_code == 423

    unlocked = client.post("/api/v1/security/unlock", json={"recovery_key": recovery_key})
    assert unlocked.status_code == 200, unlocked.text
    assert unlocked.json()["state"] == "ready"
    names = [row["name"] for row in client.get("/api/v1/accounts").json()]
    assert names == ["Locked away"]
    assert runtime.key_store is not locked.key_store


def test_recovery_key_export_requires_explicit_confirmation(runtime_for):
    runtime_for(MemoryKeyStore())
    client = _client()
    assert client.post("/api/v1/security/recovery-key/export").status_code == 422
    assert client.post("/api/v1/security/recovery-key/export", json={"confirm": False}).status_code == 422
    response = client.post("/api/v1/security/recovery-key/export", json={"confirm": True})
    assert response.status_code == 200
    assert response.json()["recovery_key"].startswith("OIS1-")
    assert client.get("/api/v1/security/status").json()["recovery_key"]["configured"] is True


def test_back_up_now_verify_and_restore_over_http(runtime_for):
    runtime = runtime_for(MemoryKeyStore())
    client = _client()
    _account(client, "Before backup")

    created = client.post("/api/v1/security/backups")
    assert created.status_code == 201
    backup = created.json()
    assert backup["kind"] == "manual"
    listed = [item["id"] for item in client.get("/api/v1/security/backups").json()]
    assert backup["id"] in listed
    verified = client.post("/api/v1/security/backups/verify", json={"backup_id": backup["id"]})
    assert verified.json()["ok"] is True

    _account(client, "After backup")
    assert client.post("/api/v1/security/restore", json={"backup_id": backup["id"]}).status_code == 422
    restored = client.post(
        "/api/v1/security/restore", json={"backup_id": backup["id"], "confirm": True}
    )
    assert restored.status_code == 200, restored.text
    assert restored.json()["safety_backup"]["kind"] == "safety"
    names = [row["name"] for row in client.get("/api/v1/accounts").json()]
    assert names == ["Before backup"]
    assert not cipher.is_plaintext_sqlite(runtime.settings.db_path)


def test_plaintext_removal_requires_the_confirmation_phrase(runtime_for):
    runtime_for(MemoryKeyStore())
    client = _client()
    response = client.post("/api/v1/security/plaintext/remove", json={"confirm": "yes"})
    assert response.status_code == 422
    response = client.post("/api/v1/security/plaintext/remove", json={"confirm": "REMOVE PLAINTEXT"})
    assert response.status_code == 409  # nothing was migrated, so nothing to remove


def test_foreign_host_headers_are_refused(runtime_for):
    runtime_for(MemoryKeyStore())
    client = _client()
    response = client.get("/api/v1/security/status", headers={"Host": "evil.example"})
    assert response.status_code == 400
    ok = client.get("/api/v1/security/status", headers={"Host": "127.0.0.1:8756"})
    assert ok.status_code == 200
