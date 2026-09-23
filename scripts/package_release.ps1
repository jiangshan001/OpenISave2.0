<#
    Assembles the release folder for publishing on GitHub Releases.

        powershell -ExecutionPolicy Bypass -File .\scripts\package_release.ps1

    Run after scripts\package_windows.ps1. Produces:

        release\
        +-- OpenISave_<version>_x64-setup.exe      copied from desktop\target
        +-- OpenISave2-v<version>-source.zip       exactly the files Git would commit
        +-- SHA256SUMS.txt

    The source ZIP is built from `git ls-files` (tracked plus untracked files
    that .gitignore does not exclude), so it never contains node_modules, .venv,
    target, build output, databases, backups, logs or .env files. As a second
    line of defence the script refuses to continue if any such file slips in.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Split-Path -Parent $PSScriptRoot)).Path.TrimEnd('\')
Set-Location $root

if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'git is required to build the source package.' }
if (-not (Test-Path (Join-Path $root '.git'))) { throw 'Not a Git repository: the source list comes from git ls-files.' }

$version = (Get-Content (Join-Path $root 'desktop\tauri.conf.json') -Raw | ConvertFrom-Json).version
$release = Join-Path $root 'release'
$installerName = "OpenISave_${version}_x64-setup.exe"
$installer = Join-Path $root "desktop\target\release\bundle\nsis\$installerName"
$zipName = "OpenISave2-v$version-source.zip"
$zipPath = Join-Path $release $zipName

if (-not (Test-Path $release)) { New-Item -ItemType Directory $release | Out-Null }
if (-not (Test-Path $installer)) {
    # desktop\target may already have been cleaned; reuse the installer copied earlier.
    $installer = Join-Path $release $installerName
    if (-not (Test-Path $installer)) { throw "Installer not found.`nRun scripts\package_windows.ps1 first." }
    Write-Host "Using the existing $installerName in release\" -ForegroundColor DarkGray
}

# --- Source file list -------------------------------------------------------
$files = @(git -c core.quotepath=false ls-files --cached --others --exclude-standard) |
    Where-Object { $_ -and (Test-Path -LiteralPath (Join-Path $root $_) -PathType Leaf) } |
    Sort-Object -Unique
if ($files.Count -eq 0) { throw 'git ls-files returned no files.' }

$forbidden = '(^|/)(node_modules|\.venv|venv|target|dist|build|backups|logs|data|release|__pycache__)/|\.(db|db-wal|db-shm|sqlite|sqlite3|log|csv|pyc|zip|msi)$|(^|/)\.env($|\.)|-setup\.exe$'
$bad = @($files | Where-Object { $_ -match $forbidden -and $_ -notmatch '(^|/)\.env\.example$' })
if ($bad.Count -gt 0) { throw "Refusing to package forbidden files:`n  $($bad -join "`n  ")" }

foreach ($relative in $files) {
    $full = Join-Path $root $relative
    $stream = [System.IO.File]::OpenRead($full)
    try {
        $header = New-Object byte[] 16
        $read = $stream.Read($header, 0, 16)
    } finally { $stream.Dispose() }
    if ($read -ge 15 -and [System.Text.Encoding]::ASCII.GetString($header, 0, 15) -eq 'SQLite format 3') {
        throw "Refusing to package a SQLite database: $relative"
    }
}

# --- Source ZIP ---------------------------------------------------------------
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
if (Test-Path $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
$zip = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($relative in $files) {
        $entry = 'OpenISave2/' + ($relative -replace '\\', '/')
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $zip, (Join-Path $root $relative), $entry, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
} finally { $zip.Dispose() }

# --- Installer and checksums --------------------------------------------------
$installerTarget = Join-Path $release $installerName
if ($installer -ne $installerTarget) { Copy-Item -LiteralPath $installer -Destination $installerTarget -Force }

$lines = foreach ($name in @($installerName, $zipName)) {
    $hash = (Get-FileHash -LiteralPath (Join-Path $release $name) -Algorithm SHA256).Hash.ToLowerInvariant()
    "$hash  $name"
}
# sha256sum format, LF line endings, no BOM, so `sha256sum -c SHA256SUMS.txt` works.
[System.IO.File]::WriteAllText((Join-Path $release 'SHA256SUMS.txt'), (($lines -join "`n") + "`n"), (New-Object System.Text.UTF8Encoding $false))

Write-Host ''
Write-Host "Release $version ready in $release" -ForegroundColor Green
Get-ChildItem $release -File | ForEach-Object {
    Write-Host ('  {0,-40} {1,8:N1} MB' -f $_.Name, ($_.Length / 1MB))
}
Write-Host "  ($($files.Count) files in the source package)" -ForegroundColor DarkGray
