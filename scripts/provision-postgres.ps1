$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $workspace

Clear-Host
$dash = [char]0x2014
$upperOAcute = [char]0x00D3
$lowerNAcute = [char]0x00F1
$lowerAAcute = [char]0x00E1
Write-Host '============================================================' -ForegroundColor Cyan
Write-Host ("AULIGMA {0} CONFIGURACI{1}N POSTGRESQL" -f $dash, $upperOAcute) -ForegroundColor Cyan
Write-Host '============================================================' -ForegroundColor Cyan
Write-Host ("La contrase{0}a se solicitar{1} de forma privada y no se mostrar{1}." -f $lowerNAcute, $lowerAAcute)
Write-Host ''

function ConvertFrom-PrivateSecureString([Security.SecureString]$Value) {
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
  try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}

$adminPrompt = "Contrase{0}a del usuario postgres (no se mostrar{1})" -f $lowerNAcute, $lowerAAcute
$adminSecure = Read-Host $adminPrompt -AsSecureString
$env:AULIGMA_PG_ADMIN_PASSWORD = ConvertFrom-PrivateSecureString $adminSecure
try {
  $output = @(& node.exe '.\scripts\provision-postgres.mjs' 2>&1 | ForEach-Object { $_.ToString() })
  if ($LASTEXITCODE -eq 12) {
    $appPrompt = "auligma_app ya existe. Escribe su contrase{0}a actual (no se mostrar{1})" -f $lowerNAcute, $lowerAAcute
    $appSecure = Read-Host $appPrompt -AsSecureString
    $env:AULIGMA_EXISTING_APP_PASSWORD = ConvertFrom-PrivateSecureString $appSecure
    $output = @(& node.exe '.\scripts\provision-postgres.mjs' 2>&1 | ForEach-Object { $_.ToString() })
  }
  if ($LASTEXITCODE -ne 0) {
    $failure = ($output -join '') | ConvertFrom-Json
    throw "Etapa: $($failure.stage). Código: $($failure.code). $($failure.description)"
  }
  $result = ($output -join '') | ConvertFrom-Json
  Write-Host "Rol: $($result.role). Base de desarrollo: $($result.database). Base de pruebas: $($result.testDatabase). Conexión: $($result.connection). Configuración privada: $($result.env)." -ForegroundColor Green
  Write-Host ("AULIGMA {0} POSTGRESQL CONFIGURADO" -f $dash) -ForegroundColor Green
  Write-Host 'Puedes cerrar esta ventana. AULIGMA continuará con las migraciones.'
  Read-Host 'Presiona Enter para cerrar'
} catch {
  Write-Host 'No se completó el aprovisionamiento:' -ForegroundColor Red
  Write-Host $_.Exception.Message
  Read-Host 'Presiona Enter para cerrar'
  exit 1
} finally {
  Remove-Item Env:AULIGMA_PG_ADMIN_PASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:AULIGMA_EXISTING_APP_PASSWORD -ErrorAction SilentlyContinue
}
