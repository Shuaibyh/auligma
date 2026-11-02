[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

Write-Host ''
Write-Host 'AULIGMA — CONFIGURACIÓN GOOGLE OAUTH' -ForegroundColor Cyan
Write-Host 'Los valores se guardarán únicamente en .env. El secreto no se mostrará.'
Write-Host ''

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$envPath = Join-Path $projectRoot '.env'

if (-not (Test-Path -LiteralPath $envPath -PathType Leaf)) {
  throw 'No existe .env. Configura primero el entorno privado de AULIGMA.'
}

$ignoreResult = & git -C $projectRoot check-ignore --quiet -- .env
if ($LASTEXITCODE -ne 0) {
  throw '.env no está excluido de Git. No se escribirán credenciales.'
}

$clientId = (Read-Host 'Google Client ID').Trim()
if ($clientId -notmatch '^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$') {
  throw 'El Client ID no tiene el formato esperado de una aplicación web de Google.'
}

$secureSecret = Read-Host 'Nuevo Google Client Secret' -AsSecureString
$secretPointer = [IntPtr]::Zero
$clientSecret = $null

try {
  $secretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureSecret)
  $clientSecret = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPointer)
  if ([string]::IsNullOrWhiteSpace($clientSecret) -or $clientSecret.Contains("`r") -or $clientSecret.Contains("`n")) {
    throw 'El Client Secret está vacío o contiene caracteres no válidos.'
  }

  $pilotEmail = (Read-Host 'Correo del docente piloto (opcional; Enter para omitir)').Trim().ToLowerInvariant()
  if ($pilotEmail -and $pilotEmail -notmatch '^[^\s@]+@[^\s@]+\.[^\s@]+$') {
    throw 'El correo del docente piloto no tiene un formato válido.'
  }

  $lines = [System.Collections.Generic.List[string]]::new()
  foreach ($line in [System.IO.File]::ReadAllLines($envPath)) {
    [void]$lines.Add($line)
  }

  function Set-PrivateEnvironmentValue {
    param(
      [Parameter(Mandatory)][string]$Name,
      [AllowEmptyString()][string]$Value
    )
    if ($Value.Contains("`r") -or $Value.Contains("`n")) {
      throw "El valor de $Name contiene un salto de línea no permitido."
    }
    $replacement = "$Name=$Value"
    for ($index = 0; $index -lt $lines.Count; $index++) {
      if ($lines[$index] -match "^$([regex]::Escape($Name))=") {
        $lines[$index] = $replacement
        return
      }
    }
    [void]$lines.Add($replacement)
  }

  Set-PrivateEnvironmentValue -Name 'GOOGLE_CLIENT_ID' -Value $clientId
  Set-PrivateEnvironmentValue -Name 'GOOGLE_CLIENT_SECRET' -Value $clientSecret
  if ($pilotEmail) {
    Set-PrivateEnvironmentValue -Name 'ENABLE_PILOT_TEACHERS' -Value 'true'
    Set-PrivateEnvironmentValue -Name 'PILOT_TEACHER_EMAILS' -Value $pilotEmail
  }

  [System.IO.File]::WriteAllLines($envPath, $lines, [System.Text.UTF8Encoding]::new($false))
  Write-Host ''
  Write-Host 'Configuración privada actualizada.' -ForegroundColor Green
  Write-Host 'No se mostraron ni registraron las credenciales.'
  if (-not $pilotEmail) {
    Write-Host 'El docente piloto no fue habilitado; podrá configurarse después.' -ForegroundColor Yellow
  }
}
finally {
  if ($secretPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPointer)
  }
  $clientSecret = $null
  $secureSecret = $null
}

Write-Host ''
Read-Host 'Presiona Enter para cerrar'
