@echo off
rem Arrete l environnement de TEST (ports 8086 et 4201).
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop-test-env.ps1" %*
pause
