<#
.SYNOPSIS
  Runs the real worker image (all pentest tools inside) next to your local API and
  database. Nothing is installed on Windows.

.EXAMPLE
  .\scripts\worker-dev.ps1 up            # build the image if needed and start the worker
  .\scripts\worker-dev.ps1 up -Deep      # same, with the DEEP profile enabled in the worker
  .\scripts\worker-dev.ps1 lab-up        # Juice Shop (juice.lab.test) and DVWA (dvwa.lab.test)
  .\scripts\worker-dev.ps1 tools         # the tool preflight table from the worker's boot log
  .\scripts\worker-dev.ps1 logs
  .\scripts\worker-dev.ps1 down

  The API on your machine must use the same SCAN_DEEP_PROFILE_ENABLED value (set it
  in apps/api/.env). See docs/operations/local-worker.md.
#>
param(
  [Parameter(Position = 0)]
  [ValidateSet('up', 'down', 'logs', 'status', 'build', 'rebuild', 'lab-up', 'lab-down', 'tools', 'shell')]
  [string]$Command = 'status',
  [switch]$Deep
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$composeFile = 'docker-compose.worker-dev.yml'

docker info *> $null
if ($LASTEXITCODE -ne 0) { throw 'Docker is not running. Start Docker Desktop and try again.' }

# The worker reads the same apps/api/.env as the API. Only DATABASE_URL differs: from
# inside a container the database on your machine is host.docker.internal, not 127.0.0.1.
# The value (it holds the password) is passed through the environment and never printed.
$envFile = Join-Path $root 'apps/api/.env'
if (-not (Test-Path $envFile)) { throw "apps/api/.env not found. Copy apps/api/.env.example first." }
$line = Get-Content $envFile | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -First 1
if (-not $line) { throw 'DATABASE_URL is not set in apps/api/.env.' }
$url = ($line -replace '^\s*DATABASE_URL\s*=\s*', '').Trim().Trim('"').Trim("'")
$env:WORKER_DEV_DATABASE_URL = $url -replace '@(127\.0\.0\.1|localhost)([:/])', '@host.docker.internal$2'
if ($Deep) { $env:SCAN_DEEP_PROFILE_ENABLED = 'true' }

# docker prints progress on stderr; that is not an error, only the exit code is.
function Compose {
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  docker compose -f $composeFile @args
  $code = $LASTEXITCODE
  $ErrorActionPreference = $previous
  if ($code -ne 0) { throw "docker compose $($args -join ' ') failed (exit $code)" }
}

switch ($Command) {
  'build'    { Compose build worker-dev }
  'rebuild'  { Compose build --no-cache worker-dev }
  'up'       { Compose up -d --build worker-dev; Write-Host "`nWorker started. Tool table: .\scripts\worker-dev.ps1 tools" }
  'down'     { Compose down }
  'logs'     { Compose logs -f --tail 100 worker-dev }
  'status'   { Compose ps -a }
  'lab-up'   { Compose --profile lab up -d juice dvwa proof; Write-Host "`nLab: http://127.0.0.1:3300 (Juice Shop), http://127.0.0.1:4280 (DVWA). Inside the network: juice.lab.test, dvwa.lab.test" }
  'lab-down' { Compose --profile lab stop juice dvwa proof }
  'tools'    { Compose logs --no-log-prefix --tail 400 worker-dev | Select-String -Pattern 'Tool preflight' -Context 0, 10 }
  'shell'    { Compose exec worker-dev sh }
}
