# PyInstaller spec for the OpenISave backend sidecar.
#
# Produces a single-folder build. The alembic migration scripts and alembic.ini
# are bundled as data so the packaged app can migrate its own database.

from pathlib import Path

from PyInstaller.utils.hooks import collect_submodules, copy_metadata

project_root = Path(SPECPATH)

datas = [
    (str(project_root / "alembic"), "alembic"),
    (str(project_root / "alembic.ini"), "."),
]
datas += copy_metadata("keyring")

hiddenimports = [
    "uvicorn.logging",
    "uvicorn.loops",
    "uvicorn.loops.auto",
    "uvicorn.protocols",
    "uvicorn.protocols.http",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.websockets",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan",
    "uvicorn.lifespan.on",
    "app.main",
]
hiddenimports += collect_submodules("app")
hiddenimports += collect_submodules("alembic")
# Encrypted storage: the SQLCipher DB-API module and the Credential Manager
# backend (instantiated directly, so entry-point discovery is not relied on).
hiddenimports += ["sqlcipher3", "sqlcipher3.dbapi2", "keyring.backends.Windows"]
hiddenimports += collect_submodules("win32ctypes")

a = Analysis(
    ["run_server.py"],
    pathex=[str(project_root)],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    runtime_hooks=[],
    excludes=["tkinter", "pytest", "matplotlib", "PyInstaller"],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="openisave-server",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="openisave-server",
)
