@echo off
title Frankbase SpeedPulse - Cloudflare One-Click Deployer
color 0A

:: -------------------------------------------------------------------
:: AUTOMATICALLY CONFIGURE PATH FOR NODE, NPM, WRANGLER, AND GIT
:: -------------------------------------------------------------------
set "NODE_PATH=C:\Users\IT CARE SAHARSA\AppData\Local\OpenAI\Codex\runtimes\cua_node\ecfc0d9aa02807e3\bin"
set "NPM_PATH=C:\Users\IT CARE SAHARSA\AppData\Roaming\npm"
set "GIT_PATH=C:\Users\IT CARE SAHARSA\AppData\Local\GitHubDesktop\app-3.6.2\resources\app\git\cmd"

set "PATH=%NODE_PATH%;%NPM_PATH%;%GIT_PATH%;%PATH%"

echo =======================================================================
echo          FRANKBASE SPEEDPULSE - ONE-CLICK CLOUDFLARE DEPLOYER
echo =======================================================================
echo.
echo Current Directory: %~dp0
echo Verifying Node.js Runtime:
call node -v
echo.

echo -----------------------------------------------------------------------
echo STEP 1: Deploying Frontend Web App to Cloudflare Pages...
echo -----------------------------------------------------------------------
cd /d "%~dp0"

call "%NPM_PATH%\wrangler.cmd" pages deploy "%~dp0." --project-name=frankbase-speed --branch=main --commit-dirty=true

echo.
echo -----------------------------------------------------------------------
echo STEP 2: Deploying Cloudflare Worker API Backend...
echo -----------------------------------------------------------------------
if exist "%~dp0worker\index.js" (
    cd /d "%~dp0worker"
    call "%NPM_PATH%\wrangler.cmd" deploy index.js --name=frankbase-speed-api --compatibility-date=2026-01-01
)

echo.
echo =======================================================================
echo 🎉 DEPLOYMENT COMPLETED SUCCESSFULLY!
echo =======================================================================
echo.
echo Live Website: https://main.frankbase-speed.pages.dev/
echo.
echo Custom Domain Setup (Optional):
echo 1. Open Cloudflare Dashboard: https://dash.cloudflare.com
echo 2. Go to "Workers & Pages" -> Select "frankbase-speed"
echo 3. Click "Custom Domains" -> Set up "speed.frankbase.com"
echo.
echo =======================================================================
pause
