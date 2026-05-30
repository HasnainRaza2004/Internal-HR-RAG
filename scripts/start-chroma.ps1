# Start ChromaDB via Docker (works even when `docker` isn't on PATH)
$ErrorActionPreference = "Stop"

$dockerCandidates = @(
  (Get-Command docker -ErrorAction SilentlyContinue)?.Source,
  "$env:ProgramFiles\Docker\Docker\resources\bin\docker.exe",
  "${env:ProgramFiles(x86)}\Docker\Docker\resources\bin\docker.exe"
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1

if (-not $dockerCandidates) {
  Write-Host "Docker not found. Install Docker Desktop: https://www.docker.com/products/docker-desktop/" -ForegroundColor Red
  exit 1
}

$docker = $dockerCandidates
$root = Split-Path $PSScriptRoot -Parent

Write-Host "Using: $docker"

# Start Docker Desktop if daemon is down
try {
  & $docker info *> $null
} catch {
  Write-Host "Starting Docker Desktop — wait until it shows 'Running' in the tray..."
  Start-Process "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe" -ErrorAction SilentlyContinue

  $ready = $false
  for ($i = 0; $i -lt 45; $i++) {
    Start-Sleep -Seconds 4
    try {
      & $docker info *> $null
      if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    } catch {}
    Write-Host "." -NoNewline
  }
  Write-Host ""

  if (-not $ready) {
    Write-Host "Docker daemon not ready. Open Docker Desktop manually, wait for it to start, then re-run this script." -ForegroundColor Yellow
    exit 1
  }
}

Set-Location $root
& $docker compose up -d chroma
& $docker ps --filter "name=hr-rag-chroma"

Write-Host "`nChromaDB ready at http://localhost:8000" -ForegroundColor Green
Write-Host "Next: cd backend && npm run ingest && npm run dev"
