# CampusAR — Windows prerequisite checker & installer (Git, Node 20+, Docker)
# Dot-source from bootstrap.ps1 / setup.ps1:
#   . "$PSScriptRoot\windows-prereqs.ps1"
#   Ensure-CampusARPrerequisites

$script:CampusARMinNodeMajor = 20

function Write-Step($msg) { Write-Host "▸ $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "✓ $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "! $msg" -ForegroundColor Yellow }
function Write-Fail($msg) { Write-Host "✗ $msg" -ForegroundColor Red; throw $msg }

function Test-CommandExists([string]$Name) {
    $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Refresh-SessionPath {
    $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $user = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = "$machine;$user"
}

function Get-WingetExe {
    $cmd = Get-Command winget -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }

    $candidates = @(
        "$env:LOCALAPPDATA\Microsoft\WindowsApps\winget.exe",
        "$env:ProgramFiles\WindowsApps\Microsoft.DesktopAppInstaller_*_x64__8wekyb3d8bbwe\winget.exe"
    )
    foreach ($pattern in $candidates) {
        $resolved = Resolve-Path $pattern -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($resolved) { return $resolved.Path }
    }
    return $null
}

function Install-WingetIfMissing {
    if (Get-WingetExe) { return $true }

    Write-Step "winget not found — installing App Installer (includes winget)…"
    Write-Warn "This step may open a browser or UAC prompt."

    $releases = 'https://api.github.com/repos/microsoft/winget-cli/releases/latest'
    try {
        $asset = Invoke-RestMethod -Uri $releases -UseBasicParsing |
            Select-Object -ExpandProperty assets |
            Where-Object { $_.name -match 'Microsoft.DesktopAppInstaller.*msixbundle$' } |
            Select-Object -First 1
        if (-not $asset) { return $false }

        $bundle = Join-Path $env:TEMP 'Microsoft.DesktopAppInstaller.msixbundle'
        Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $bundle -UseBasicParsing
        Add-AppxPackage -Path $bundle
        Refresh-SessionPath
        Start-Sleep -Seconds 3
        return [bool](Get-WingetExe)
    } catch {
        Write-Warn "Could not auto-install winget: $($_.Exception.Message)"
        return $false
    }
}

function Invoke-WingetInstall {
    param(
        [Parameter(Mandatory)][string]$Id,
        [string]$DisplayName = $Id
    )

    $winget = Get-WingetExe
    if (-not $winget) {
        Write-Fail "winget is unavailable. Install $DisplayName manually: https://winget.run/pkg/$($Id -replace '\.','/')"
    }

    Write-Step "Installing $DisplayName via winget…"
    $args = @(
        'install', '--id', $Id,
        '--exact',
        '--accept-package-agreements',
        '--accept-source-agreements',
        '--disable-interactivity',
        '--scope', 'user'
    )

    & $winget @args
    if ($LASTEXITCODE -gt 1) {
        Write-Warn "winget install returned exit code $LASTEXITCODE for $DisplayName (may already be installed)"
    }

    Refresh-SessionPath
    Start-Sleep -Seconds 2
}

function Ensure-Git {
    if (Test-CommandExists git) {
        Write-Ok "Git $(git --version)"
        return
    }

    if (-not (Install-WingetIfMissing)) {
        Write-Fail "Git is required. Install from https://git-scm.com/download/win and re-run this script."
    }
    Invoke-WingetInstall -Id 'Git.Git' -DisplayName 'Git'
    Refresh-SessionPath

    if (-not (Test-CommandExists git)) {
        $gitCandidates = @(
            "$env:ProgramFiles\Git\cmd\git.exe",
            "$env:ProgramFiles\Git\bin\git.exe",
            "$env:LOCALAPPDATA\Programs\Git\cmd\git.exe"
        )
        foreach ($p in $gitCandidates) {
            if (Test-Path $p) {
                $dir = Split-Path $p -Parent
                $env:Path = "$dir;$env:Path"
                break
            }
        }
    }

    if (-not (Test-CommandExists git)) {
        Write-Fail "Git install finished but git is not on PATH. Restart PowerShell and re-run, or install manually."
    }
    Write-Ok "Git $(git --version)"
}

function Get-NodeMajor {
    if (-not (Test-CommandExists node)) { return 0 }
    try { return [int](node -p "process.versions.node.split('.')[0]") } catch { return 0 }
}

