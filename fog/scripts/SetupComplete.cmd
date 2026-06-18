@echo off
REM ============================================================================
REM bootlab-pxe : Windows 11 first-boot bootstrap  (FOG Sysprep workflow)
REM ============================================================================
REM Bake this ONE file into the Sysprep master at:
REM     C:\Windows\Setup\Scripts\SetupComplete.cmd
REM Windows Setup runs it automatically, ONCE, as SYSTEM, at the end of the
REM OOBE/specialize pass on the first boot after FOG deploys the image -- no
REM logon and no human interaction required.
REM
REM It does NOT contain the setup logic itself. It just downloads the current
REM assembled first-boot script from the bootlab server and runs it. That means
REM operators edit the actual setup (GPU drivers, etc.) from the panel's
REM "Setup Scripts" tab and changes take effect on the NEXT deploy -- you never
REM have to re-capture the Sysprep master to change what runs.
REM
REM ONE-TIME SETUP (before sysprep /generalize):
REM   1. Set BOOTLAB_SERVER below to the bootlab box's LAN IP (the one running
REM      this docker-compose; same host as PXE_SERVER in .env).
REM   2. Host driver binaries on the bootlab box under ./data/drivers/ -- they
REM      are served at http://<BOOTLAB_SERVER>:8085/drivers/ and the setup
REM      scripts fetch them via $PXE_BASE/drivers/...
REM ============================================================================

set "BOOTLAB_SERVER=BOOTLAB_SERVER_IP"
set "PORT=8085"
set "LOGDIR=C:\PXE"
if not exist "%LOGDIR%" mkdir "%LOGDIR%"

echo [%DATE% %TIME%] SetupComplete bootstrap starting >> "%LOGDIR%\setupcomplete.log"

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "try { Invoke-WebRequest -Uri ('http://%BOOTLAB_SERVER%:%PORT%/api/v1/setup/firstboot.ps1') -OutFile 'C:\PXE\firstboot.ps1' -UseBasicParsing -TimeoutSec 60 } catch { $_ | Out-File -Append 'C:\PXE\setupcomplete.log'; exit 1 }" >> "%LOGDIR%\setupcomplete.log" 2>&1

if exist "C:\PXE\firstboot.ps1" (
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\PXE\firstboot.ps1" >> "%LOGDIR%\firstboot.log" 2>&1
) else (
    echo [%DATE% %TIME%] firstboot.ps1 not downloaded -- check BOOTLAB_SERVER and network >> "%LOGDIR%\setupcomplete.log"
)

echo [%DATE% %TIME%] SetupComplete bootstrap finished (exit %ERRORLEVEL%) >> "%LOGDIR%\setupcomplete.log"
exit /b 0
