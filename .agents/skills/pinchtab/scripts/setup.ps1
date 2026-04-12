<#
.SYNOPSIS
    Start pinchtab and connect to the automation profile, ready for agent use.

.DESCRIPTION
    - Ensures the pinchtab dashboard is running (port 9867)
    - Ensures the automation profile exists (creates it if not)
    - Ensures the profile instance is running (starts it if not)
    - Waits for Chrome to be healthy
    - Sets $env:PINCHTAB_URL in the current session
    - Prints the instance URL so the agent can use CLI or curl immediately

.PARAMETER Mode
    Browser visibility mode. Use "headed" (default) or "headless".

.EXAMPLE
    .\setup.ps1
    .\setup.ps1 -Mode headless
    .\setup.ps1 -Mode headed
#>

param(
    [ValidateSet("headed", "headless")]
    [string]$Mode = "headed"
)

$ErrorActionPreference = "Stop"
$DASHBOARD = "http://localhost:9867"
$PROFILE_NAME = "automation"
$headless = if ($Mode -eq "headless") { $true } else { $false }

function Write-Step { param([string]$msg) Write-Host "  $msg" -ForegroundColor Cyan }
function Write-Ok   { param([string]$msg) Write-Host "  OK  $msg" -ForegroundColor Green }
function Write-Warn { param([string]$msg) Write-Host "  >>  $msg" -ForegroundColor Yellow }
function Write-Fail { param([string]$msg) Write-Host "  ERR $msg" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "pinchtab setup ($Mode)" -ForegroundColor White
Write-Host "-----------------------------------"

# ── Step 1: Dashboard ────────────────────────────────────────────────────────
Write-Step "Checking dashboard (port 9867)..."

$dashRunning = $false
try {
    $health = Invoke-RestMethod -Uri "$DASHBOARD/health" -TimeoutSec 3
    if ($health.mode -eq "dashboard") { $dashRunning = $true }
} catch {}

if (-not $dashRunning) {
    Write-Warn "Dashboard not running. Starting pinchtab..."
    $env:PINCHTAB_AUTO_LAUNCH = "1"
    Start-Process -FilePath "pinchtab" -WindowStyle Hidden
    # Poll until dashboard responds (up to 15s)
    $dashReady = $false
    for ($i = 0; $i -lt 15; $i++) {
        Start-Sleep -Seconds 1
        try {
            $health = Invoke-RestMethod -Uri "$DASHBOARD/health" -TimeoutSec 3
            if ($health.mode -eq "dashboard") { $dashReady = $true; break }
        } catch {}
    }
    if (-not $dashReady) {
        Write-Fail "Dashboard did not start within 15s. Is pinchtab installed? Run: bun install -g pinchtab"
    }
}
Write-Ok "Dashboard is running."

# ── Step 2: Profile ───────────────────────────────────────────────────────────
Write-Step "Looking for profile '$PROFILE_NAME'..."

$profiles = Invoke-RestMethod -Uri "$DASHBOARD/profiles"
$profile = $profiles | Where-Object { $_.name -eq $PROFILE_NAME } | Select-Object -First 1

if (-not $profile) {
    Write-Warn "Profile '$PROFILE_NAME' not found. Creating it..."
    $profile = Invoke-RestMethod -Uri "$DASHBOARD/profiles" -Method Post `
        -ContentType "application/json" `
        -Body (ConvertTo-Json @{ name = $PROFILE_NAME })
    Write-Ok "Profile created (id: $($profile.id))."
} else {
    Write-Ok "Profile found (id: $($profile.id))."
}

$profileId = $profile.id

# ── Step 3: Instance ──────────────────────────────────────────────────────────
Write-Step "Checking if instance is running..."

$instancePort = $null

try {
    $instance = Invoke-RestMethod -Uri "$DASHBOARD/profiles/$profileId/instance"
    if ($instance.running -eq $true) {
        $instancePort = $instance.port
        Write-Ok "Instance already running on port $instancePort."
    }
} catch {}

if (-not $instancePort) {
    Write-Warn "No instance running. Starting profile ($Mode)..."
    try {
        $started = Invoke-RestMethod -Uri "$DASHBOARD/profiles/$profileId/start" -Method Post `
            -ContentType "application/json" `
            -Body (ConvertTo-Json @{ headless = $headless })
        $instancePort = $started.port
        Write-Ok "Instance starting on port $instancePort."
    } catch {
        $errMsg = $_.ErrorDetails.Message | ConvertFrom-Json -ErrorAction SilentlyContinue
        if ($errMsg.error -match "already has an active instance") {
            # Race: started between our check and start call — fetch port again
            $instance = Invoke-RestMethod -Uri "$DASHBOARD/profiles/$profileId/instance"
            $instancePort = $instance.port
            Write-Ok "Instance was already starting, port $instancePort."
        } else {
            Write-Fail "Failed to start instance: $($_.Exception.Message)"
        }
    }
}

$INSTANCE_URL = "http://localhost:$instancePort"

# ── Step 4: Wait for Chrome to be healthy ────────────────────────────────────
Write-Step "Waiting for Chrome to be ready..."

function Test-InstanceHealth {
    param([string]$url)
    try {
        $h = Invoke-RestMethod -Uri "$url/health" -TimeoutSec 3
        return $h
    } catch { return $null }
}

$h = Test-InstanceHealth -url $INSTANCE_URL
$needsRestart = (-not $h) -or ($h.status -ne "ok")

# If unhealthy on first check, restart immediately — don't wait 15s
if ($needsRestart) {
    Write-Warn "Instance unhealthy (status: $(if ($h) { $h.status } else { 'unreachable' })). Restarting..."
    try { Invoke-RestMethod -Uri "$DASHBOARD/profiles/$profileId/stop" -Method Post | Out-Null } catch {}
    Start-Sleep -Seconds 2
    $started = Invoke-RestMethod -Uri "$DASHBOARD/profiles/$profileId/start" -Method Post `
        -ContentType "application/json" `
        -Body (ConvertTo-Json @{ headless = $headless })
    $instancePort = $started.port
    $INSTANCE_URL = "http://localhost:$instancePort"
    Write-Ok "Instance restarted on port $instancePort. Waiting for Chrome..."
}

$ready = $false
for ($i = 0; $i -lt 5; $i++) {
    Start-Sleep -Seconds 1
    $h = Test-InstanceHealth -url $INSTANCE_URL
    if ($h -and $h.status -eq "ok") { $ready = $true; break }
}

if (-not $ready) {
    Write-Warn "Chrome did not become healthy after 15s. Killing Chrome and retrying..."
    Get-Process chrome -ErrorAction SilentlyContinue | Stop-Process -Force
    Start-Sleep -Seconds 2
    $started = Invoke-RestMethod -Uri "$DASHBOARD/profiles/$profileId/start" -Method Post `
        -ContentType "application/json" `
        -Body (ConvertTo-Json @{ headless = $headless })
    $instancePort = $started.port
    $INSTANCE_URL = "http://localhost:$instancePort"
    Write-Ok "Instance restarted on port $instancePort. Waiting for Chrome..."
    $ready = $false
    for ($i = 0; $i -lt 5; $i++) {
        Start-Sleep -Seconds 1
        $h = Test-InstanceHealth -url $INSTANCE_URL
        if ($h -and $h.status -eq "ok") { $ready = $true; break }
    }
    if (-not $ready) {
        Get-Process chrome -ErrorAction SilentlyContinue | Stop-Process -Force
        Write-Fail "Chrome failed to start after retry. Check pinchtab logs."
    }
}
Write-Ok "Chrome is healthy (tabs: $($h.tabs))."

# ── Step 5: Set env var and print result ──────────────────────────────────────
$env:PINCHTAB_URL = $INSTANCE_URL

Write-Host ""
Write-Host "-----------------------------------"
Write-Host "Ready. Instance URL: $INSTANCE_URL" -ForegroundColor Green
Write-Host ""
Write-Host "PINCHTAB_URL has been set for this session." -ForegroundColor Gray
Write-Host "Use CLI:  pinchtab nav <url> / pinchtab snap -i -c / pinchtab click e0" -ForegroundColor Gray
Write-Host "Use curl: curl -s $INSTANCE_URL/snapshot?format=compact" -ForegroundColor Gray
Write-Host ""

# Return the URL so callers can capture it:
# $url = .\setup.ps1 | Select-Object -Last 1
return $INSTANCE_URL
