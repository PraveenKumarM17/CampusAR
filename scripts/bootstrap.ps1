# CampusAR — Windows one-command bootstrap (installs tools, clones repo, full setup)
#
# ONE COMMAND (PowerShell — Run as normal user, not required to be Admin):
#
#   powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/PraveenKumarM17/CampusAR/main/scripts/bootstrap.ps1 | iex"
#
# Custom install folder:
#
#   powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/PraveenKumarM17/CampusAR/main/scripts/bootstrap.ps1 | iex" -InstallDir D:\CampusAR
#
# Or save and run:
#   powershell -ExecutionPolicy Bypass -File scripts\bootstrap.ps1

param(
    [string]$InstallDir = $(Join-Path $env:USERPROFILE "CampusAR")
)

$ErrorActionPreference = "Stop"

$RepoUrl = if ($env:CAMPUSAR_REPO_URL) { $env:CAMPUSAR_REPO_URL } else { "https://github.com/PraveenKumarM17/CampusAR.git" }
$Branch = if ($env:CAMPUSAR_BRANCH) { $env:CAMPUSAR_BRANCH } else { "main" }
$RawBase = if ($env:CAMPUSAR_RAW_BASE) {
    $env:CAMPUSAR_RAW_BASE
} else {
    "https://raw.githubusercontent.com/PraveenKumarM17/CampusAR/main"
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  CampusAR — Windows auto setup" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan
Write-Host "  Repository: $RepoUrl"
Write-Host "  Branch:     $Branch"
Write-Host "  Install to: $InstallDir`n"

# Download prerequisite module (works even before clone)
$PrereqScript = Join-Path $env:TEMP "campusar-windows-prereqs.ps1"
Invoke-WebRequest -Uri "$RawBase/scripts/windows-prereqs.ps1" -OutFile $PrereqScript -UseBasicParsing
. $PrereqScript

Ensure-CampusARPrerequisites

if (Test-Path (Join-Path $InstallDir ".git")) {
    Write-Step "Existing clone found — updating…"
    git -C $InstallDir fetch origin $Branch --depth 1 2>$null
    git -C $InstallDir checkout $Branch 2>$null
    git -C $InstallDir pull --ff-only origin $Branch 2>$null
    Write-Ok "Repository updated"
} elseif ((Test-Path $InstallDir) -and (Get-ChildItem $InstallDir -ErrorAction SilentlyContinue)) {
    Write-Fail "Install folder exists but is not a git repo: $InstallDir`nRemove it or choose another path with -InstallDir"
} else {
    $parent = Split-Path $InstallDir -Parent
    if ($parent -and -not (Test-Path $parent)) {
        New-Item -ItemType Directory -Force -Path $parent | Out-Null
    }
    Write-Step "Cloning repository…"
    git clone --depth 1 --branch $Branch $RepoUrl $InstallDir
    if ($LASTEXITCODE -ne 0) { Write-Fail "git clone failed" }
    Write-Ok "Cloned to $InstallDir"
}

$env:CAMPUSAR_INSTALL_DIR = (Resolve-Path $InstallDir).Path
& "$InstallDir\scripts\setup.ps1"
