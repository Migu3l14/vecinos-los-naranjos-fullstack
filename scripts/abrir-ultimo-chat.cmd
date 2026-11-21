@echo off
cd /d "C:\Users\arago\OneDrive\Documentos\vecinos-los-naranjos-fullstack"
set "OPENCODE_EXE=C:\Users\arago\AppData\Local\Microsoft\WinGet\Packages\SST.opencode_Microsoft.Winget.Source_8wekyb3d8bbwe\opencode.exe"
if not exist "%OPENCODE_EXE%" set "OPENCODE_EXE=opencode"
echo ============================================================
echo Ultimo estado del proyecto: AGENTS.md
echo Sesion: ses_f9b3c3ef0ffeE9A3v4gr9JxD7t
echo Reabrir a mano: opencode --continue
echo ============================================================
"%OPENCODE_EXE%" --continue
