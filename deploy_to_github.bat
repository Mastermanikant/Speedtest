@echo off
title Frankbase SpeedPulse - GitHub One-Click Deployer
color 0B

:: -------------------------------------------------------------------
:: AUTOMATICALLY CONFIGURE PATH FOR GIT AND NODE
:: -------------------------------------------------------------------
set "NODE_PATH=C:\Users\IT CARE SAHARSA\AppData\Local\OpenAI\Codex\runtimes\cua_node\ecfc0d9aa02807e3\bin"
set "GIT_PATH=C:\Users\IT CARE SAHARSA\AppData\Local\GitHubDesktop\app-3.6.2\resources\app\git\cmd"

set "PATH=%NODE_PATH%;%GIT_PATH%;%PATH%"

echo =======================================================================
echo          FRANKBASE SPEEDPULSE - ONE-CLICK GITHUB DEPLOYER
echo =======================================================================
echo.
cd /d "%~dp0"

if not exist ".git" (
    echo Initializing new Git repository...
    git init
    git branch -M main
)

echo Staging all project files...
git add .

set /p COMMIT_MSG="Enter commit message (Press ENTER for default 'Update Speed Test App'): "
if "%COMMIT_MSG%"=="" set COMMIT_MSG=Update Speed Test App

git commit -m "%COMMIT_MSG%"

echo.
set REMOTES=
for /f "delims=" %%a in ('git remote') do set REMOTES=%%a
if "%REMOTES%"=="" (
    echo.
    echo No Remote Repository Connected!
    set /p REPO_URL="Enter your GitHub Repository URL (e.g. https://github.com/username/speedtest.git): "
    if not "!REPO_URL!"=="" (
        git remote add origin !REPO_URL!
    ) else (
        git remote add origin %REPO_URL%
    )
)

echo Pushing code to GitHub (main branch)...
git push -u origin main

echo.
echo =======================================================================
echo 🎉 GITHUB SYNC COMPLETED SUCCESSFULLY!
echo =======================================================================
pause
