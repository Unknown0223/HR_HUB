; HR HUB Link — Inno Setup (ixtiyoriy, agar ISCC o‘rnatilgan bo‘lsa)
; Prefer: pack-setup.bat (Python Setup.exe, EULA wizard)
; Compile: ISCC.exe INSTALL.iss
;
#ifndef MyAppVersion
  #define MyAppVersion "1.0.1"
#endif

#define MyAppName "HR HUB Link"
#define MyAppPublisher "HR HUB"
#define MyAppExeName "ilova\HRHUB-Qurilma.exe"
#define MySourceDir "release\HRHUB-Link"

[Setup]
AppId={{8F3C2A1B-9D4E-4B6A-A7C1-HRHUB-LINK-01}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\HRHUB-Link
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=release
OutputBaseFilename=HRHUB-Link-Setup-Inno-{#MyAppVersion}
Compression=lzma
SolidCompression=yes
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible
WizardStyle=modern
LicenseFile=LICENSE.txt
InfoBeforeFile=LICENSE.txt
DisableWelcomePage=no
AllowNoIcons=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Desktop shortcut"; GroupDescription: "Additional icons:"
Name: "installservice"; Description: "Install Windows Service (GW + tunnel) after setup"; Flags: unchecked

[Files]
Source: "{#MySourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
; Sidecars next to Setup.exe (from bound download)
Source: "{src}\config.json"; DestDir: "{app}"; Flags: external skipifsourcedoesntexist ignoreversion
Source: "{src}\connection.hrhub"; DestDir: "{app}"; Flags: external skipifsourcedoesntexist ignoreversion
Source: "{src}\config.json"; DestDir: "{app}\ilova"; Flags: external skipifsourcedoesntexist ignoreversion
Source: "{src}\connection.hrhub"; DestDir: "{app}\ilova"; Flags: external skipifsourcedoesntexist ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}\ilova"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}\ilova"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "HR HUB Link ochish"; WorkingDir: "{app}\ilova"; Flags: nowait postinstall skipifsilent
Filename: "{app}\install-service.bat"; Description: "Windows Service o'rnatish (ADMIN)"; Flags: postinstall skipifsilent runascurrentuser; Tasks: installservice

[UninstallRun]
Filename: "{app}\uninstall-service.bat"; Flags: runhidden; RunOnceId: "UninstService"
