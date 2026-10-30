#Requires -RunAsAdministrator
<#
.SYNOPSIS
  One-time setup for a Windows SignageMadeEasy player — the Windows equivalent of
  pi-player/provision.sh. Run once per machine, then reboot (or run start-kiosk.ps1
  directly to test without rebooting first).

  Bootstrap one-liner (run from an elevated PowerShell — right-click Start, "Terminal
  (Admin)" or "Windows PowerShell (Admin)"):

    powershell -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/yusufmiahav/SignageMadeEasy/claude/signage-made-easy-dev-r00fl6/pi-player/windows/install.ps1 | iex"

  That branch in the URL matters, same warning as pi-player/README.md's own for the
  Linux one-liner: this repo's `main` branch is an old, infrequently-merged snapshot
  — installing from it would silently miss fixes this script and the player itself
  depend on.
#>

$ErrorActionPreference = 'Stop'

# The #Requires line above only gets enforced when this file is invoked directly
# (e.g. `.\install.ps1`) — the recommended bootstrap one-liner runs it via
# `irm | iex`, a string evaluation #Requires doesn't check, so this is the real
# gate for that path.
$currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
$isAdmin = (New-Object Security.Principal.WindowsPrincipal $currentUser).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  throw 'This needs to run as Administrator — open PowerShell via "Run as administrator" and try again.'
}

$RepoUrl = 'https://github.com/yusufmiahav/SignageMadeEasy.git'
$Branch = 'claude/signage-made-easy-dev-r00fl6'
$InstallDir = 'C:\SignageMadeEasy'
$AppDir = Join-Path $InstallDir 'pi-player'
$DataDir = 'C:\ProgramData\SignageMadeEasy'
$TaskName = 'SignageMadeEasyKiosk'

function Write-Log($Message) {
  Write-Host "`n==> $Message" -ForegroundColor Cyan
}

# --- Node.js and git -------------------------------------------------------
# winget ships with Windows 10 2004+/Windows 11 — if it's missing (an older
# Windows build, or a locked-down machine with winget disabled), this fails fast
# with a clear message rather than limping through a half-working install.
function Install-IfMissing($Command, $WingetId, $FriendlyName) {
  if (Get-Command $Command -ErrorAction SilentlyContinue) { return }
  Write-Log "Installing $FriendlyName"
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    throw "$FriendlyName isn't installed and winget isn't available to install it automatically. Install $FriendlyName manually, then re-run this script."
  }
  winget install --id $WingetId --silent --accept-package-agreements --accept-source-agreements
  # winget updates PATH for new shells, not this already-running one.
  $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path', 'User')
  if (-not (Get-Command $Command -ErrorAction SilentlyContinue)) {
    throw "$FriendlyName was installed but isn't on PATH yet — close this window, open a fresh elevated PowerShell, and re-run this script."
  }
}

Install-IfMissing -Command git -WingetId Git.Git -FriendlyName git
Install-IfMissing -Command node -WingetId OpenJS.NodeJS.LTS -FriendlyName Node.js

# --- Fetch SignageMadeEasy --------------------------------------------------
if (Test-Path (Join-Path $InstallDir '.git')) {
  Write-Log "Updating existing checkout at $InstallDir"
  git -C $InstallDir fetch origin $Branch
  git -C $InstallDir checkout $Branch
  git -C $InstallDir pull --ff-only origin $Branch
} else {
  Write-Log "Cloning SignageMadeEasy into $InstallDir"
  git clone --branch $Branch $RepoUrl $InstallDir
}

# --- Build the player app ---------------------------------------------------
Write-Log "Building the player app"
Push-Location $AppDir
try {
  npm install
  npm run build
} finally {
  Pop-Location
}

# --- Data directories --------------------------------------------------------
Write-Log "Creating $DataDir"
foreach ($sub in @('cache', 'local-content', 'logs')) {
  New-Item -ItemType Directory -Force -Path (Join-Path $DataDir $sub) | Out-Null
}
# Same reasoning and stamping convention as provision.sh's own version file —
# a real date, refreshed on every Update/Re-provision, not a hand-edited one
# nobody remembers to bump. See pi-player/src/diagnostics.ts's own comment.
# .ToUniversalTime() rather than Get-Date -AsUTC: that parameter needs PowerShell
# 7.1+, and the scheduled task below runs under whatever ships by default on this
# machine — Windows PowerShell 5.1 on every out-of-the-box Windows 10/11 install.
(Get-Date).ToUniversalTime().ToString('yyyy.MM.dd') | Set-Content -Path (Join-Path $DataDir 'version') -NoNewline

# --- Scheduled Task (autostart) ----------------------------------------------
# Runs start-kiosk.ps1 at logon, in the logged-on user's own interactive session —
# deliberately NOT "run whether user is logged on or not" (that runs in Session 0,
# which can't show a window at all on modern Windows). Pair this with auto-logon
# (see this script's own closing message) for a true boots-straight-to-kiosk
# experience, same as the Pi's own auto-login-on-tty1 step in provision.sh.
Write-Log "Registering the '$TaskName' scheduled task (starts the kiosk at logon)"
$startKiosk = Join-Path $AppDir 'windows\start-kiosk.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$startKiosk`""
$trigger = New-ScheduledTaskTrigger -AtLogOn
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Days 0) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null

Write-Log 'Done.'
Write-Host @"

Next steps:
  1. Set this account to log in automatically on boot, so the kiosk starts with
     no one needing to type a password — run 'netplwiz', untick "Users must
     enter a user name and password to use this computer" for the $env:USERNAME
     account, OK, enter the password when prompted.
  2. Reboot. The screen should come up showing an IP address and QR code, ready
     to pair from the control app — same as pi-player/README.md's own
     "Connecting a screen" steps.

To test right now without rebooting: $startKiosk

"@ -ForegroundColor Green
