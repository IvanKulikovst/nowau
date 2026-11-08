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

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\ProfilKreditora.exe"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\ProfilKreditora.exe"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Создать ярлык на рабочем столе"; Flags: unchecked

[Run]
Filename: "{app}\ProfilKreditora.exe"; Description: "Запустить {#AppName}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; данные пользователя (%LOCALAPPDATA%\CreditorProfile) при удалении НЕ трогаем
Type: filesandordirs; Name: "{app}"
