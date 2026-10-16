[CmdletBinding()]
param([switch]$Published)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath (Split-Path -Parent $PSScriptRoot)).Path
Push-Location (Join-Path $root 'desktop')
try {
    $buildMessages = & cargo test --lib --no-run --message-format=json
    if ($LASTEXITCODE -ne 0) { throw 'Native test build failed.' }
    $testExecutables = @($buildMessages | ForEach-Object {
        try { $entry = $_ | ConvertFrom-Json } catch { return }
        if ($entry.reason -eq 'compiler-artifact' -and $entry.profile.test -and $entry.executable) {
            $entry.executable
        }
    })
    if ($testExecutables.Count -eq 0) { throw 'No native test executable was generated.' }
    $sdkBin = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\bin'
    $manifestTool = Get-ChildItem -LiteralPath $sdkBin -Directory | Sort-Object Name -Descending |
        ForEach-Object { Join-Path $_.FullName 'x64\mt.exe' } |
        Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if (-not $manifestTool) { throw 'Windows SDK mt.exe is required for native updater tests.' }
    foreach ($testExecutable in $testExecutables) {
        $resolvedTest = (Resolve-Path -LiteralPath $testExecutable).Path
        $allowedRoot = Join-Path $root 'desktop\target\debug\deps\'
        if (-not $resolvedTest.StartsWith($allowedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw 'Unexpected native test executable path.'
        }
        # Tauri embeds the v6 common-controls manifest in the application binary.
        # Cargo's lib-test harness needs its own manifest for TaskDialogIndirect.
        & $manifestTool '-nologo' '-manifest' (Join-Path $PSScriptRoot 'windows-test.manifest') "-outputresource:$resolvedTest;#1"
        if ($LASTEXITCODE -ne 0) { throw 'Could not embed the native test manifest.' }
        if ($Published) {
            & $resolvedTest --ignored --exact updates_download_tests::verifies_published_signed_installer --nocapture
        } else {
            & $resolvedTest
        }
        if ($LASTEXITCODE -ne 0) { throw 'Native updater tests failed.' }
    }
} finally { Pop-Location }
