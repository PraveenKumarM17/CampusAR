# CampusAR — Windows setup (installs prerequisites + project dependencies + database)
# Usage (after clone):
#   powershell -ExecutionPolicy Bypass -File scripts/setup.ps1

$ErrorActionPreference = "Stop"

$InstallDir = if ($env:CAMPUSAR_INSTALL_DIR) {
    $env:CAMPUSAR_INSTALL_DIR
} else {
    (Join-Path $PSScriptRoot ".." | Resolve-Path | Select-Object -ExpandProperty Path)
}

# Load prerequisite helpers (local clone or download from GitHub)
$PrereqScript = Join-Path $PSScriptRoot "windows-prereqs.ps1"
if (-not (Test-Path $PrereqScript)) {
    $PrereqScript = Join-Path $env:TEMP "campusar-windows-prereqs.ps1"
    $rawUrl = if ($env:CAMPUSAR_REPO_URL) {
        $base = $env:CAMPUSAR_REPO_URL -replace '\.git$', ''
        "$base/raw/main/scripts/windows-prereqs.ps1"
    } else {
        "https://raw.githubusercontent.com/PraveenKumarM17/CampusAR/main/scripts/windows-prereqs.ps1"
    }
    Invoke-WebRequest -Uri $rawUrl -OutFile $PrereqScript -UseBasicParsing
}
. $PrereqScript

Write-Host "`nCampusAR setup (Windows)`n" -ForegroundColor Cyan

Ensure-CampusARPrerequisites

Set-Location $InstallDir

if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Ok "Created .env from .env.example"
} else {
    Write-Warn ".env already exists — leaving unchanged"
}

Write-Step "Installing npm dependencies (may take a few minutes)…"
npm install
if ($LASTEXITCODE -ne 0) { Write-Fail "npm install failed" }
Write-Ok "Dependencies installed"

Write-Step "Starting PostgreSQL (Docker)…"
Invoke-DockerCompose -ComposeArgs @('up', '-d', 'db')

Wait-PostgresPort -DbHost 'localhost' -Port 5433

Write-Step "Applying database migrations…"
npm run db:migrate
if ($LASTEXITCODE -ne 0) { Write-Fail "db:migrate failed" }
Write-Ok "Migrations applied"

Write-Step "Seeding demo campus data…"
npm run db:seed
if ($LASTEXITCODE -ne 0) { Write-Fail "db:seed failed" }
Write-Ok "Database seeded"

Write-Step "Running typecheck…"
npm run typecheck 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) {
    Write-Ok "Typecheck passed"
} else {
    Write-Warn "Typecheck reported issues — you can still run dev:api / dev:web"
}

Write-Host "`n═══════════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host "  CampusAR setup complete!" -ForegroundColor Green
Write-Host "═══════════════════════════════════════════════════════════`n" -ForegroundColor Green
Write-Host "  Open TWO PowerShell windows and run:"
Write-Host ""
Write-Host "    cd `"$InstallDir`""
Write-Host "    npm run dev:api    # API  -> http://localhost:4000"
Write-Host ""
Write-Host "    cd `"$InstallDir`""
Write-Host "    npm run dev:web    # Web  -> http://localhost:5173"
Write-Host ""
Write-Host "  Login:"
Write-Host "    Guest: Continue as Guest on the landing page"
Write-Host "    Admin: admin@smartcampus.edu / admin123"
Write-Host ""
Write-Host "  API docs: http://localhost:4000/api/docs`n"
