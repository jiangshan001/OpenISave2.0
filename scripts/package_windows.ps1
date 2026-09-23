<#
    One command to produce a distributable Windows build of OpenISave.

        powershell -ExecutionPolicy Bypass -File .\scripts\package_windows.ps1

    Runs the quality gates, bundles the backend, builds the desktop app and
    reports where the installer landed.
#>
[CmdletBinding()]
param(
    [switch]$SkipTests
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root 'backend'
$frontend = Join-Path $root 'frontend'
$python = Join-Path $backend '.venv\Scripts\python.exe'

function Step($message) {
    Write-Host ''
    Write-Host "== $message" -ForegroundColor Cyan
}

if (-not $SkipTests) {
    Step 'Backend tests'
    Set-Location $backend
    & $python -m pytest -q
    if ($LASTEXITCODE -ne 0) { throw 'Backend tests failed.' }

    Step 'Frontend type check, lint, tests and size rule'
    Set-Location $frontend
    npm run typecheck; if ($LASTEXITCODE -ne 0) { throw 'TypeScript failed.' }
    npm run lint;      if ($LASTEXITCODE -ne 0) { throw 'ESLint failed.' }
    npm run test;      if ($LASTEXITCODE -ne 0) { throw 'Frontend tests failed.' }
    npm run check:size; if ($LASTEXITCODE -ne 0) { throw 'Frontend file-size rule failed.' }
}

Step 'Bundling the backend'
& (Join-Path $PSScriptRoot 'build_backend.ps1')

Step 'Building the desktop application'
& (Join-Path $PSScriptRoot 'build_desktop.ps1') -SkipBackend

$bundle = Join-Path $root 'desktop\target\release\bundle'
$installers = @(Get-ChildItem $bundle -Recurse -Include '*.exe', '*.msi' -ErrorAction SilentlyContinue)

Write-Host ''
if ($installers.Count -gt 0) {
    Write-Host 'Packaging complete.' -ForegroundColor Green
    $installers | ForEach-Object {
        $mb = [math]::Round($_.Length / 1MB, 1)
        Write-Host "  $($_.FullName)  ($mb MB)"
    }
    Write-Host ''
    Write-Host 'Run the installer to add OpenISave to the Start menu.' -ForegroundColor DarkGray
} else {
    Write-Warning "No installer found under $bundle"
}
