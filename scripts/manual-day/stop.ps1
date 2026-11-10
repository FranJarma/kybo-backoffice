param([string]$RunDirectory)
$ErrorActionPreference='Stop'
$workspace=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
if (-not $RunDirectory) { $RunDirectory=(Get-Content -LiteralPath "$workspace/.local/manual-day/latest.json" -Raw | ConvertFrom-Json).root }
$RunDirectory=[IO.Path]::GetFullPath($RunDirectory)
$allowed=[IO.Path]::GetFullPath("$workspace/.local/manual-day")+[IO.Path]::DirectorySeparatorChar
if (-not $RunDirectory.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase)) { throw 'Carpeta ajena al ensayo.' }
$run=Get-Content -LiteralPath "$RunDirectory/manual-day.json" -Raw | ConvertFrom-Json
$state=Get-Content -LiteralPath "$RunDirectory/processes.json" -Raw | ConvertFrom-Json
if ($run.kind -ne 'kybo-manual-day' -or $state.runId -ne $run.runId) { throw 'El proceso no pertenece al ensayo.' }
$all=@(Get-CimInstance Win32_Process)
$owner=$all | Where-Object { $_.ProcessId -eq [int]$state.wrapper }
if (-not $owner) { Write-Output 'El proceso de este ensayo ya no está activo. Se conservan sus datos.'; exit 0 }
if ($owner.CommandLine.IndexOf($RunDirectory,[StringComparison]::OrdinalIgnoreCase) -lt 0 -or $owner.CommandLine -notmatch 'manual-day[/\\]serve\.ts') { throw 'No se puede confirmar la identidad del proceso; no se detiene.' }
$owned=[Collections.Generic.List[object]]::new()
$seen=[Collections.Generic.HashSet[int]]::new()
$owned.Add($owner)
$null=$seen.Add([int]$owner.ProcessId)
for ($i=0; $i -lt $owned.Count; $i++) {
  $parent=$owned[$i]
  foreach ($child in @($all | Where-Object { $_.ParentProcessId -eq $parent.ProcessId })) {
    # ParentProcessId can refer to an older, terminated process whose PID was reused.
    if ($child.CreationDate -is [datetime] -and $parent.CreationDate -is [datetime] -and $child.CreationDate -ge $parent.CreationDate -and $seen.Add([int]$child.ProcessId)) { $owned.Add($child) }
  }
}
foreach ($candidate in $owned) {
  $live=Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$candidate.ProcessId)"
  if (-not $live -or $live.CreationDate -ne $candidate.CreationDate -or $live.ParentProcessId -ne $candidate.ParentProcessId) { continue }
  $target=Get-Process -Id ([int]$candidate.ProcessId) -ErrorAction SilentlyContinue
  if (-not $target) { continue }
  # Pin the process handle, then compare its birth time before passing the object to Stop-Process.
  $null=$target.Handle
  if ([math]::Abs(($target.StartTime.ToUniversalTime()-$candidate.CreationDate.ToUniversalTime()).Ticks) -gt 10000) { continue }
  Stop-Process -InputObject $target -ErrorAction SilentlyContinue
}
Write-Output 'Ensayo detenido. Base, fotos y registros conservados. No se tocó la app real.'
