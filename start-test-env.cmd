@echo off
rem Demarre l environnement de TEST (backend 8086 + frontend 4201).
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-test-env.ps1" %*
