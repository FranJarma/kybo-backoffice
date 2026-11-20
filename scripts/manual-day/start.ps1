param([string]$RunDirectory)
$ErrorActionPreference='Stop'
$workspace=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
if (-not $RunDirectory) { $RunDirectory=(Get-Content -LiteralPath "$workspace/.local/manual-day/latest.json" -Raw | ConvertFrom-Json).root }
$RunDirectory=[IO.Path]::GetFullPath($RunDirectory)
$allowed=[IO.Path]::GetFullPath("$workspace/.local/manual-day")+[IO.Path]::DirectorySeparatorChar
if (-not $RunDirectory.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase)) { throw 'La carpeta no pertenece a los ensayos de este proyecto.' }
$run=Get-Content -LiteralPath "$RunDirectory/manual-day.json" -Raw | ConvertFrom-Json
$origin=[Uri]$run.origin
if ($run.kind -ne 'kybo-manual-day' -or $origin.Host -ne '127.0.0.1' -or $origin.Port -lt 3100 -or $origin.Port -gt 3199) { throw 'Ensayo inválido.' }
$listener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,$origin.Port)
try { $listener.Start() } catch { throw 'El puerto ya está en uso. No se modifica el proceso existente.' } finally { $listener.Stop() }
$node=(Get-Command node -CommandType Application | Select-Object -First 1).Source
$process=Start-Process -FilePath $node -ArgumentList @('--import','tsx','scripts/manual-day/serve.ts',('"'+$RunDirectory+'"')) -WorkingDirectory "$RunDirectory/app" -WindowStyle Hidden -RedirectStandardOutput "$RunDirectory/server.stdout.log" -RedirectStandardError "$RunDirectory/server.stderr.log" -PassThru
Write-Output "Iniciando $($run.origin) · proceso $($process.Id). Accesos: $RunDirectory/ACCESOS.md"
