<#
    Starts the OpenISave 2.0 web interface on http://127.0.0.1:5173.
    Requires the API to be running (scripts\start_backend.ps1).
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$frontend = Join-Path (Split-Path -Parent $PSScriptRoot) 'frontend'
Set-Location $frontend

if (-not (Test-Path (Join-Path $frontend 'node_modules'))) {
    Write-Host 'Installing frontend dependencies (first run only)...' -ForegroundColor Cyan
    npm install --no-fund --no-audit
}

Write-Host ''
Write-Host 'OpenISave 2.0  ->  http://127.0.0.1:5173' -ForegroundColor Green
Write-Host 'Press Ctrl+C to stop.' -ForegroundColor DarkGray
Write-Host ''

npm run dev
