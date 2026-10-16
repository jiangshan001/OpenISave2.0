<#
    Builds the Tauri desktop application.
    Assumes the backend sidecar has already been bundled.
#>
[CmdletBinding()]
param(
    [switch]$SkipBackend
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"

if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    throw "Rust is not installed. Install it with: winget install Rustlang.Rustup"
}

if (-not $SkipBackend) {
    Write-Host 'Bundling the backend...' -ForegroundColor Cyan
    & (Join-Path $PSScriptRoot 'build_backend.ps1')
}

$sidecar = Join-Path $root 'desktop\binaries\openisave-server\openisave-server.exe'
if (-not (Test-Path $sidecar)) {
    throw "Backend sidecar missing. Run scripts\build_backend.ps1 first."
}

if (-not (Test-Path (Join-Path $root 'node_modules'))) {
    Write-Host 'Installing the Tauri CLI...' -ForegroundColor Cyan
    npm install --no-fund --no-audit
}

Write-Host 'Building the desktop application...' -ForegroundColor Cyan
. (Join-Path $PSScriptRoot 'updater_signing.ps1')
$configuredPublicKey = (Get-Content (Join-Path $root 'desktop\tauri.conf.json') -Raw | ConvertFrom-Json).plugins.updater.pubkey
if ($configuredPublicKey -ne [System.IO.File]::ReadAllText($script:UpdaterPublicFile).Trim()) {
    throw 'Updater public key differs from the saved signing identity.'
}
$previousSigningKey = $env:TAURI_SIGNING_PRIVATE_KEY
$previousSigningPassword = $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD
try {
    $env:TAURI_SIGNING_PRIVATE_KEY = Read-UpdaterSigningKey
    $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ''
    npm run desktop:build
    if ($LASTEXITCODE -ne 0) { throw 'Desktop build failed.' }
} finally {
    $env:TAURI_SIGNING_PRIVATE_KEY = $previousSigningKey
    $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $previousSigningPassword
}

$release = Join-Path $root 'desktop\target\release'
Write-Host ''
Write-Host 'Build complete.' -ForegroundColor Green
Get-ChildItem (Join-Path $release 'OpenISave.exe') -ErrorAction SilentlyContinue |
    ForEach-Object { Write-Host "  Executable: $($_.FullName)" }
Get-ChildItem (Join-Path $release 'bundle') -Recurse -Include '*.exe', '*.msi' -ErrorAction SilentlyContinue |
    ForEach-Object { Write-Host "  Installer:  $($_.FullName)" }
