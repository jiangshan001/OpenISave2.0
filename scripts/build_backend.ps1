<#
    Bundles the FastAPI backend into a standalone folder the desktop app ships.
    Output: desktop\binaries\openisave-server\openisave-server.exe
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root 'backend'
$target = Join-Path $root 'desktop\binaries'
$python = Join-Path $backend '.venv\Scripts\python.exe'

if (-not (Test-Path $python)) {
    throw "Backend virtual environment not found. Run scripts\start_backend.ps1 once first."
}

Set-Location $backend
Write-Host 'Installing build dependencies...' -ForegroundColor Cyan
& $python -m pip install -r requirements-dev.txt --quiet

Write-Host 'Bundling the backend with PyInstaller...' -ForegroundColor Cyan
& $python -m PyInstaller openisave_server.spec --noconfirm --clean --distpath (Join-Path $backend 'dist') --workpath (Join-Path $backend 'build')
if ($LASTEXITCODE -ne 0) { throw 'PyInstaller failed.' }

$built = Join-Path $backend 'dist\openisave-server'
if (-not (Test-Path (Join-Path $built 'openisave-server.exe'))) {
    throw "Expected executable not found in $built"
}

Write-Host 'Copying into the desktop bundle...' -ForegroundColor Cyan
if (-not (Test-Path $target)) { New-Item -ItemType Directory -Force $target | Out-Null }
$destination = Join-Path $target 'openisave-server'
if (Test-Path $destination) { Remove-Item $destination -Recurse -Force }
Copy-Item $built $destination -Recurse

$size = [math]::Round((Get-ChildItem $destination -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB, 1)
Write-Host ''
Write-Host "Backend bundled to $destination ($size MB)" -ForegroundColor Green
