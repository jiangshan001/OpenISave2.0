<#
    Starts the OpenISave 2.0 API on 127.0.0.1 only.
    Creates the virtual environment on first run.

    This opens the REAL encrypted vault in %LOCALAPPDATA%\OpenISave2Data (and
    migrates 2.0.x plaintext data on first start). For development against a
    throwaway repo-local vault, set $env:OPENISAVE_DEV_LOCAL_DATA = '1' first.
#>
[CmdletBinding()]
param(
    [int]$Port = 8756
)

$ErrorActionPreference = 'Stop'
$backend = Join-Path (Split-Path -Parent $PSScriptRoot) 'backend'
Set-Location $backend

$python = Join-Path $backend '.venv\Scripts\python.exe'

if (-not (Test-Path $python)) {
    Write-Host 'Creating virtual environment...' -ForegroundColor Cyan
    $systemPython = (Get-Command py -ErrorAction SilentlyContinue)
    if ($systemPython) { & py -3.11 -m venv .venv } else { & python -m venv .venv }
    if (-not (Test-Path $python)) { throw "Could not create the virtual environment at $python" }
}

Write-Host 'Installing dependencies...' -ForegroundColor Cyan
& $python -m pip install --upgrade pip --quiet
& $python -m pip install -r requirements-dev.txt --quiet

# Schema migrations are applied by the app itself at startup, over the
# encrypted connection and only after a mandatory encrypted backup. Running
# `alembic upgrade head` by hand would skip that backup.

Write-Host ''
Write-Host "OpenISave 2.0 API  ->  http://127.0.0.1:$Port" -ForegroundColor Green
Write-Host "API documentation  ->  http://127.0.0.1:$Port/docs" -ForegroundColor Green
Write-Host 'Press Ctrl+C to stop.' -ForegroundColor DarkGray
Write-Host ''

& $python -m uvicorn app.main:app --host 127.0.0.1 --port $Port
