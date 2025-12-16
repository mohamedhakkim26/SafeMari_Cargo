@echo off
echo Creating fresh repository...

REM Get current remote URL
for /f "tokens=*" %%i in ('git remote get-url origin') do set REMOTE_URL=%%i

REM Backup current code
xcopy . ..\SafeMari_Backup /E /I /Y /Q

REM Remove git history
rmdir /s /q .git

REM Create fresh repo
git init
git add .
git commit -m "Fresh start - clean repository"
git remote add origin %REMOTE_URL%
git push -u origin main --force

echo Fresh repository created! Size should be under 1MB now.
pause