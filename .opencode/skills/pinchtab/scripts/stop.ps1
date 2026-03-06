<#
.SYNOPSIS
    Stop the active pinchtab Chrome instance.

.DESCRIPTION
    Finds the running instance for the automation profile and stops it
    via the dashboard API. This closes the Chrome window and removes
    the instance process entirely.

    The dashboard (port 9867) is left running -- run setup.ps1 to start
    a fresh instance again when needed.

.EXAMPLE
    .\stop.ps1
#>

$ErrorActionPreference = "Stop"
$DASHBOARD_URL = "http://localhost:9867"

function Write-Step { param([string]$msg) Write-Host "  $msg" -ForegroundColor Cyan }
function Write-Ok   { param([string]$msg) Write-Host "  OK  $msg" -ForegroundColor Green }
function Write-Fail { param([string]$msg) Write-Host "  ERR $msg" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "pinchtab stop" -ForegroundColor White
Write-Host "-----------------------------------"

# Check dashboard is reachable
Write-Step "Checking dashboard (port 9867)..."
try {
    Invoke-RestMethod -Uri "$DASHBOARD_URL/health" -TimeoutSec 3 | Out-Null
} catch {
    Write-Fail "Dashboard not reachable. Nothing to stop."
}
Write-Ok "Dashboard is running."

# Get running instances
$resp = Invoke-RestMethod -Uri "$DASHBOARD_URL/instances" -TimeoutSec 5
# Dashboard returns either an array directly or { value: [...] }
$instances = if ($resp -is [array]) { $resp } else { $resp.value }

if (-not $instances -or $instances.Count -eq 0) {
    Write-Ok "No instances running. Nothing to stop."
    Write-Host ""
    exit 0
}

# Stop each running instance
foreach ($inst in $instances) {
    Write-Step "Stopping instance $($inst.id) (port $($inst.port))..."
    try {
        Invoke-RestMethod -Uri "$DASHBOARD_URL/instances/$($inst.id)/stop" -Method Post -TimeoutSec 10 | Out-Null
        Write-Ok "Stopped."
    } catch {
        Write-Fail "Failed to stop instance $($inst.id): $_"
    }
}

# Kill any remaining Chrome processes to ensure the window is fully closed
Write-Step "Killing Chrome processes..."
Get-Process chrome -ErrorAction SilentlyContinue | Stop-Process -Force
Write-Ok "Chrome window closed."

Write-Host ""
Write-Host "-----------------------------------"
Write-Ok "Done. Run setup.ps1 to start again."
Write-Host ""
