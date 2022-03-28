; For string comparison 'S>':
!include 'LogicLib.nsh'

; For ExecShellWaitEx:
!include 'StdUtils.nsh'

; Adding custom installation steps for electron-builder, ref:
; https://www.electron.build/configuration/nsis#custom-nsis-script
!macro customInstall
  ; ===============================================================
  ; Installation of drivers for dfu trigger and cdc acm
  ; ===============================================================

  ; Install drivers for DFU trigger and CDC ACM
  ; Put the files to the output directory.
  ; File "${BUILD_RESOURCES_DIR}\drivers\nrfconnect-driver-installer.exe"

  ; ExecShell 'runas' '"$INSTDIR\nrfconnect-driver-installer.exe"'

  ; ===============================================================
  ; Installation of BLE 5.0 driver
  ; ===============================================================

  ; but size is 90M, TBD
  

  ;  TODO: check, is VC 2015 redistributable necessary?
  ; ===============================================================
  ; Installation of VC 2015 redistributable
  ; ============================================================== =

  ; Adding Visual C++ Redistributable for Visual Studio 2015
  ; File "${BUILD_RESOURCES_DIR}\vc_redist_2015.x86.exe"

  ; ; Running installer and waiting before continuing
  ; ExecWait '"$INSTDIR\vc_redist_2015.x86.exe" /passive /norestart'

!macroend
