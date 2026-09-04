# CampusAR Docker Quick Start Script for Windows

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "   CampusAR Docker Setup & Start" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Check if Docker is running
Write-Host "[1/7] Checking Docker..." -ForegroundColor Yellow
try {
    docker --version | Out-Null
    Write-Host "✓ Docker is installed" -ForegroundColor Green
} catch {
    Write-Host "✗ Docker is not installed or not running!" -ForegroundColor Red
    Write-Host "Please install Docker Desktop from: https://www.docker.com/products/docker-desktop" -ForegroundColor Red
    exit 1
}

try {
    docker ps | Out-Null
    Write-Host "✓ Docker is running" -ForegroundColor Green
} catch {
    Write-Host "✗ Docker Desktop is not running!" -ForegroundColor Red
    Write-Host "Please start Docker Desktop and try again." -ForegroundColor Red
    exit 1
}

Write-Host ""

# Setup .env file
Write-Host "[2/7] Setting up environment variables..." -ForegroundColor Yellow
if (-not (Test-Path ".env")) {
    Copy-Item ".env.docker" ".env"
    Write-Host "✓ Created .env file from template" -ForegroundColor Green
} else {
    Write-Host "✓ .env file already exists" -ForegroundColor Green
}

Write-Host ""

# Build containers
Write-Host "[3/7] Building Docker containers..." -ForegroundColor Yellow
Write-Host "This may take 5-10 minutes on first run..." -ForegroundColor Gray
docker-compose build
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Build failed!" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Containers built successfully" -ForegroundColor Green

Write-Host ""

# Start services
Write-Host "[4/7] Starting services..." -ForegroundColor Yellow
docker-compose up -d
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Failed to start services!" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Services started" -ForegroundColor Green

Write-Host ""

# Wait for database
Write-Host "[5/7] Waiting for database..." -ForegroundColor Yellow
$maxRetries = 30
$retries = 0
$dbReady = $false

while ($retries -lt $maxRetries) {
    Start-Sleep -Seconds 2
    $healthStatus = docker inspect --format='{{.State.Health.Status}}' campusar-db 2>$null
    if ($healthStatus -eq "healthy") {
        $dbReady = $true
        break
    }
    $retries++
    Write-Host "." -NoNewline
}

Write-Host ""
if ($dbReady) {
    Write-Host "✓ Database is ready" -ForegroundColor Green
} else {
    Write-Host "⚠ Database might not be ready yet" -ForegroundColor Yellow
}

Write-Host ""

# Run migrations with retries
Write-Host "[6/7] Running database migrations..." -ForegroundColor Yellow
Write-Host "Waiting for API to stabilize..." -ForegroundColor Gray

$migrationSuccess = $false
$maxMigrationRetries = 15
$migrationRetries = 0

while (-not $migrationSuccess -and $migrationRetries -lt $maxMigrationRetries) {
    Start-Sleep -Seconds 3
    $apiStatus = docker inspect --format='{{.State.Status}}' campusar-api 2>$null
    
    if ($apiStatus -eq "running") {
        Write-Host "API is running, attempting migration..." -ForegroundColor Gray
        $migrationOutput = docker-compose exec -T api npm run db:migrate 2>&1
        if ($LASTEXITCODE -eq 0) {
            $migrationSuccess = $true
            break
        }
    }
    
    $migrationRetries++
    Write-Host "." -NoNewline
}

Write-Host ""
if ($migrationSuccess) {
    Write-Host "✓ Migrations completed successfully" -ForegroundColor Green
    Write-Host "  Restarting API..." -ForegroundColor Gray
    docker-compose restart api | Out-Null
    Start-Sleep -Seconds 5
} else {
    Write-Host "⚠ Could not run migrations automatically" -ForegroundColor Yellow
    Write-Host "  Run manually: docker-compose exec api npm run db:migrate" -ForegroundColor Yellow
}

Write-Host ""

# Final status check
Write-Host "[7/7] Final status check..." -ForegroundColor Yellow
Start-Sleep -Seconds 3
docker-compose ps

Write-Host ""

# Get local IP
$localIP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notlike "*Loopback*" -and $_.IPAddress -notlike "169.254.*" } | Select-Object -First 1).IPAddress

Write-Host "================================================" -ForegroundColor Green
Write-Host "   CampusAR Setup Complete!" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Access from your computer:" -ForegroundColor Cyan
Write-Host "  🌐 Web App:  https://localhost" -ForegroundColor White
Write-Host "  🔌 API:      http://localhost:4000" -ForegroundColor White
Write-Host "  📊 API Docs: http://localhost:4000/api/docs" -ForegroundColor White
Write-Host ""
if ($localIP) {
    Write-Host "Access from your phone (same WiFi):" -ForegroundColor Cyan
    Write-Host "  📱 Web App:  https://$localIP" -ForegroundColor White
    Write-Host ""
    Write-Host "⚠  Accept the certificate warning on first visit" -ForegroundColor Yellow
}
Write-Host ""
Write-Host "Useful commands:" -ForegroundColor Cyan
Write-Host "  View logs:    docker-compose logs -f" -ForegroundColor Gray
Write-Host "  Stop:         docker-compose down" -ForegroundColor Gray
Write-Host "  Restart:      docker-compose restart" -ForegroundColor Gray
Write-Host ""
Write-Host "📖 Full guide: See DOCKER_SETUP.md" -ForegroundColor Cyan
Write-Host ""
