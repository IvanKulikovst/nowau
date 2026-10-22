Unicode true
; Установщик «Регламент-ТС» для Windows (без прав администратора).
; Сборка: node scripts/build-installer.js (makensis из кэша electron-builder или из PATH).
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"

!define APPNAME "Регламент-ТС"
!define APPEXE "Reglament-TS.exe"
!define APPID "ReglamentTS"
!define UNKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPID}"
!ifndef VERSION
  !define VERSION "1.0.0"
!endif
!ifndef OUTFILE
  !define OUTFILE "Reglament-TS-Setup.exe"
!endif
!ifndef SRCDIR
  !define SRCDIR "stage"
!endif

Name "${APPNAME}"
OutFile "${OUTFILE}"
InstallDir "$LOCALAPPDATA\Programs\${APPNAME}"
InstallDirRegKey HKCU "Software\${APPID}" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma
BrandingText "${APPNAME} ${VERSION}"
Icon "${ICON}"
UninstallIcon "${ICON}"
VIProductVersion "${VERSION}.0"
VIAddVersionKey /LANG=1049 "ProductName" "${APPNAME}"
VIAddVersionKey /LANG=1049 "FileDescription" "Установщик ${APPNAME}"
VIAddVersionKey /LANG=1049 "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=1049 "ProductVersion" "${VERSION}"

!define MUI_ICON "${ICON}"
!define MUI_UNICON "${ICON}"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\${APPEXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Запустить ${APPNAME}"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Russian"

; Если программа запущена, её файлы заняты: просим закрыть и повторяем
Function CheckRunning
  ${If} ${FileExists} "$INSTDIR\${APPEXE}"
    retry:
    ClearErrors
    FileOpen $0 "$INSTDIR\${APPEXE}" a
    ${If} ${Errors}
      MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "${APPNAME} запущена. Закройте программу и нажмите «Повтор»." IDRETRY retry
      Abort
    ${EndIf}
    FileClose $0
  ${EndIf}
FunctionEnd

Section "Install"
  ; Всегда ставим в собственную подпапку: выбранная пользователем папка не должна пострадать при удалении
  ${GetFileName} "$INSTDIR" $R0
  ${If} $R0 != "${APPNAME}"
    StrCpy $INSTDIR "$INSTDIR\${APPNAME}"
  ${EndIf}
  Call CheckRunning
  SetOutPath "$INSTDIR"
  File /r "${SRCDIR}\*.*"
  File "/oname=icon.ico" "${ICON}"
  FileOpen $0 "$INSTDIR\.reglament-ts" w
  FileWrite $0 "${APPNAME} ${VERSION}"
  FileClose $0
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  ; Ярлыки (прежние ярлыки версии на базе браузера убираются)
  Delete "$DESKTOP\Регламент-ТСТ.lnk"
  Delete "$SMPROGRAMS\Регламент-ТСТ.lnk"
  CreateShortCut "$SMPROGRAMS\${APPNAME}.lnk" "$INSTDIR\${APPEXE}" "" "$INSTDIR\icon.ico" 0
  CreateShortCut "$DESKTOP\${APPNAME}.lnk" "$INSTDIR\${APPEXE}" "" "$INSTDIR\icon.ico" 0

  WriteRegStr HKCU "Software\${APPID}" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UNKEY}" "DisplayName" "${APPNAME}"
  WriteRegStr HKCU "${UNKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNKEY}" "Publisher" "${APPNAME}"
  WriteRegStr HKCU "${UNKEY}" "DisplayIcon" "$INSTDIR\icon.ico"
  WriteRegStr HKCU "${UNKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNKEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKCU "${UNKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNKEY}" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKCU "${UNKEY}" "EstimatedSize" "$0"
SectionEnd

Section "Uninstall"
  Call un.CheckRunning
  Delete "$DESKTOP\${APPNAME}.lnk"
  Delete "$SMPROGRAMS\${APPNAME}.lnk"
  ; Удаляем папку целиком только если это наша установка (метка), иначе — только свои файлы
  ${If} ${FileExists} "$INSTDIR\.reglament-ts"
    RMDir /r "$INSTDIR"
  ${Else}
    Delete "$INSTDIR\${APPEXE}"
    Delete "$INSTDIR\Uninstall.exe"
    Delete "$INSTDIR\icon.ico"
  ${EndIf}
  DeleteRegKey HKCU "${UNKEY}"
  DeleteRegKey HKCU "Software\${APPID}"
  MessageBox MB_OK|MB_ICONINFORMATION "${APPNAME} удалена.$\r$\n$\r$\nВаши данные сохранены: папка «Документы\${APPNAME}»."
SectionEnd

Function un.CheckRunning
  ${If} ${FileExists} "$INSTDIR\${APPEXE}"
    retry:
    ClearErrors
    FileOpen $0 "$INSTDIR\${APPEXE}" a
    ${If} ${Errors}
      MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "${APPNAME} запущена. Закройте программу и нажмите «Повтор»." IDRETRY retry
      Abort
    ${EndIf}
    FileClose $0
  ${EndIf}
FunctionEnd
