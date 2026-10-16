# Signing secrets stay outside the checkout and are encrypted for this Windows user.
$script:UpdaterKeyDirectory = Join-Path $env:USERPROFILE '.openisave\signing'
$script:UpdaterKeyFile = Join-Path $script:UpdaterKeyDirectory 'updater-key.dpapi'
$script:UpdaterPublicFile = Join-Path $script:UpdaterKeyDirectory 'updater-key.pub'
$script:UpdaterEntropy = [System.Text.Encoding]::UTF8.GetBytes('com.openisave.desktop/updater/v1')
Add-Type -AssemblyName System.Security.Cryptography.ProtectedData

function Initialize-UpdaterSigning {
    if (Test-Path -LiteralPath $script:UpdaterKeyFile) {
        if (-not (Test-Path -LiteralPath $script:UpdaterPublicFile)) { throw 'Updater public key is missing.' }
        return
    }
    New-Item -ItemType Directory -Path $script:UpdaterKeyDirectory -Force | Out-Null
    $stagingKey = Join-Path $script:UpdaterKeyDirectory ('new-' + [Guid]::NewGuid().ToString('N') + '.key')
    try {
        $cli = Join-Path (Split-Path -Parent $PSScriptRoot) 'node_modules\@tauri-apps\cli\tauri.js'
        $signerOutput = & node $cli signer generate --ci --write-keys $stagingKey 2>&1
        if ($LASTEXITCODE -ne 0) { throw 'Could not generate the updater signing key.' }
        $plain = [System.IO.File]::ReadAllBytes($stagingKey)
        $protected = [System.Security.Cryptography.ProtectedData]::Protect(
            $plain, $script:UpdaterEntropy, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
        [System.IO.File]::WriteAllBytes($script:UpdaterKeyFile, $protected)
        Copy-Item -LiteralPath ($stagingKey + '.pub') -Destination $script:UpdaterPublicFile
        [Array]::Clear($plain, 0, $plain.Length)
    } finally {
        $signerOutput = $null
        if (Test-Path -LiteralPath $stagingKey) { Remove-Item -LiteralPath $stagingKey }
        if (Test-Path -LiteralPath ($stagingKey + '.pub')) { Remove-Item -LiteralPath ($stagingKey + '.pub') }
    }
}

function Read-UpdaterSigningKey {
    if (-not (Test-Path -LiteralPath $script:UpdaterKeyFile)) {
        throw 'Updater signing key is missing. Restore the original signing key before releasing.'
    }
    $plain = [System.Security.Cryptography.ProtectedData]::Unprotect(
        [System.IO.File]::ReadAllBytes($script:UpdaterKeyFile), $script:UpdaterEntropy,
        [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
    try { return [System.Text.Encoding]::UTF8.GetString($plain).Trim() }
    finally { [Array]::Clear($plain, 0, $plain.Length) }
}
