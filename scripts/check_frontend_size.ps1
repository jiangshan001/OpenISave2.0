<#
    Enforces the 350-line limit on handwritten frontend source files.
    Exits non-zero when any file breaks the rule.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$frontend = Join-Path (Split-Path -Parent $PSScriptRoot) 'frontend'
Set-Location $frontend

node scripts/check-file-size.mjs
exit $LASTEXITCODE
