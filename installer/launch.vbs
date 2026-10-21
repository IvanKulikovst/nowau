' Запуск PowerBackupDss.jar без окна консоли
Option Explicit
Dim sh, fso, dir, rc
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
On Error Resume Next
rc = sh.Run("javaw -jar """ & dir & "\PowerBackupDss.jar""", 0, False)
If Err.Number <> 0 Then
    MsgBox "Не найдена среда выполнения Java (JRE 17 или выше)." & vbCrLf & _
           "Установите Java с https://adoptium.net и повторите запуск.", vbExclamation, "Резервное энергоснабжение"
End If
