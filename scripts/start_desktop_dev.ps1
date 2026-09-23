<#
    Runs the desktop shell against the development servers.

    Start the backend first (scripts\start_backend.ps1). This script starts the
    Vite dev server itself and opens the desktop window pointing at it, so the
    UI hot-reloads while you work.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"

if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    throw "Rust is not installed. Install it with: winget install Rustlang.Rustup"
}

try {
    $health = Invoke-WebRequest -Uri 'http://127.0.0.1:8756/api/v1/health' -UseBasicParsing -TimeoutSec 3
    if ($health.StatusCode -ne 200) { throw }
} catch {
    Write-Warning 'The development backend is not responding on 127.0.0.1:8756.'
    Write-Warning 'Start it first:  powershell -ExecutionPolicy Bypass -File .\scripts\start_backend.ps1'
}

if (-not (Test-Path (Join-Path $root 'node_modules'))) {
    npm install --no-fund --no-audit
}

npm run desktop:dev
