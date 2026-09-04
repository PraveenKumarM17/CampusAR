# CampusAR Docker Stop Script

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "   Stopping CampusAR Docker Containers" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

docker-compose down

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✓ All containers stopped successfully" -ForegroundColor Green
    Write-Host ""
    Write-Host "To start again, run: .\docker-start.ps1" -ForegroundColor Cyan
} else {
    Write-Host ""
    Write-Host "✗ Failed to stop containers" -ForegroundColor Red
}
