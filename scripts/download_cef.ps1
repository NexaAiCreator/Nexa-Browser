# Download CEF Binary Distribution for Nexa Browser
# This fetches the pre-built CEF distribution that includes:
#   - libcef.dll / libcef.lib  (already present)
#   - libcef_dll_wrapper sources (MISSING - needed for linking)
#   - cmake/ modules for building the wrapper

$ErrorActionPreference = "Stop"

# CEF 149.0.2 / Chromium 149.0.7827.53 - must match third_party/cef/include/cef_version.h
$CEF_VERSION = "149.0.2+ged5b3fd+chromium-149.0.7827.53"
$CEF_DIST_NAME = "cef_binary_${CEF_VERSION}_windows64"
$CEF_URL = "https://cef-builds.spotify.com/cef_binary_${CEF_VERSION}_windows64.tar.bz2"

$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not $projectRoot) { $projectRoot = (Get-Location).Path }
$thirdParty = Join-Path (Join-Path $projectRoot "third_party") "cef"
$tempDir = Join-Path $projectRoot "tmp_cef_download"
$archivePath = Join-Path $tempDir "cef_binary.tar.bz2"

Write-Host "============================================"
Write-Host " Nexa Browser - CEF Binary Distribution Setup"
Write-Host "============================================"
Write-Host ""
Write-Host "CEF Version : $CEF_VERSION"
Write-Host "Target      : $thirdParty"
Write-Host ""

# Step 1: Download
if (-not (Test-Path $tempDir)) { New-Item -ItemType Directory -Path $tempDir -Force | Out-Null }

Write-Host "[1/4] Downloading CEF binary distribution..."
Write-Host "       URL: $CEF_URL"
Write-Host ""
Write-Host "NOTE: If automatic download fails, manually download from:"
Write-Host "  https://cef-builds.spotify.com/index.html"
Write-Host "  Select: Windows 64-bit, version matching $CEF_VERSION"
Write-Host "  Extract to: $thirdParty"
Write-Host ""

try {
    Invoke-WebRequest -Uri $CEF_URL -OutFile $archivePath -UseBasicParsing
} catch {
    Write-Host "Download failed: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "Manual alternative:" -ForegroundColor Yellow
    Write-Host "  1. Visit https://cef-builds.spotify.com/index.html"
    Write-Host "  2. Download the Windows 64-bit Standard Distribution"
    Write-Host "  3. Extract so that third_party/cef/ contains:"
    Write-Host "       include/, Release/, Resources/, libcef_dll/, cmake/"
    Write-Host "  4. Re-run cmake and build."
    exit 1
}

# Step 2: Extract
Write-Host "[2/4] Extracting archive..."
# tar can handle .tar.bz2 on modern Windows
tar -xf $archivePath -C $tempDir

# Find the extracted directory
$extracted = Get-ChildItem -Path $tempDir -Directory | Where-Object { $_.Name -like "cef_binary_*" } | Select-Object -First 1

if (-not $extracted) {
    Write-Host "ERROR: Could not find extracted CEF directory" -ForegroundColor Red
    exit 1
}

# Step 3: Copy wrapper sources and cmake modules to third_party/cef
Write-Host "[3/4] Copying wrapper sources and cmake modules..."

# Copy libcef_dll/ (the wrapper source code needed to build libcef_dll_wrapper.lib)
$wrapperSrc = Join-Path $extracted.FullName "libcef_dll"
$wrapperDst = Join-Path $thirdParty "libcef_dll"
if (Test-Path $wrapperSrc) {
    Copy-Item -Path $wrapperSrc -Destination $wrapperDst -Recurse -Force
    Write-Host "  Copied: libcef_dll/ (wrapper sources)"
} else {
    Write-Host "  WARNING: libcef_dll/ not found in distribution" -ForegroundColor Yellow
}

# Copy cmake/ modules
$cmakeSrc = Join-Path $extracted.FullName "cmake"
$cmakeDst = Join-Path $thirdParty "cmake"
if (Test-Path $cmakeSrc) {
    Copy-Item -Path $cmakeSrc -Destination $cmakeDst -Recurse -Force
    Write-Host "  Copied: cmake/ (build helpers)"
} else {
    Write-Host "  WARNING: cmake/ not found in distribution" -ForegroundColor Yellow
}

# Copy Resources/ if present
$resSrc = Join-Path $extracted.FullName "Resources"
$resDst = Join-Path $thirdParty "Resources"
if (Test-Path $resSrc) {
    Copy-Item -Path $resSrc -Destination $resDst -Recurse -Force
    Write-Host "  Copied: Resources/"
}

# Step 4: Cleanup
Write-Host "[4/4] Cleaning up temp files..."
Remove-Item -Path $tempDir -Recurse -Force

Write-Host "Done! Now re-run:" -ForegroundColor Green
Write-Host "  cd build"
Write-Host "  cmake .."
Write-Host "  cmake --build . --config Release"
