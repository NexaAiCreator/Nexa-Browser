
$AppName = "NexaBrowserBeta"
$DistDir = "dist\$AppName"
$BuildDir = "build/Release"

Write-Host "Packaging Nexa Browser Beta..." -ForegroundColor Cyan

# Create distribution folder
if (Test-Path $DistDir) { Remove-Item -Recurse -Force $DistDir }
New-Item -ItemType Directory -Path $DistDir

# 1. Copy C++ Launcher
Write-Host "Copying Launcher..."
Copy-Item "$BuildDir/NexaBrowser.exe" -Destination "$DistDir/NexaBrowser.exe"

# 2. Copy Backend
Write-Host "Copying Backend..."
New-Item -ItemType Directory -Path "$DistDir/backend"
Copy-Item "backend\*" -Destination "$DistDir/backend" -Recurse

# 3. Copy Renderer Assets
Write-Host "Copying Renderer Assets..."
New-Item -ItemType Directory -Path "$DistDir/src/renderer"
Copy-Item "src/renderer\*" -Destination "$DistDir/src/renderer" -Recurse

# 4. Copy CEF Binaries (simulated)
Write-Host "Bundling CEF Runtime..."
New-Item -ItemType Directory -Path "$DistDir/runtime"
# In real scenario: Copy-Item "third_party/cef/Release\*" -Destination "$DistDir/runtime"

Write-Host "Packaging Complete! Found at: $DistDir" -ForegroundColor Green
