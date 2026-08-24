@echo off
set "GIT=D:\03_Resources_and_Software\Software\Desktop_Softwere_Backup\Git\bin\git.exe"
set "REPO=d:\Speed test"

cd /d "%REPO%"

echo Temporarily disabling SSL verification for push...
"%GIT%" config http.sslVerify false

echo Pushing to GitHub...
"%GIT%" push -u origin main

echo Re-enabling SSL verification...
"%GIT%" config http.sslVerify true

echo Done!
