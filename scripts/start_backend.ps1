<#
    Starts the OpenISave 2.0 API on 127.0.0.1 only.
    Creates the virtual environment and applies migrations on first run.
#>
[CmdletBinding()]
param(
    [int]$Port = 8756,
    [switch]$SkipMigrations
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

if (-not $SkipMigrations) {
    Write-Host 'Applying database migrations...' -ForegroundColor Cyan
    & $python -m alembic upgrade head
}

Write-Host ''
Write-Host "OpenISave 2.0 API  ->  http://127.0.0.1:$Port" -ForegroundColor Green
Write-Host "API documentation  ->  http://127.0.0.1:$Port/docs" -ForegroundColor Green
Write-Host 'Press Ctrl+C to stop.' -ForegroundColor DarkGray
Write-Host ''

& $python -m uvicorn app.main:app --host 127.0.0.1 --port $Port
