<#
.SYNOPSIS
  Local PostgreSQL for Metallic development and tests, without admin rights, Docker or an installer.

.DESCRIPTION
  Uses the official PostgreSQL Windows binaries zip (built by EDB, linked from postgresql.org).
  Everything lives under %LOCALAPPDATA%\Metallic\pg:
    download\   the zip (deleted after a successful install)
    pgsql\      bin, lib and share extracted from the zip (no pgAdmin, docs, headers or symbols)
    data\       the cluster (listens on 127.0.0.1 only, scram-sha-256 auth)
    dev-password  random password of the `metallic` superuser (never in git)

  Trust: the zip comes over HTTPS from get.enterprisedb.com (the host postgresql.org links to). EDB publishes no
  checksum and the binaries inside the zip are not Authenticode-signed (only EDB's installer is), so the zip's
  SHA-256 is pinned below. The pin was recorded on 2026-10-30 and cross-checked against the independently maintained
  Scoop manifest (ScoopInstaller/Main bucket/postgresql.json, same version, same hash). Nothing is extracted or run
  unless the hash matches. Upgrading = change $Version and $ZipSha256 after the same cross-check.

  Commands:
    install   download (if needed), verify, extract
    init      create the cluster with a random password (install first)
    start     start the cluster in the background (no window)
    stop      stop it
    status    show whether it runs
    url       print the database URL for METALLIC_DATABASE_URL (contains the dev password; do not commit it)
    setup     install + init + start (idempotent)
#>
param(
  [Parameter(Position = 0)]
  [ValidateSet('install', 'init', 'start', 'stop', 'status', 'url', 'setup')]
  [string]$Command = 'setup',
  [int]$Port = 54329
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Version = '18.6-5'
$ZipName = "postgresql-$Version-windows-x64-binaries.zip"
$ZipUrl = "https://get.enterprisedb.com/postgresql/$ZipName"
$ZipSha256 = 'e2246ba91d22345bc3d017586c09ede52d9df180b1eeb480f050445f1cad84e2'

$Root = Join-Path $env:LOCALAPPDATA 'Metallic\pg'
$DownloadDir = Join-Path $Root 'download'
$PgDir = Join-Path $Root 'pgsql'
$Bin = Join-Path $PgDir 'bin'
$DataDir = Join-Path $Root 'data'
$PasswordFile = Join-Path $Root 'dev-password'
$LogFile = Join-Path $Root 'postgres.log'

function Test-Installed { Test-Path (Join-Path $Bin 'pg_ctl.exe') }

function Install-Postgres {
  if (Test-Installed) { Write-Output "PostgreSQL $Version already installed in $PgDir"; return }
  New-Item -ItemType Directory -Force $DownloadDir | Out-Null
  $zip = Join-Path $DownloadDir $ZipName
  if (-not (Test-Path $zip)) {
    Write-Output "Downloading $ZipUrl"
    $ProgressPreference = 'SilentlyContinue'
    Invoke-WebRequest -UseBasicParsing -Uri $ZipUrl -OutFile $zip
  }
  $hash = (Get-FileHash -Algorithm SHA256 $zip).Hash.ToLowerInvariant()
  if ($hash -ne $ZipSha256) {
    Remove-Item -Force $zip
    throw "SHA-256 mismatch for $ZipName (got $hash). The file was deleted; nothing was extracted."
  }
  Write-Output 'SHA-256 matches the pinned value.'

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $staging = Join-Path $Root 'staging'
  if (Test-Path $staging) { Remove-Item -Recurse -Force $staging }
  New-Item -ItemType Directory -Force $staging | Out-Null
  $archive = [System.IO.Compression.ZipFile]::OpenRead($zip)
  try {
    foreach ($entry in $archive.Entries) {
      $name = $entry.FullName -replace '\\', '/'
      if ($name -notmatch '^pgsql/(bin|lib|share)/') { continue }
      if ($name -match '^pgsql/(lib/.*\.(lib|a|pdb)|bin/.*\.pdb)$') { continue }
      if ($name.EndsWith('/')) { continue }
      $target = [System.IO.Path]::GetFullPath((Join-Path $staging $name))
      if (-not $target.StartsWith([System.IO.Path]::GetFullPath($staging))) { throw "unsafe path in zip: $name" }
      New-Item -ItemType Directory -Force (Split-Path $target) | Out-Null
      [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $target, $true)
    }
  } finally { $archive.Dispose() }

  Move-Item (Join-Path $staging 'pgsql') $PgDir
  Remove-Item -Recurse -Force $staging
  Remove-Item -Force $zip
  Write-Output "Installed PostgreSQL $Version in $PgDir"
}

function New-Password {
  $bytes = New-Object byte[] 24
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return ([Convert]::ToBase64String($bytes) -replace '[+/=]', 'x')
}

function Initialize-Cluster {
  if (-not (Test-Installed)) { throw 'Run install first.' }
  if (Test-Path (Join-Path $DataDir 'PG_VERSION')) { Write-Output "Cluster already exists in $DataDir"; return }
  $pw = New-Password
  $pwTmp = Join-Path $Root 'initdb-pw.tmp'
  Set-Content -NoNewline -Encoding ascii -Path $pwTmp -Value $pw
  try {
    & (Join-Path $Bin 'initdb.exe') -D $DataDir -U metallic --auth=scram-sha-256 --pwfile=$pwTmp -E UTF8 --locale=C | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "initdb failed ($LASTEXITCODE)" }
  } finally { Remove-Item -Force $pwTmp }
  Set-Content -NoNewline -Encoding ascii -Path $PasswordFile -Value $pw
  Add-Content -Encoding ascii -Path (Join-Path $DataDir 'postgresql.conf') -Value @"

# Metallic dev settings
listen_addresses = '127.0.0.1'
port = $Port
max_connections = 200
fsync = off
synchronous_commit = off
full_page_writes = off
"@
  Write-Output "Cluster created in $DataDir (port $Port, user metallic, password in $PasswordFile)"
}

function Test-Running {
  & (Join-Path $Bin 'pg_ctl.exe') -D $DataDir status *> $null
  return ($LASTEXITCODE -eq 0)
}

function Start-Cluster {
  if (Test-Running) { Write-Output 'Already running.'; return }
  # Started through WMI so the server is fully detached: no console window, no inherited pipes or console from
  # the caller (a caller's pipe would otherwise never close, and a closed console makes new backends fail with
  # 0xC0000142). Runs as the current user; no admin needed.
  $cmd = "`"$(Join-Path $Bin 'pg_ctl.exe')`" -D `"$DataDir`" -l `"$LogFile`" start"
  $r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $cmd; CurrentDirectory = $Root }
  if ($r.ReturnValue -ne 0) { throw "could not launch pg_ctl (WMI code $($r.ReturnValue))" }
  $deadline = (Get-Date).AddSeconds(60)
  while (-not (Test-Running)) {
    if ((Get-Date) -gt $deadline) { throw "PostgreSQL did not start within 60 s; see $LogFile" }
    Start-Sleep -Milliseconds 500
  }
  & (Join-Path $Bin 'pg_isready.exe') -h 127.0.0.1 -p $Port -t 30 | Out-Null
  Write-Output "Started on 127.0.0.1:$Port"
}

