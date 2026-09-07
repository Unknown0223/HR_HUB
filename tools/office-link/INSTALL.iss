; HR HUB Link — Inno Setup script (MSI-lite / Setup.exe)
; Compile: Inno Setup Compiler → Open INSTALL.iss → Build
; Avval: BUILD-EXE.bat (dist\HRHUB-Qurilma\...)
;
; #define MyAppVersion "1.2.0"

#ifndef MyAppVersion
  #define MyAppVersion "1.2.0"
#endif

#define MyAppName "HR HUB Link"
#define MyAppPublisher "HR HUB"
#define MyAppExeName "HRHUB-Qurilma.exe"
#define MySourceDir "dist\HRHUB-Qurilma"

[Setup]
AppId={{8F3C2A1B-9D4E-4B6A-A7C1-HRHUB-LINK-01}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\HRHUB-Link
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=dist
OutputBaseFilename=HRHUB-Link-Setup-{#MyAppVersion}
Compression=lzma
SolidCompression=yes
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible
WizardStyle=modern

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Desktop shortcut"; GroupDescription: "Additional icons:"
Name: "installservice"; Description: "Install Windows Service (GW + tunnel) after setup"; Flags: unchecked

[Files]
Source: "{#MySourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
; Service helpers (also copied by pack-installer into onedir)
Source: "install-service.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "uninstall-service.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "SERVICE.txt"; DestDir: "{app}"; Flags: ignoreversion
Source: "QOLLAMA.txt"; DestDir: "{app}"; Flags: ignoreversion
Source: "service_worker.py"; DestDir: "{app}"; Flags: ignoreversion
Source: "bulk_provision.py"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\SERVICE yo'riqnoma"; Filename: "{app}\SERVICE.txt"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "HR HUB Link ochish"; Flags: nowait postinstall skipifsilent
Filename: "{app}\install-service.bat"; Description: "Windows Service o'rnatish (ADMIN)"; Flags: postinstall skipifsilent runascurrentuser; Tasks: installservice

[UninstallRun]
Filename: "{app}\uninstall-service.bat"; Flags: runhidden; RunOnceId: "UninstService"
