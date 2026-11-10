; Inno Setup: iscc desktop\installer.iss  (после сборки dist\ProfilKreditora.exe)
#define AppName "Профиль кредитора"
#define AppVersion "1.0.0"

[Setup]
AppId={{7C1F6C9E-3B1A-4E5B-9A55-C0DE0CRED001}
AppName={#AppName}
AppVersion={#AppVersion}
DefaultDirName={autopf}\ProfilKreditora
DefaultGroupName={#AppName}
OutputDir=..\dist
OutputBaseFilename=ProfilKreditora-Setup-{#AppVersion}
Compression=lzma2
SolidCompression=yes
PrivilegesRequired=lowest
ArchitecturesInstallIn64BitMode=x64compatible
SetupIconFile=..\frontend\public\icons\icon.ico
UninstallDisplayIcon={app}\ProfilKreditora.exe
WizardStyle=modern

[Languages]
Name: "russian"; MessagesFile: "compiler:Languages\Russian.isl"

[Files]
Source: "..\dist\ProfilKreditora.exe"; DestDir: "{app}"; Flags: ignoreversion
; Полный офлайн-пакет WebView2 (скачивается на сборке, см. workflow): интернет при установке не нужен.
; Ставится только если компонента на компьютере нет.
Source: "redist\WebView2RuntimeX64.exe"; DestDir: "{tmp}"; Flags: deleteafterinstall nocompression; Check: NeedsWebView2

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\ProfilKreditora.exe"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\ProfilKreditora.exe"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Создать ярлык на рабочем столе"; Flags: unchecked

[Run]
Filename: "{tmp}\WebView2RuntimeX64.exe"; Parameters: "/silent /install"; StatusMsg: "Установка встроенного компонента отображения (WebView2)..."; Check: NeedsWebView2; Flags: waituntilterminated
Filename: "{app}\ProfilKreditora.exe"; Description: "Запустить {#AppName}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; данные пользователя (%LOCALAPPDATA%\CreditorProfile) при удалении НЕ трогаем
Type: filesandordirs; Name: "{app}"

[Code]
// WebView2 Runtime: есть в Windows 11 и в обновлённой Windows 10; иначе ставим вместе с программой
const WV2 = '{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}';

function NeedsWebView2(): Boolean;
var v: String;
begin
  Result := not (
    RegQueryStringValue(HKLM, 'SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\' + WV2, 'pv', v) or
    RegQueryStringValue(HKLM, 'SOFTWARE\Microsoft\EdgeUpdate\Clients\' + WV2, 'pv', v) or
    RegQueryStringValue(HKCU, 'Software\Microsoft\EdgeUpdate\Clients\' + WV2, 'pv', v));
  if not Result then Result := (v = '') or (v = '0.0.0.0');
end;
