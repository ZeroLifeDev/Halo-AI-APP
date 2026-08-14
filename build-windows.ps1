<#
  Halo Guard — Windows build setup.

  Everything this script installs lives on D:\ — no SDK, no cache and no
  toolchain is written to C:\. Run it once from an elevated PowerShell:

      Set-ExecutionPolicy -Scope Process Bypass -Force
      .\build-windows.ps1

  Afterwards, build the APK with:

      .\build-windows.ps1 -BuildOnly
#>

param(
  [switch]$BuildOnly,
  [string]$Root = "D:\halo-toolchain"
)

$ErrorActionPreference = "Stop"

$SdkRoot     = Join-Path $Root "android-sdk"
$JdkRoot     = Join-Path $Root "jdk"
$GradleHome  = Join-Path $Root "gradle-home"
$NpmCache    = Join-Path $Root "npm-cache"
$TempDir     = Join-Path $Root "temp"

function Info($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }

# --- everything on D:, nothing on C: ---
foreach ($dir in @($Root, $SdkRoot, $JdkRoot, $GradleHome, $NpmCache, $TempDir)) {
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
}

$env:ANDROID_HOME     = $SdkRoot
$env:ANDROID_SDK_ROOT = $SdkRoot
$env:GRADLE_USER_HOME = $GradleHome
$env:TEMP             = $TempDir
$env:TMP              = $TempDir
$env:npm_config_cache = $NpmCache

if (-not $BuildOnly) {
  # --- JDK 21 ---
  if (-not (Test-Path (Join-Path $JdkRoot "bin\java.exe"))) {
    Info "Installing JDK 21 to $JdkRoot"
    $jdkZip = Join-Path $TempDir "jdk.zip"
    Invoke-WebRequest -Uri "https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jdk/hotspot/normal/eclipse?project=jdk" -OutFile $jdkZip
    Expand-Archive -Path $jdkZip -DestinationPath $TempDir -Force
    $extracted = Get-ChildItem $TempDir -Directory | Where-Object { $_.Name -like "jdk-21*" } | Select-Object -First 1
    Copy-Item "$($extracted.FullName)\*" $JdkRoot -Recurse -Force
    Remove-Item $jdkZip -Force
  }

  # --- Android command-line tools + build tools ---
  if (-not (Test-Path (Join-Path $SdkRoot "cmdline-tools\latest\bin\sdkmanager.bat"))) {
    Info "Installing Android SDK to $SdkRoot"
    $sdkZip = Join-Path $TempDir "cmdline-tools.zip"
    Invoke-WebRequest -Uri "https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip" -OutFile $sdkZip
    Expand-Archive -Path $sdkZip -DestinationPath (Join-Path $TempDir "cmdline") -Force
    New-Item -ItemType Directory -Force -Path (Join-Path $SdkRoot "cmdline-tools") | Out-Null
    Move-Item (Join-Path $TempDir "cmdline\cmdline-tools") (Join-Path $SdkRoot "cmdline-tools\latest") -Force
    Remove-Item $sdkZip -Force
  }
}

$env:JAVA_HOME = $JdkRoot
$env:Path = "$JdkRoot\bin;$SdkRoot\platform-tools;$SdkRoot\cmdline-tools\latest\bin;$env:Path"

if (-not $BuildOnly) {
  Info "Accepting SDK licences and fetching platform 35"
  cmd /c "echo y| sdkmanager.bat --sdk_root=`"$SdkRoot`" --licenses" | Out-Null
  & sdkmanager.bat --sdk_root="$SdkRoot" "platform-tools" "platforms;android-36" "build-tools;36.0.0"

  Info "Installing npm dependencies (cache on D:)"
  npm install
}

Info "Building the web bundle"
npm run build

Info "Copying web assets into the Android project"
npx cap sync android

Info "Building the APK"
Push-Location android
try {
  # local.properties tells Gradle where the SDK lives — on D:, not C:.
  "sdk.dir=$($SdkRoot -replace '\\', '\\\\')" | Set-Content -Path "local.properties" -Encoding ASCII
  cmd /c "gradlew.bat assembleDebug --no-daemon"
} finally {
  Pop-Location
}

$apk = "android\app\build\outputs\apk\debug\app-debug.apk"
if (Test-Path $apk) {
  $dest = Join-Path $Root "halo-guard.apk"
  Copy-Item $apk $dest -Force
  Info "Done. APK: $dest"
  Write-Host "Install it on a connected phone with:  adb install -r `"$dest`"" -ForegroundColor Green
} else {
  throw "Build finished but no APK was produced."
}
