param([ValidateRange(3100,3199)][int]$Port=3100)
$ErrorActionPreference='Stop'
$listener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,$Port)
try { $listener.Start() } catch { throw "El puerto $Port ya está ocupado. Elegí otro entre 3100 y 3199; no se modifica el ensayo activo." } finally { $listener.Stop() }
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$revision = git -C $workspace rev-parse HEAD
if ($LASTEXITCODE -ne 0) { throw 'No se pudo identificar la versión a probar.' }
$runId = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0,8)
$run = Join-Path $workspace ".local/manual-day/$runId"
$app = Join-Path $run 'app'
New-Item -ItemType Directory -Path $run | Out-Null
git -C $workspace archive --format=zip --output="$run/source.zip" $revision
if ($LASTEXITCODE -ne 0) { throw 'No se pudo copiar la versión publicada.' }
Expand-Archive -LiteralPath "$run/source.zip" -DestinationPath $app
New-Item -ItemType Junction -Path "$app/node_modules" -Target "$workspace/node_modules" | Out-Null
Copy-Item -LiteralPath $PSScriptRoot -Destination "$app/scripts/manual-day" -Recurse
Push-Location $workspace
try {
  node --import tsx scripts/manual-day/prepare.ts $run $Port $revision
  if ($LASTEXITCODE -ne 0) { throw "La preparación falló. Se conserva el ensayo para diagnóstico: $run" }
} finally { Pop-Location }
Write-Output "Ensayo preparado en $run"
