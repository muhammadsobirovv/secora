# PentestHub AI — Windows Server installer (Module 10: Production
# Deployment). Registers the API and worker processes as native Windows
# Services using NSSM (the Non-Sucking Service Manager) — Node.js has no
# built-in "run as a Windows Service" capability, and NSSM is the
# de-facto standard tool for wrapping an arbitrary long-running console
# process (like `node dist/src/main.js`) as a properly supervised
# service with automatic restart-on-crash, instead of relying on a
# fragile scheduled-task-at-logon workaround.
#
# Usage (run as Administrator, from an elevated PowerShell prompt):
#   .\deploy\windows\install-service.ps1 -RepoPath "C:\path\to\pentesthub-ai" -InstallPath "C:\PentestHubAI"
#
# Prerequisites: Node.js 20 LTS and pnpm already installed and on PATH
# (see the Module 7 Desktop Agent verification handoff docs for the same
# Node-on-Windows setup steps, if this is the first time setting up this
# machine). NSSM itself is downloaded automatically below if not already
# present.

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$RepoPath,

    [string]$InstallPath = "C:\PentestHubAI",

    [string]$ConfigPath = "C:\ProgramData\PentestHubAI"
)

$ErrorActionPreference = "Stop"

function Assert-Admin {
    $currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw "This script must be run from an elevated (Administrator) PowerShell prompt."
    }
}
Assert-Admin

Write-Host "==> Copying application into $InstallPath"
New-Item -ItemType Directory -Force -Path $InstallPath | Out-Null
# robocopy's /MIR mirrors the source into the destination (deletes files
# in the destination that no longer exist in source) — the Windows
# equivalent of the Linux installer's `rsync --delete`, so re-running
# this script to deploy an update doesn't leave stale files behind.
# Exit codes 0-7 are all "success" for robocopy (8+ is a real failure).
robocopy $RepoPath $InstallPath /MIR /XD node_modules .git .turbo .next dist generated /NFL /NDL /NJH
if ($LASTEXITCODE -ge 8) { throw "robocopy failed with exit code $LASTEXITCODE" }

Write-Host "==> Installing dependencies and building"
Push-Location $InstallPath
pnpm install --frozen-lockfile
pnpm --filter api exec prisma generate
pnpm --filter api build
Pop-Location

Write-Host "==> Writing config directory (edit the .env files with real secrets before starting the services)"
New-Item -ItemType Directory -Force -Path $ConfigPath | Out-Null
$apiEnvPath = Join-Path $ConfigPath "api.env"
if (-not (Test-Path $apiEnvPath)) {
    @"
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://pentesthub:CHANGE_ME@localhost:5432/pentesthub
DATABASE_POOL_MAX=10
JWT_ACCESS_SECRET=CHANGE_ME_32_PLUS_CHARS
CREDENTIAL_ENCRYPTION_KEY=CHANGE_ME_32_PLUS_CHARS_DIFFERENT
FRONTEND_URL=https://app.your-company.com
TRUST_PROXY_HOPS=1
LOG_LEVEL=info
"@ | Set-Content -Path $apiEnvPath -Encoding UTF8
    Write-Host "    Wrote a template $apiEnvPath — edit it with real secrets before starting the service."
}
$workerEnvPath = Join-Path $ConfigPath "worker.env"
if (-not (Test-Path $workerEnvPath)) { Copy-Item $apiEnvPath $workerEnvPath }

Write-Host "==> Ensuring NSSM is available"
$nssmDir = Join-Path $InstallPath "deploy\windows\nssm"
$nssmExe = Join-Path $nssmDir "nssm.exe"
if (-not (Test-Path $nssmExe)) {
    New-Item -ItemType Directory -Force -Path $nssmDir | Out-Null
    $nssmZip = Join-Path $env:TEMP "nssm.zip"
    Write-Host "    Downloading NSSM..."
    Invoke-WebRequest -Uri "https://nssm.cc/release/nssm-2.24.zip" -OutFile $nssmZip
    Expand-Archive -Path $nssmZip -DestinationPath $env:TEMP -Force
    Copy-Item (Join-Path $env:TEMP "nssm-2.24\win64\nssm.exe") $nssmExe
}

function Install-PentestHubService {
    param([string]$ServiceName, [string]$ScriptRelativePath, [string]$EnvFile, [string]$DisplayName)

    if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
        Write-Host "==> $ServiceName already registered — stopping to reconfigure"
        & $nssmExe stop $ServiceName | Out-Null
        & $nssmExe remove $ServiceName confirm | Out-Null
    }

    Write-Host "==> Registering $ServiceName"
    $nodeExe = (Get-Command node).Source
    $scriptPath = Join-Path $InstallPath $ScriptRelativePath
    & $nssmExe install $ServiceName $nodeExe $scriptPath
    & $nssmExe set $ServiceName AppDirectory (Join-Path $InstallPath "apps\api")
    & $nssmExe set $ServiceName DisplayName $DisplayName
    & $nssmExe set $ServiceName AppEnvironmentExtra "NODE_ENV=production"
    & $nssmExe set $ServiceName AppStdout (Join-Path $ConfigPath "$ServiceName.out.log")
    & $nssmExe set $ServiceName AppStderr (Join-Path $ConfigPath "$ServiceName.err.log")
    & $nssmExe set $ServiceName AppRotateFiles 1
    & $nssmExe set $ServiceName AppRotateBytes 10485760
    # Restart on crash, but not in a tight loop if it's crash-looping —
    # NSSM's own throttle: if it exits within 1500ms of starting, treat
    # that as a crash-loop and back off.
    & $nssmExe set $ServiceName AppThrottle 1500
    & $nssmExe set $ServiceName AppExit Default Restart
    & $nssmExe set $ServiceName Start SERVICE_AUTO_START

    # Load EnvFile's KEY=VALUE lines as the service's environment —
    # NSSM has no native "load a .env file" option, so this reads it here
    # and passes the whole block via AppEnvironmentExtra.
    $envLines = Get-Content $EnvFile | Where-Object { $_ -match '^\s*[^#].*=' }
    $envBlock = ($envLines -join "`r`n")
    & $nssmExe set $ServiceName AppEnvironmentExtra $envBlock

    Write-Host "    Starting $ServiceName..."
    & $nssmExe start $ServiceName
}

Install-PentestHubService -ServiceName "PentestHubAPI" -ScriptRelativePath "apps\api\dist\src\main.js" -EnvFile $apiEnvPath -DisplayName "PentestHub AI - API Server"
Install-PentestHubService -ServiceName "PentestHubWorker" -ScriptRelativePath "apps\api\dist\src\worker.main.js" -EnvFile $workerEnvPath -DisplayName "PentestHub AI - Background Worker"

Write-Host ""
Write-Host "==> Done. Services 'PentestHubAPI' and 'PentestHubWorker' are installed and running."
Write-Host "    Manage them with: Get-Service PentestHub*  /  Restart-Service PentestHubAPI  /  services.msc"
Write-Host "    Logs: $ConfigPath\*.out.log and *.err.log"
Write-Host ""
Write-Host "    First-time schema setup (run once): cd `"$InstallPath`"; pnpm --filter api exec prisma db push --skip-generate"
