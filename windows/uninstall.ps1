# Удаление «Регламент-ТСТ». По умолчанию данные НЕ удаляются:
#   powershell -ExecutionPolicy Bypass -File uninstall.ps1            — убрать программу и ярлыки
#   powershell -ExecutionPolicy Bypass -File uninstall.ps1 -RemoveData — убрать вместе с данными
param([switch]$RemoveData)
$ErrorActionPreference = 'Stop'
$root = Join-Path $env:LOCALAPPDATA 'Reglament-TST'
foreach ($dir in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {
  $l = Join-Path $dir 'Регламент-ТСТ.lnk'
  if (Test-Path $l) { Remove-Item $l -Force }
}
if (Test-Path (Join-Path $root 'app')) { Remove-Item (Join-Path $root 'app') -Recurse -Force }
if ($RemoveData) {
  Write-Host 'Удаляются данные программы. Резервную копию нужно было сохранить заранее.'
  if (Test-Path $root) { Remove-Item $root -Recurse -Force }
} else {
  Write-Host 'Программа и ярлыки удалены. Данные сохранены в' (Join-Path $root 'profile')
  Write-Host 'При повторной установке они откроются снова.'
}
