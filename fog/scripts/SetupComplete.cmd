@echo off
REM ============================================================================
REM bootlab-pxe : Windows 11 Pro first-boot launcher (FOG Sysprep workflow)
REM ============================================================================
REM Bake this into the Sysprep master at:
REM     C:\Windows\Setup\Scripts\SetupComplete.cmd
REM Windows Setup runs this automatically, ONCE, as SYSTEM, at the end of the
REM specialize/OOBE pass on the first boot after FOG deploys the image -- no
REM logon and no human interaction required.
REM
REM It just hands off to post-deploy.ps1 (same folder) which does the real work:
REM   - detect a dedicated GPU and silently install its driver IF present
REM   - run the legitimate Windows activation step
REM ============================================================================

set "LOGDIR=C:\PXE"
if not exist "%LOGDIR%" mkdir "%LOGDIR%"

echo [%DATE% %TIME%] SetupComplete starting >> "%LOGDIR%\setupcomplete.log"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0post-deploy.ps1" >> "%LOGDIR%\post-deploy.log" 2>&1

echo [%DATE% %TIME%] SetupComplete finished (post-deploy exit %ERRORLEVEL%) >> "%LOGDIR%\setupcomplete.log"
exit /b 0
