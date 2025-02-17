@echo off
cd /d "C:\Users\DELL\The Web Developer Bootcamp 2024\JAVASCRIPT COURSE\Projects\sales-bill-system\sales-bill-system.bat"
start cmd.exe /k "npm start"
timeout /t 5 /nobreak
start http://localhost:3000