function Ensure-Node {
    $major = Get-NodeMajor
    if ($major -ge $script:CampusARMinNodeMajor) {
        Write-Ok "Node $(node -v), npm $(npm -v)"
        return
    }

    if ($major -gt 0) {
        Write-Warn "Node $(node -v) is too old (need $($script:CampusARMinNodeMajor)+)."
    } else {
        Write-Warn "Node.js not found."
    }

    if (-not (Install-WingetIfMissing)) {
        Write-Fail "Node.js $($script:CampusARMinNodeMajor)+ required. Install from https://nodejs.org/ and re-run."
    }

    Invoke-WingetInstall -Id 'OpenJS.NodeJS.LTS' -DisplayName 'Node.js LTS'
    Refresh-SessionPath

    $nodeCandidates = @(
        "$env:ProgramFiles\nodejs\node.exe",
        "$env:LOCALAPPDATA\Programs\node\node.exe"
    )
    foreach ($p in $nodeCandidates) {
        if (Test-Path $p) {
            $dir = Split-Path $p -Parent
            $env:Path = "$dir;$env:Path"
            break
        }
    }

    $major = Get-NodeMajor
    if ($major -lt $script:CampusARMinNodeMajor) {
        Write-Fail "Node.js $($script:CampusARMinNodeMajor)+ still not available. Restart PowerShell after install and re-run."
    }
    Write-Ok "Node $(node -v), npm $(npm -v)"
}

function Test-DockerRunning {
    if (-not (Test-CommandExists docker)) { return $false }
    try {
        docker info 2>$null | Out-Null
        return $LASTEXITCODE -eq 0
    } catch { return $false }
}

function Start-DockerDesktopIfInstalled {
    $paths = @(
        "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe",
        "$env:LOCALAPPDATA\Programs\Docker\Docker\Docker Desktop.exe"
    )
    foreach ($p in $paths) {
        if (Test-Path $p) {
            Write-Step "Starting Docker Desktop…"
            Start-Process -FilePath $p | Out-Null
            return $true
        }
    }
    return $false
}

function Wait-DockerReady {
    param([int]$TimeoutSeconds = 180)

    Write-Step "Waiting for Docker to be ready (up to $TimeoutSeconds s)…"
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-DockerRunning) {
            Write-Ok "Docker is running"
            return
        }
        Start-Sleep -Seconds 5
        Write-Host "  …still waiting for Docker" -ForegroundColor DarkGray
    }
    Write-Fail @"
Docker did not start in time.
1. Open 'Docker Desktop' from the Start menu and wait until it says Running.
2. If this is a fresh install, you may need to sign out/in or reboot once.
3. Re-run: powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
"@
}

function Ensure-Docker {
    if (Test-DockerRunning) {
        Write-Ok "Docker is running"
        return
    }

    if (-not (Test-CommandExists docker)) {
        Write-Warn "Docker not found."
        if (-not (Install-WingetIfMissing)) {
            Write-Fail "Docker Desktop required. Install from https://www.docker.com/products/docker-desktop/ and re-run."
        }
        Invoke-WingetInstall -Id 'Docker.DockerDesktop' -DisplayName 'Docker Desktop'
        Refresh-SessionPath
    }

    if (-not (Test-CommandExists docker)) {
        Write-Fail "Docker Desktop was installed but docker CLI is not on PATH. Restart PowerShell, start Docker Desktop, and re-run."
    }

    if (-not (Test-DockerRunning)) {
        $started = Start-DockerDesktopIfInstalled
        if (-not $started) {
            Write-Warn "Start Docker Desktop manually from the Start menu."
        }
        Wait-DockerReady
    }
}

function Ensure-CampusARPrerequisites {
    Write-Host "`n--- Checking / installing prerequisites ---`n" -ForegroundColor Cyan

    # Git first (needed for bootstrap clone)
    Ensure-Git
    Ensure-Node
    Ensure-Docker

    Write-Host ""
}

function Invoke-DockerCompose {
    param([string[]]$ComposeArgs)

    docker compose @ComposeArgs
    if ($LASTEXITCODE -eq 0) { return }

    if (Test-CommandExists docker-compose) {
        docker-compose @ComposeArgs
        if ($LASTEXITCODE -ne 0) {
            Write-Fail "docker compose failed (exit $LASTEXITCODE)"
        }
        return
    }

    Write-Fail "docker compose failed (exit $LASTEXITCODE)"
}

function Wait-PostgresPort {
    param(
        [string]$DbHost = 'localhost',
        [int]$Port = 5433,
        [int]$TimeoutSeconds = 120
    )

    Write-Step "Waiting for PostgreSQL on ${DbHost}:${Port}…"
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $tcp = New-Object System.Net.Sockets.TcpClient
            $tcp.Connect($DbHost, $Port)
            $tcp.Close()
            Write-Ok "PostgreSQL is ready"
            return
        } catch {
            Start-Sleep -Seconds 2
        }
    }
    Write-Fail "PostgreSQL did not become ready. Run: docker compose logs db"
}
