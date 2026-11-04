<#
.SYNOPSIS
  Backs the Settings screen's "Update" button (see pi-player/src/selfUpdate.ts) -
  the fast path: app code only, not Node.js/git themselves or the scheduled task
  (see reprovision.ps1 for that). Mirrors pi-player/bin/self-update.sh.
#>

$ErrorActionPreference = 'Stop'

$AppDir = Split-Path -Parent $PSScriptRoot
$RepoDir = Split-Path -Parent $AppDir
$DataDir = 'C:\ProgramData\SignageMadeEasy'
$LogFile = Join-Path $DataDir 'logs\self-update.log'

function Log($Message) {
  "$(Get-Date -Format o) $Message" | Tee-Object -FilePath $LogFile -Append
}

try {
  Log 'starting update'
  git -C $RepoDir pull --ff-only
  # Same PowerShell-5.1-compatible UTC formatting as install.ps1 - see its comment.
  (Get-Date).ToUniversalTime().ToString('yyyy.MM.dd') | Set-Content -Path (Join-Path $DataDir 'version') -NoNewline

  Push-Location $AppDir
  try {
    npm install
    npm run build
  } finally {
    Pop-Location
  }

  # Kills just the player's own node process (identified by the port it's bound
  # to, not by process name alone - other node.exe processes could be running
  # for unrelated reasons) - start-kiosk.ps1's own supervisor loop notices it
  # exit and restarts both the server and the kiosk window with the new build,
  # same effect as `systemctl restart signage-player` on the Linux build.
  $conn = Get-NetTCPConnection -LocalPort 8088 -State Listen -ErrorAction SilentlyContinue
  if ($conn) {
    Stop-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
  }
  Log 'update finished'
} catch {
  Log "update failed: $_"
  throw
}
