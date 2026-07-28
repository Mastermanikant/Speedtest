@echo off
setlocal

set "GIT=D:\03_Resources_and_Software\Software\Desktop_Softwere_Backup\Git\bin\git.exe"
set "REPO=d:\Speed test"

echo.
echo ============================================
echo  Frankbase SpeedPulse - Auto Git Commit
echo ============================================
echo.

cd /d "%REPO%"

echo [1] Configuring Git identity...
"%GIT%" config user.email "speedpulse@frankbase.com"
"%GIT%" config user.name "Frankbase SpeedPulse"

echo [2] Staging all changes...
"%GIT%" add .

echo [3] Committing...
"%GIT%" commit -m "feat: upload fix (4MB pipelining), live graph section, info cards"

echo [4] Git log (last 3 commits):
"%GIT%" log --oneline -3

echo.
echo ============================================
echo  DONE! Now push to GitHub using GitHub Desktop.
echo ============================================
pause