function Initialize-Database {
  $env:PGPASSWORD = (Get-Content -Raw $PasswordFile)
  try {
    $exists = & (Join-Path $Bin 'psql.exe') -h 127.0.0.1 -p $Port -U metallic -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = 'metallic'"
    if ($exists -ne '1') {
      & (Join-Path $Bin 'createdb.exe') -h 127.0.0.1 -p $Port -U metallic metallic
      if ($LASTEXITCODE -ne 0) { throw 'createdb failed' }
      Write-Output 'Created database metallic.'
    }
  } finally { Remove-Item Env:PGPASSWORD }
}

function Stop-Cluster {
  if (-not (Test-Running)) { Write-Output 'Not running.'; return }
  & (Join-Path $Bin 'pg_ctl.exe') -D $DataDir -m fast -w stop | Out-Null
  Write-Output 'Stopped.'
}

switch ($Command) {
  'install' { Install-Postgres }
  'init' { Initialize-Cluster }
  'start' { Start-Cluster }
  'stop' { Stop-Cluster }
  'status' { if (Test-Running) { Write-Output "running on 127.0.0.1:$Port" } else { Write-Output 'stopped' } }
  'url' { Write-Output "postgres://metallic:$(Get-Content -Raw $PasswordFile)@127.0.0.1:$Port/metallic" }
  'setup' { Install-Postgres; Initialize-Cluster; Start-Cluster; Initialize-Database }
}
