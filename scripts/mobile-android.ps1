# Run React Native Android with a valid JDK 17 on Windows.
$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot

function Test-JdkHome([string]$home) {
    return $home -and (Test-Path (Join-Path $home "bin\java.exe"))
}

$candidates = @(
    $env:JAVA_HOME,
    "C:\Program Files\Microsoft\jdk-17.0.16.8-hotspot",
    "C:\Program Files\Eclipse Adoptium\jdk-17.0.16.8-hotspot",
    "C:\Program Files\Java\jdk-17"
)

$jdk = $null
foreach ($c in $candidates) {
    if (Test-JdkHome $c) {
        $jdk = $c
        break
    }
}

if (-not $jdk) {
    Write-Error @"
Could not find JDK 17. Install Microsoft OpenJDK 17 or Temurin 17, then set JAVA_HOME.
Example (PowerShell, current user):
  [Environment]::SetEnvironmentVariable('JAVA_HOME', 'C:\Program Files\Microsoft\jdk-17.0.16.8-hotspot', 'User')
"@
}

$env:JAVA_HOME = $jdk
Write-Host "Using JAVA_HOME=$jdk"

Set-Location (Join-Path $repoRoot "apps\mobile")
npm run android -- @args
