@echo off
echo Cleaning up large files from git history...

REM Remove large files from git cache
git rm --cached *.xlsx *.xls *.pdf *.mp4 *.zip *.rar *.exe *.bin 2>nul
git rm --cached -r llm-env/ models/ data/ temp/ tmp/ node_modules/ ai-models/ 2>nul

REM Remove files.txt
del files.txt 2>nul
git rm --cached files.txt 2>nul

REM Commit cleanup
git add .gitignore
git commit -m "Clean repository - remove large files"

REM Push changes
git push

echo Repository cleaned successfully!
pause