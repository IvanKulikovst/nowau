Unicode true
!define APP "Резервное энергоснабжение (СППР)"
!define VER "1.0.0"
!define UNINST "Software\Microsoft\Windows\CurrentVersion\Uninstall\PowerBackupDss"
!include "MUI2.nsh"
!include "LogicLib.nsh"

Name "${APP}"
OutFile "..\dist\PowerBackupDss-Setup.exe"
InstallDir "$PROGRAMFILES64\PowerBackupDss"
InstallDirRegKey HKLM "Software\PowerBackupDss" "Dir"
RequestExecutionLevel admin
SetCompressor /SOLID lzma

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_FUNCTION LaunchApp
!define MUI_FINISHPAGE_RUN_TEXT "Запустить программу"
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Russian"

Function LaunchApp
  Exec '"$SYSDIR\wscript.exe" "$INSTDIR\launch.vbs"'
FunctionEnd

Section "Install"
  SetOutPath "$INSTDIR"
  File "..\dist\PowerBackupDss.jar"
  File "launch.vbs"
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  CreateDirectory "$SMPROGRAMS\${APP}"
  CreateShortcut "$SMPROGRAMS\${APP}\${APP}.lnk" "$SYSDIR\wscript.exe" '"$INSTDIR\launch.vbs"' "$SYSDIR\shell32.dll" 13
  CreateShortcut "$SMPROGRAMS\${APP}\Удалить.lnk" "$INSTDIR\Uninstall.exe"
  CreateShortcut "$DESKTOP\${APP}.lnk" "$SYSDIR\wscript.exe" '"$INSTDIR\launch.vbs"' "$SYSDIR\shell32.dll" 13

  WriteRegStr HKLM "Software\PowerBackupDss" "Dir" "$INSTDIR"
  WriteRegStr HKLM "${UNINST}" "DisplayName" "${APP}"
  WriteRegStr HKLM "${UNINST}" "DisplayVersion" "${VER}"
  WriteRegStr HKLM "${UNINST}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKLM "${UNINST}" "NoModify" 1
  WriteRegDWORD HKLM "${UNINST}" "NoRepair" 1

  ; Java нужна для работы программы
  nsExec::Exec 'javaw -version'
  Pop $0
  ${If} $0 != 0
    MessageBox MB_ICONINFORMATION|MB_OK "На компьютере не найдена Java (JRE 17 или выше).$\nУстановите её с https://adoptium.net — иначе программа не запустится."
  ${EndIf}
SectionEnd

Section "Uninstall"
  Delete "$INSTDIR\PowerBackupDss.jar"
  Delete "$INSTDIR\launch.vbs"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
  Delete "$SMPROGRAMS\${APP}\*.lnk"
  RMDir "$SMPROGRAMS\${APP}"
  Delete "$DESKTOP\${APP}.lnk"
  DeleteRegKey HKLM "${UNINST}"
  DeleteRegKey HKLM "Software\PowerBackupDss"
SectionEnd
