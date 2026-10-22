@echo off
rem Переносной запуск «Регламент-ТС» (например, с флешки): данные хранятся
rem в папке data рядом с этим файлом и переносятся вместе с ним.
chcp 65001 >nul
setlocal
set "APPDIR=%~dp0"
set "PAGE=%APPDIR%index.html"
if not exist "%PAGE%" set "PAGE=%APPDIR%..\index.html"
if not exist "%PAGE%" (
  echo Не найден файл index.html рядом с этим файлом.
  pause
  exit /b 1
)
for %%I in ("%PAGE%") do set "PAGE=%%~fI"
set "PROFILE=%APPDIR%data\profile"
set "BROWSER="
for %%B in ("%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" "%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe") do (
  if not defined BROWSER if exist "%%~B" set "BROWSER=%%~B"
)
if not defined BROWSER (
  echo Не найден Microsoft Edge или Google Chrome — открываю в браузере по умолчанию.
  start "" "%PAGE%"
  exit /b 0
)
set "URL=file:///%PAGE:\=/%"
start "" "%BROWSER%" --app="%URL%" --user-data-dir="%PROFILE%" --no-first-run --no-default-browser-check
