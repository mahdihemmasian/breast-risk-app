#define AppName "DICOM to JPEG Converter"
#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif
#define AppExe "DicomToJpeg.exe"

[Setup]
AppId={{6E3B5C1A-0F7A-4C2B-9A1D-D1C0A7E9F2B4}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=Mahdi Hemmasian
DefaultDirName={autopf}\DicomToJpeg
DefaultGroupName={#AppName}
UninstallDisplayIcon={app}\{#AppExe}
OutputDir=..\release
OutputBaseFilename=DicomToJpeg_Setup_{#AppVersion}
SetupIconFile=..\assets\app.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequiredOverridesAllowed=dialog
PrivilegesRequired=lowest

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
Name: "sendto"; Description: "Add to 'Send to' menu (right-click > Send to > DICOM to JPEG)"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "..\dist\DicomToJpeg\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\README_FA.md"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExe}"
Name: "{group}\Uninstall {#AppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; Tasks: desktopicon
Name: "{usersendto}\DICOM to JPEG"; Filename: "{app}\{#AppExe}"; Tasks: sendto

[Run]
Filename: "{app}\{#AppExe}"; Description: "{cm:LaunchProgram,{#AppName}}"; Flags: nowait postinstall skipifsilent
