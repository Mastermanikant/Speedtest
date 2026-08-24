@echo off
set "GIT=D:\03_Resources_and_Software\Software\Desktop_Softwere_Backup\Git\bin\git.exe"
set "REPO=d:\Speed test"

cd /d "%REPO%"
"%GIT%" add service-worker.js
"%GIT%" commit -m "fix: bump service worker cache to v5 to force UI update"
"%GIT%" config http.sslVerify false
"%GIT%" push
"%GIT%" config http.sslVerify true
echo Done!
