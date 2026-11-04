<#
.SYNOPSIS
  Backs the Settings screen's "Re-provision" button (see
  pi-player/src/selfUpdate.ts) - the full path: re-runs install.ps1 fresh from
  GitHub (so it also picks up any change to install.ps1/start-kiosk.ps1
  themselves, not just the app) and reboots. Mirrors pi-player/bin/reprovision.sh,
  including its own reasoning for curling fresh rather than running the local
  checkout's copy of itself mid-pull.
#>

$ErrorActionPreference = 'Stop'

$BranchUrl = 'https://raw.githubusercontent.com/yusufmiahav/SignageMadeEasy/claude/signage-made-easy-dev-r00fl6/pi-player/windows/install.ps1'
$DataDir = 'C:\ProgramData\SignageMadeEasy'
$LogFile = Join-Path $DataDir 'logs\self-update.log'

"$(Get-Date -Format o) starting reprovision" | Tee-Object -FilePath $LogFile -Append

Invoke-Expression (Invoke-RestMethod -Uri $BranchUrl)

Restart-Computer -Force
