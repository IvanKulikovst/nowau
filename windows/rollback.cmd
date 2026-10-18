@echo off
rem Возврат к предыдущей версии программы (данные не затрагиваются: при
rem необходимости откатите и их — «Сохранность данных» → «Точки восстановления»)
chcp 65001 >nul
set "APP=%LOCALAPPDATA%\Reglament-TST\app"
if not exist "%APP%\index.previous.html" (
  echo Предыдущая версия не найдена.
  pause
  exit /b 1
)
copy /y "%APP%\index.html" "%APP%\index.rollback-from.html" >nul
copy /y "%APP%\index.previous.html" "%APP%\index.html" >nul
echo Восстановлена предыдущая версия программы.
pause
