@echo off
title Frankbase SpeedPulse - One-Click Cloudflare Deployer
color 0A

:: Set PATH explicitly for Node.js and Wrangler
set "NODE_DIR=C:\Users\IT CARE SAHARSA\AppData\Local\OpenAI\Codex\runtimes\cua_node\ecfc0d9aa02807e3\bin"
set "NPM_DIR=C:\Users\IT CARE SAHARSA\AppData\Roaming\npm"
set "PATH=%NODE_DIR%;%NPM_DIR%;%PATH%"

echo =======================================================================
echo          FRANKBASE SPEEDPULSE - ONE-CLICK CLOUDFLARE DEPLOYER
echo =======================================================================
echo.
echo Target Project Directory: D:\InternetSpeedTest_Research\project
echo Target Domain: speed.frankbase.com
echo Node Engine Verified:
"%NODE_DIR%\node.exe" -v
echo.
echo STEP 1: Deploying Frontend UI to Cloudflare Pages...
echo -----------------------------------------------------------------------

cd /d D:\InternetSpeedTest_Research\project

"%NODE_DIR%\node.exe" "%NPM_DIR%\node_modules\wrangler\bin\wrangler.js" pages deploy . --project-name=frankbase-speed --branch=main --commit-dirty=true

echo.
echo =======================================================================
echo STEP 2: Deploying Cloudflare Edge Worker API...
echo =======================================================================
echo.

cd /d D:\InternetSpeedTest_Research\project\worker

"%NODE_DIR%\node.exe" "%NPM_DIR%\node_modules\wrangler\bin\wrangler.js" deploy index.js --name=frankbase-speed-api --compatibility-date=2026-01-01

echo.
echo =======================================================================
echo 🎉 DEPLOYMENT COMPLETED SUCCESSFULLY!
echo =======================================================================
echo.
echo TO CONNECT YOUR CUSTOM SUBDOMAIN (speed.frankbase.com):
echo 1. Open Cloudflare Dashboard: https://dash.cloudflare.com
echo 2. Go to "Workers & Pages" -> Select "frankbase-speed"
echo 3. Click "Custom Domains" tab -> Click "Set up a Custom Domain"
echo 4. Type: speed.frankbase.com and click "Activate domain"!
echo.
echo =======================================================================
pause
