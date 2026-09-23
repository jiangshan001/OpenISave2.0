<#
    Deletes the local OpenISave 2.0 database and recreates an empty one.

    This permanently destroys every account, transaction, goal and budget.
    A timestamped copy is written to the backups folder first.
#>
[CmdletBinding()]
param(
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
$backend = Join-Path (Split-Path -Parent $PSScriptRoot) 'backend'
$root = Join-Path $env:LOCALAPPDATA 'OpenISave2'
$dataDir = Join-Path $root 'data'
$backupDir = Join-Path $root 'backups'
$db = Join-Path $dataDir 'finance.db'

if (-not $Force) {
    Write-Host "This will erase all financial data in $db" -ForegroundColor Yellow
    $answer = Read-Host 'Type ERASE to continue'
    if ($answer -ne 'ERASE') { Write-Host 'Cancelled.'; exit 1 }
}

if (Test-Path $db) {
    if (-not (Test-Path $backupDir)) { New-Item -ItemType Directory -Force $backupDir | Out-Null }
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    Copy-Item $db (Join-Path $backupDir "finance-$stamp.db")
    Write-Host "Backup written to $backupDir" -ForegroundColor Cyan
    Get-ChildItem $dataDir -Filter 'finance.db*' | Remove-Item -Force
}

Set-Location $backend
& (Join-Path $backend '.venv\Scripts\python.exe') -m alembic upgrade head
Write-Host 'A new empty database has been created.' -ForegroundColor Green
