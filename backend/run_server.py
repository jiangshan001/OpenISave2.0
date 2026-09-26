"""Entry point for the packaged backend executable.

Started by the desktop shell as a sidecar. The port arrives on the command
line so the shell can pick a free one; the server still binds to 127.0.0.1
only, exactly as it does in development.
"""

from __future__ import annotations

import argparse
import sys


def _ensure_std_streams() -> None:
    """Give a windowed build somewhere to write.

    The sidecar is built without a console, so when the shell starts it
    Python's sys.stdout and sys.stderr are None. uvicorn's log formatter calls
    sys.stdout.isatty() and fails, leaving a process that is alive but never
    listens. Pointing the streams at a file fixes that and keeps any crash
    output readable afterwards.
    """
    if sys.stdout is not None and sys.stderr is not None:
        return
    from app.core.config import settings

    settings.ensure_directories()
    console = open(  # noqa: SIM115 - lives for the whole process
        settings.log_dir / "server-console.log", "a", encoding="utf-8", buffering=1
    )
    if sys.stdout is None:
        sys.stdout = console
    if sys.stderr is None:
        sys.stderr = console


def main() -> int:
    _ensure_std_streams()

    parser = argparse.ArgumentParser(prog="openisave-server")
    parser.add_argument("--port", type=int, default=8756)
    parser.add_argument("--host", default="127.0.0.1")
    args = parser.parse_args()

    if args.host != "127.0.0.1":
        print("Refusing to bind anywhere but 127.0.0.1", file=sys.stderr)
        return 2

    import uvicorn

    from app.core.logging import configure_logging

    # The vault is opened (and a 2.0.x plaintext database migrated) by the
    # application lifespan, before uvicorn starts listening.
    configure_logging()

    uvicorn.run(
        "app.main:app",
        host=args.host,
        port=args.port,
        log_level="info",
        access_log=False,
        use_colors=False,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
