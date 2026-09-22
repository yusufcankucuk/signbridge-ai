@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"

set "LOG=%~dp0signbridge-baslat.log"
echo [%date% %time%] SignBridge v0.8.0 baslatiliyor > "%LOG%"

where docker >nul 2>&1
if errorlevel 1 (
  echo HATA: Docker bulunamadi. Docker Desktop'i kurup acin.
  goto :fail
)

docker info >nul 2>&1
if errorlevel 1 (
  echo HATA: Docker Desktop calismiyor. Docker Desktop'i acip yeniden deneyin.
  goto :fail
)

if not exist ".env" (
  echo .env bulunamadi; v0.8.0 ekip ayarlari olusturuluyor...
  copy /Y ".env.unified71.example" ".env" >> "%LOG%" 2>&1
  if errorlevel 1 goto :fail
)

if not exist "signbridge-unified71-v0.8.0.zip" (
  echo HATA: signbridge-unified71-v0.8.0.zip depo kokunde bulunamadi.
  echo Model paketini ayni klasore koyup yeniden deneyin.
  goto :fail
)

echo Eski SignBridge konteynerleri durduruluyor...
docker compose down --remove-orphans >> "%LOG%" 2>&1
if errorlevel 1 goto :fail

echo v0.8.0 model paketi kuruluyor ve dogrulaniyor...
docker compose --profile setup run --rm model-setup >> "%LOG%" 2>&1
if errorlevel 1 goto :fail

echo Uygulama yeniden derleniyor ve servisler baslatiliyor...
docker compose up --build -d >> "%LOG%" 2>&1
if errorlevel 1 goto :fail

echo Kamera AI servisinin hazir olmasi bekleniyor...
for /L %%I in (1,1,36) do (
  curl -fsS http://localhost:3000/api/ai/status > "%TEMP%\signbridge-ai-status.json" 2>nul
  if not errorlevel 1 goto :ready
  timeout /t 5 /nobreak >nul
)

echo HATA: Servis 3 dakika icinde hazir olmadi.
goto :fail

:ready
echo.
echo === KAMERA AI DURUMU ===
type "%TEMP%\signbridge-ai-status.json"
echo.
echo.
powershell -NoProfile -Command "$s = Get-Content -Raw -LiteralPath '%TEMP%\signbridge-ai-status.json' | ConvertFrom-Json; if ($s.modelVersion -eq 'signbridge-unified71-bigru-v0.8.0' -and $s.cameraAiEnabled -eq $true -and $s.versionMismatch -eq $false) { exit 0 } else { exit 1 }"
if errorlevel 1 (
  echo HATA: v0.8.0 etkin degil, kamera kapali veya model ve uygulama surumleri uyusmuyor.
  goto :fail
)

echo BASARILI: SignBridge unified71 v0.8.0 calisiyor.
echo Tarayici: http://localhost:3000
docker compose ps >> "%LOG%" 2>&1
start "" http://localhost:3000
pause
exit /b 0

:fail
echo.
echo Kurulum tamamlanamadi. Log: %LOG%
echo --- Son log satirlari ---
powershell -NoProfile -Command "if (Test-Path -LiteralPath '%LOG%') { Get-Content -LiteralPath '%LOG%' -Tail 30 }"
pause
exit /b 1
