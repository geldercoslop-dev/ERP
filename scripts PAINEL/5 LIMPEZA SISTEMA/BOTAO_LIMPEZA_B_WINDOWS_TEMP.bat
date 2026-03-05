@echo off
chcp 65001 >nul
setlocal

echo =====================================
echo LIMPEZA B - WINDOWS TEMP
echo =====================================

del /q /f "%TEMP%\*" 2>nul
for /d %%D in ("%TEMP%\*") do rmdir /s /q "%%D" 2>nul

del /q /f "C:\Windows\Temp\*" 2>nul
for /d %%D in ("C:\Windows\Temp\*") do rmdir /s /q "%%D" 2>nul

echo OK. Se continuar lento: reinicie o PC.
pause