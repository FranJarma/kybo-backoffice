$ErrorActionPreference = 'Stop'
$EmbeddedFiles = @{}
# KYBO_PAYLOAD_RECORDS
$target = Join-Path $env:LOCALAPPDATA 'KyboPrintConnector'
if (Test-Path -LiteralPath (Join-Path $target 'credential.bin')) { throw 'Ya existe una instalación. Revóquela y desinstálela antes de emparejar otra.' }
$server = Read-Host 'URL de Kybo (https://...)'
$uri = $null
if (-not [uri]::TryCreate($server,[UriKind]::Absolute,[ref]$uri) -or ($uri.Scheme -ne 'https' -and -not ($uri.Scheme -eq 'http' -and $uri.IsLoopback)) -or $uri.UserInfo -or $uri.Query -or $uri.Fragment -or $uri.AbsolutePath -ne '/') { throw 'Ingrese una URL de origen HTTPS válida.' }
$queues = @(Get-CimInstance Win32_Printer | Sort-Object Name)
if (-not $queues.Count) { throw 'No se encontraron colas de impresora instaladas.' }
for ($i=0; $i -lt $queues.Count; $i++) { Write-Host (('{0}. {1}' -f ($i+1),$queues[$i].Name)) }
$choice = 0
if (-not [int]::TryParse((Read-Host 'Número de la cola USB instalada'),[ref]$choice) -or $choice -lt 1 -or $choice -gt $queues.Count) { throw 'Selección inválida.' }
$printer = [string]$queues[$choice-1].Name
$width = 0
if (-not [int]::TryParse((Read-Host 'Ancho en puntos: 384, 512 o 576'),[ref]$width) -or $width -notin @(384,512,576)) { throw 'Ancho inválido.' }
$secureCode = Read-Host 'Código de emparejamiento' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureCode)
try { $code = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
if ([string]::IsNullOrWhiteSpace($code)) { throw 'Código vacío.' }
$files = @('KyboPrintConnector.ps1','KyboPrintNative.cs','assets/kybo-logo.png')
New-Item -ItemType Directory -Force $target | Out-Null
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().User
$acl = New-Object Security.AccessControl.DirectorySecurity
$acl.SetOwner($identity)
$acl.SetAccessRuleProtection($true,$false)
$rule = New-Object Security.AccessControl.FileSystemAccessRule($identity,'FullControl','ContainerInherit, ObjectInherit','None','Allow')
$acl.AddAccessRule($rule)
Set-Acl -LiteralPath $target -AclObject $acl
foreach ($relative in $files) {
    $destination = Join-Path $target ($relative.Replace('/','\'))
    New-Item -ItemType Directory -Force (Split-Path $destination) | Out-Null
    if ($EmbeddedFiles.ContainsKey($relative)) { [IO.File]::WriteAllBytes($destination,[Convert]::FromBase64String($EmbeddedFiles[$relative])) }
    else { $source = Join-Path $PSScriptRoot ($relative.Replace('/','\')); if (-not (Test-Path -LiteralPath $source)) { throw "Falta archivo: $relative" }; Copy-Item -LiteralPath $source -Destination $destination }
}
$body = @{action='pair';code=$code;printerName=$printer} | ConvertTo-Json -Compress
try { $pair = Invoke-RestMethod -Uri ($uri.AbsoluteUri.TrimEnd('/') + '/api/printing/connector') -Method Post -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body)) -TimeoutSec 20 -MaximumRedirection 0 } finally { $code=$null; $body=$null }
if (-not $pair.token -or -not $pair.connectorId -or $pair.printerName -ne $printer) { throw 'Respuesta de emparejamiento inválida.' }
Add-Type -AssemblyName System.Security
$protected = [Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes([string]$pair.token),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
[IO.File]::WriteAllBytes((Join-Path $target 'credential.bin'),$protected)
$config = @{serverUrl=$uri.AbsoluteUri.TrimEnd('/');printerName=$printer;widthDots=$width;connectorId=$pair.connectorId;instanceId=[guid]::NewGuid().ToString()}
[IO.File]::WriteAllText((Join-Path $target 'config.json'),($config | ConvertTo-Json),[Text.Encoding]::UTF8)
$worker = Join-Path $target 'KyboPrintConnector.ps1'
$action = New-ScheduledTaskAction -Execute (Join-Path $PSHOME 'powershell.exe') -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $worker + '"')
$trigger = New-ScheduledTaskTrigger -AtLogOn -User ([Security.Principal.WindowsIdentity]::GetCurrent().Name)
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Seconds 0) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName 'KyboPrintConnector' -Action $action -Trigger $trigger -Settings $settings -User ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -Force | Out-Null
Write-Host 'Conector instalado. Inicie sesión nuevamente para activarlo; no se imprimió ninguna prueba.'
