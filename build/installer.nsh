; F61 · Limpieza silenciosa al instalar/actualizar (electron-builder incluye
; este fichero automáticamente por vivir en buildResources como installer.nsh).
;
;  1) customInit — antes de instalar: cierra procesos de cualquier versión y
;     DESINSTALA en silencio toda instalación per-user previa cuyo DisplayName
;     empiece por "Metrolist" o "ERO'" (cualquier GUID, incluida la propia
;     versión anterior). F63: como el barrido enumera TODAS las claves de
;     HKCU\...\Uninstall y filtra por DisplayName — no por GUID ni appId —
;     cubre por igual las instalaciones con el appId viejo
;     `com.zero.metrolistpc` (≤ v1.2.0 pre-rebranding: "Metrolist PC" y
;     "ERO'S Music") y con el nuevo `com.zero.erosmusic`. NO cambiar esta
;     detección a una por clave/GUID: perdería a los usuarios antiguos.
;     El uninstaller se copia a $PLUGINSDIR y se ejecuta
;     con `_?=` — igual que hace el propio electron-builder — para que
;     ExecWait espere DE VERDAD (sin _?= el uninstaller se relanza desde TEMP
;     y sigue vivo en segundo plano: carrera con la instalación nueva, que es
;     exactamente lo que corrompía la entrada del registro). Los datos del
;     usuario sobreviven siempre: /KEEP_APP_DATA + --updated, y todas las
;     versiones publicadas llevan deleteAppDataOnUninstall=false.
;
;  2) customInstall — tras instalar con éxito: borra los setups antiguos
;     (EROSMusic-Setup-*.exe, MetrolistPC-Setup-*.exe, "Metrolist PC Setup *.exe")
;     de la carpeta desde la que corre el instalador y de Descargas, conservando
;     el que se está ejecutando, y reafirma DisplayName/DisplayVersion en el
;     registro. Traza en $TEMP\eros-f61.log para diagnóstico.

!macro _f61Log TEXT
  FileOpen $9 "$TEMP\eros-f61.log" a
  FileSeek $9 0 END
  FileWrite $9 "${TEXT}$\r$\n"
  FileClose $9
!macroend

!macro _erosPurgeSetups DIR PATTERN
  !define _epsUID ${__LINE__}
  Push $R0
  Push $R1
  ClearErrors
  FindFirst $R0 $R1 "${DIR}\${PATTERN}"
  purgeLoop_${_epsUID}:
    IfErrors purgeDone_${_epsUID}
    StrCmp $R1 $EXEFILE purgeNext_${_epsUID}   ; nunca borrar el setup en ejecución
    Delete "${DIR}\$R1"
    !insertmacro _f61Log "purge: ${DIR}\$R1"
  purgeNext_${_epsUID}:
    ClearErrors
    FindNext $R0 $R1
    Goto purgeLoop_${_epsUID}
  purgeDone_${_epsUID}:
  FindClose $R0
  Pop $R1
  Pop $R0
  !undef _epsUID
!macroend

!macro customInit
  InitPluginsDir
  !insertmacro _f61Log "== customInit ${VERSION} =="

  ; Cierra cualquier versión en marcha para que la desinstalación no falle
  nsExec::Exec 'taskkill /F /IM "Metrolist PC.exe" /T'
  Pop $0
  nsExec::Exec 'taskkill /F /IM "ERO$\'S Music.exe" /T'
  Pop $0

  ; Dos pasadas sobre el registro per-user (al borrar una subkey los índices
  ; se compactan y una entrada puede saltarse; la segunda pasada la caza).
  ; El índice SIEMPRE avanza: sin riesgo de bucle infinito si algo falla.
  StrCpy $R2 0
  f61PassLoop:
    StrCpy $R9 0
  f61EnumLoop:
    EnumRegKey $R8 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall" $R9
    StrCmp $R8 "" f61EnumDone
    IntOp $R9 $R9 + 1
    ReadRegStr $R7 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\$R8" "DisplayName"
    StrCpy $R6 $R7 9
    StrCmp $R6 "Metrolist" f61Zap
    StrCpy $R6 $R7 4
    StrCmp $R6 "ERO'" f61Zap
    Goto f61EnumLoop
  f61Zap:
    ReadRegStr $R5 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\$R8" "UninstallString"
    StrCmp $R5 "" f61EnumLoop
    !insertmacro _f61Log "zap: $R7 [$R8] -> $R5"
    ; Carpeta de instalación: del propio path del uninstaller (InstallLocation
    ; viene vacío en los builds de electron-builder). Llamadas directas a las
    ; funciones de installUtil.nsh — sus macros aún no existen en customInit
    ; (installer.nsi las incluye más abajo), pero las funciones sí se resuelven.
    Push "$R5"
    Call GetInQuotes
    Pop $R4
    StrCmp $R4 "" f61EnumLoop
    Push $R4
    Call GetFileParent
    Pop $R3
    StrCmp $R3 "" f61EnumLoop
    CopyFiles /SILENT "$R4" "$PLUGINSDIR\f61-un.exe"
    IfFileExists "$PLUGINSDIR\f61-un.exe" 0 f61EnumLoop
    ExecWait '"$PLUGINSDIR\f61-un.exe" /S /KEEP_APP_DATA /currentuser --updated _?=$R3' $1
    !insertmacro _f61Log "zap done: exit=$1 dir=$R3"
    Delete "$PLUGINSDIR\f61-un.exe"
    ; con _?= el uninstaller no puede autoborrarse: recoger restos
    Delete "$R3\Uninstall*.exe"
    RMDir "$R3"
    Goto f61EnumLoop
  f61EnumDone:
    IntOp $R2 $R2 + 1
    IntCmp $R2 2 f61PassDone f61PassLoop f61PassDone
  f61PassDone:
    !insertmacro _f61Log "customInit fin"
!macroend

!macro customInstall
  !insertmacro _f61Log "== customInstall ${VERSION} =="
  !insertmacro _erosPurgeSetups "$EXEDIR" "EROSMusic-Setup-*.exe"
  !insertmacro _erosPurgeSetups "$EXEDIR" "MetrolistPC-Setup-*.exe"
  !insertmacro _erosPurgeSetups "$EXEDIR" "Metrolist PC Setup *.exe"
  !insertmacro _erosPurgeSetups "$PROFILE\Downloads" "EROSMusic-Setup-*.exe"
  !insertmacro _erosPurgeSetups "$PROFILE\Downloads" "MetrolistPC-Setup-*.exe"
  !insertmacro _erosPurgeSetups "$PROFILE\Downloads" "Metrolist PC Setup *.exe"
  ; Cinturón anti-carreras: pase lo que pase con desinstalaciones rezagadas,
  ; la entrada de "Aplicaciones instaladas" queda con ESTA versión.
  WriteRegStr HKCU "${UNINSTALL_REGISTRY_KEY}" "DisplayName" "${UNINSTALL_DISPLAY_NAME}"
  WriteRegStr HKCU "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion" "${VERSION}"
  !insertmacro _f61Log "customInstall fin"
!macroend
