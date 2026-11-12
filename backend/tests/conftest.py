import threading

import pytest

SQLITE_WORKER = "_connection_worker_thread"


def _sqlite_workers() -> set[threading.Thread]:
    return {t for t in threading.enumerate() if SQLITE_WORKER in t.name}


@pytest.fixture(autouse=True)
def _no_leaked_sqlite_connections():
    before = _sqlite_workers()
    yield
    leaked = _sqlite_workers() - before
    for thread in leaked:
        thread.join(timeout=2)
    assert not [t for t in leaked if t.is_alive()], "test left an aiosqlite connection open"


@pytest.fixture(autouse=True)
def _isolate_env_file(tmp_path, monkeypatch):
    # Settings liest `.env` aus dem CWD (pydantic-settings). Tests dürfen
    # weder den Inhalt von backend/.env sehen noch dort Credentials erwarten
    # — sonst sickern lokale Dev-Secrets in Assertions, die genau `Settings()`
    # ohne explizite Credentials prüfen (z. B. *_skipped_when_credentials_missing).
    monkeypatch.chdir(tmp_path)
