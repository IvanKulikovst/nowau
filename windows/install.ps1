# =====================================================================
#  Установка «Регламент-ТСТ» для текущего пользователя Windows
#  Права администратора и интернет не нужны.
#
#  Что делает:
#    1. Копирует index.html в %LOCALAPPDATA%\Reglament-TST\app
#       (прежняя версия сохраняется как index.previous.html — для отката);
#    2. Создаёт ярлыки «Регламент-ТСТ» на рабочем столе и в меню «Пуск».
#       Ярлык открывает программу в отдельном окне Microsoft Edge или
#       Google Chrome без адресной строки и вкладок (режим приложения);
#    3. Данные программы хранятся в собственном профиле браузера
#       %LOCALAPPDATA%\Reglament-TST\profile — очистка истории в обычном
#       браузере их не затрагивает.
#
#  Повторный запуск установки = обновление программы: данные сохраняются,
#  при первом запуске новой версии структура данных обновится сама
#  (перед этим программа создаёт точку восстановления).
# =====================================================================
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

$page = Join-Path $here 'index.html'
if (-not (Test-Path $page)) { $page = Join-Path (Split-Path -Parent $here) 'index.html' }
if (-not (Test-Path $page)) { throw 'Не найден файл index.html. Положите его рядом с install.cmd.' }

$root    = Join-Path $env:LOCALAPPDATA 'Reglament-TST'
$app     = Join-Path $root 'app'
$profile = Join-Path $root 'profile'
New-Item -ItemType Directory -Force -Path $app, $profile | Out-Null

$target = Join-Path $app 'index.html'
if (Test-Path $target) { Copy-Item $target (Join-Path $app 'index.previous.html') -Force }
Copy-Item $page $target -Force
foreach ($f in 'uninstall.ps1', 'uninstall.cmd', 'rollback.cmd') {
  $p = Join-Path $here $f
  if (Test-Path $p) { Copy-Item $p $root -Force }
}

$candidates = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
  "$env:ProgramFiles\Chromium\Application\chrome.exe"
)
$browser = $candidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $browser) { throw 'Не найден Microsoft Edge или Google Chrome. Установите один из них или откройте index.html двойным щелчком.' }

$url  = ([System.Uri]$target).AbsoluteUri
$argv = "--app=`"$url`" --user-data-dir=`"$profile`" --no-first-run --no-default-browser-check"

$shell = New-Object -ComObject WScript.Shell
$places = @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))
foreach ($dir in $places) {
  $lnk = $shell.CreateShortcut((Join-Path $dir 'Регламент-ТСТ.lnk'))
  $lnk.TargetPath       = $browser
  $lnk.Arguments        = $argv
  $lnk.WorkingDirectory = $app
  $lnk.IconLocation     = "$browser,0"
  $lnk.Description      = 'Автоматизированная система учёта и контроля «Регламент-ТСТ»'
  $lnk.Save()
}

Write-Host ''
Write-Host 'Готово. Программа установлена:' $target
Write-Host 'Ярлык «Регламент-ТСТ» — на рабочем столе и в меню «Пуск».'
Write-Host 'Данные хранятся в' $profile
Write-Host ''
Write-Host 'Если раньше программа открывалась в обычном браузере, перенесите данные:'
Write-Host '  в старом окне — «Сохранность данных» → «Создать резервную копию»,'
Write-Host '  в новом окне — «Сохранность данных» → «Восстановить из копии».'
