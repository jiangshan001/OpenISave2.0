<#
    Starts the API and the web interface in two separate PowerShell windows,
    then opens the browser.
#>
[CmdletBinding()]
param(
    [int]$Port = 8756,
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$scripts = $PSScriptRoot

Write-Host 'Starting the OpenISave 2.0 API...' -ForegroundColor Cyan
Start-Process powershell -ArgumentList @(
    '-NoExit', '-ExecutionPolicy', 'Bypass',
    '-File', (Join-Path $scripts 'start_backend.ps1'),
    '-Port', $Port
)

Write-Host 'Waiting for the API to become available...' -ForegroundColor DarkGray
$ready = $false
foreach ($attempt in 1..60) {
    Start-Sleep -Seconds 2
    try {
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/api/v1/health" -UseBasicParsing -TimeoutSec 3
        if ($response.StatusCode -eq 200) { $ready = $true; break }
    } catch { }
}

if (-not $ready) {
    Write-Warning 'The API did not respond in time. Check its window for errors.'
} else {
    Write-Host 'API is ready.' -ForegroundColor Green
}

Write-Host 'Starting the web interface...' -ForegroundColor Cyan
Start-Process powershell -ArgumentList @(
    '-NoExit', '-ExecutionPolicy', 'Bypass',
    '-File', (Join-Path $scripts 'start_frontend.ps1')
)

if (-not $NoBrowser) {
    Start-Sleep -Seconds 6
    Start-Process 'http://127.0.0.1:5173'
}

Write-Host ''
Write-Host 'OpenISave 2.0 is starting in two separate windows.' -ForegroundColor Green
Write-Host '  API  http://127.0.0.1:' -NoNewline; Write-Host $Port
Write-Host '  App  http://127.0.0.1:5173'
Write-Host 'Close those windows to stop the application.' -ForegroundColor DarkGray
