<#
.SYNOPSIS
  Starts the player server and the Edge kiosk window, and keeps both running -
  the Windows equivalent of pi-player's signage-player.service +
  signage-kiosk.service pair. Launched by the "SignageMadeEasyKiosk" scheduled
  task (see install.ps1) at logon; also safe to run directly to test.
#>

$ErrorActionPreference = 'Continue'

$AppDir = Split-Path -Parent $PSScriptRoot
$DataDir = 'C:\ProgramData\SignageMadeEasy'
$LogDir = Join-Path $DataDir 'logs'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

# Same SIGNAGE_* env vars pi-player/src reads everywhere else (config.ts,
# mediaCache.ts, localContent.ts, diagnostics.ts, ...) - pointed at ProgramData
# instead of each module's own Linux default (/opt/signage/...), nothing in that
# source needed to change for this to work (see pi-player/README.md's "Windows"
# section).
$env:SIGNAGE_CONFIG_PATH = Join-Path $DataDir 'config.json'
$env:SIGNAGE_CONFIG_PATH_OUTPUT2 = Join-Path $DataDir 'config-output2.json'
$env:SIGNAGE_CACHE_DIR = Join-Path $DataDir 'cache'
$env:SIGNAGE_LOCAL_CONTENT_DIR = Join-Path $DataDir 'local-content'
$env:SIGNAGE_USB_OVERRIDE_DIR = Join-Path $DataDir 'usb-override'
$env:SIGNAGE_VERSION_PATH = Join-Path $DataDir 'version'
$env:SIGNAGE_SELF_UPDATE_SCRIPT = Join-Path $PSScriptRoot 'self-update.ps1'
$env:SIGNAGE_REPROVISION_SCRIPT = Join-Path $PSScriptRoot 'reprovision.ps1'
$env:PORT = '8088'

function Wait-ForServer {
  for ($i = 0; $i -lt 60; $i++) {
    try {
      $res = Invoke-WebRequest -Uri 'http://localhost:8088/state' -UseBasicParsing -TimeoutSec 2
      if ($res.StatusCode -eq 200) { return $true }
    } catch {}
    Start-Sleep -Seconds 1
  }
  return $false
}

function Find-Edge {
  $candidates = @(
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
  )
  foreach ($c in $candidates) { if (Test-Path $c) { return $c } }
  throw 'Microsoft Edge not found - it ships with Windows 10/11 by default; if this is a stripped-down image, install it or point this script at Chrome instead.'
}

$edgePath = Find-Edge
# Start-Process -FilePath 'node' (a bare name, no extension) can fail to resolve
# via PATH even though plain `node` works fine when typed directly at a prompt -
# confirmed on real hardware: combining -RedirectStandardOutput/-RedirectStandardError
# (which forces UseShellExecute off) with an unresolved bare name hits a gap in
# CreateProcess's own PATH search, which (unlike PowerShell's own command
# resolution) doesn't try appending .exe on its own. Resolving the real path once
# up front sidesteps it entirely.
$nodeExe = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $nodeExe) { throw 'node.exe not found on PATH - re-run install.ps1 (it installs Node.js via winget), then open a fresh PowerShell window so the updated PATH is picked up.' }
# Dedicated profile, not the logged-in user's own Edge profile - avoids any
# first-run/sign-in prompts tied to a real Microsoft account getting in the way
# of a kiosk that's supposed to come up to content with nobody there to dismiss
# them, and keeps this install's browser state wholly separate from whatever
# else might ever run on this account.
$edgeProfileDir = Join-Path $DataDir 'edge-profile'

# Mirrors systemd's Restart=always for both the player process and the kiosk
# window - if either dies (crash, someone closing the window, a Windows update
# restarting Edge), this loop brings both back within a couple of seconds.
while ($true) {
  Write-Host "[$(Get-Date -Format o)] starting player server"
  $serverLog = Join-Path $LogDir 'player.log'
  $serverProc = Start-Process -FilePath $nodeExe -ArgumentList 'dist/index.js' -WorkingDirectory $AppDir `
    -RedirectStandardOutput $serverLog -RedirectStandardError (Join-Path $LogDir 'player-error.log') -PassThru -WindowStyle Hidden

  if (-not (Wait-ForServer)) {
    Write-Host "[$(Get-Date -Format o)] player server didn't come up - see $serverLog"
    Stop-Process -Id $serverProc.Id -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 5
    continue
  }

  Write-Host "[$(Get-Date -Format o)] starting kiosk window"
  # --remote-debugging-port backs the Settings screen's "Preview" button (see
  # pi-player/src/preview.ts) - captured via the Chrome DevTools Protocol, same
  # mechanism as the Linux/sway build, no extra tooling needed either side.
  $edgeArgs = @(
    '--kiosk', 'http://localhost:8088',
    '--edge-kiosk-type=fullscreen',
    '--no-first-run', '--noerrdialogs', '--disable-translate',
    '--remote-debugging-port=9222',
    "--user-data-dir=$edgeProfileDir"
  )
  $edgeProc = Start-Process -FilePath $edgePath -ArgumentList $edgeArgs -PassThru

  # Polls rather than Wait-Process -Id @(...), which waits for EVERY listed
  # process to exit, not the first one - the wrong shape here: either one dying
  # (self-update.ps1 killing node, someone closing the kiosk window, Edge
  # crashing) should trigger restarting BOTH, without waiting on the other half
  # to also happen to exit on its own first.
  while ((Get-Process -Id $serverProc.Id -ErrorAction SilentlyContinue) -and (Get-Process -Id $edgeProc.Id -ErrorAction SilentlyContinue)) {
    Start-Sleep -Seconds 2
  }
  Write-Host "[$(Get-Date -Format o)] player or kiosk window exited - restarting both"
  Stop-Process -Id $serverProc.Id -ErrorAction SilentlyContinue
  Stop-Process -Id $edgeProc.Id -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
}
