$ErrorActionPreference='Stop'
$workspace=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$testRun=[IO.Path]::GetFullPath((Join-Path $workspace '.local/manual-day/20261105-120000-abcdef12'))
$created=[datetime]'2026-11-05T12:00:00Z'
$global:ManualDayMockProcesses=@(
  [pscustomobject]@{ ProcessId=41010; ParentProcessId=1; CreationDate=$created; CommandLine="node scripts/manual-day/serve.ts $testRun" },
  [pscustomobject]@{ ProcessId=41011; ParentProcessId=41010; CreationDate=$created.AddSeconds(1); CommandLine='node next dev' },
  [pscustomobject]@{ ProcessId=41012; ParentProcessId=41011; CreationDate=$created.AddSeconds(2); CommandLine='node next server' },
  # This belonged to an earlier process that used the same PID as our wrapper.
  [pscustomobject]@{ ProcessId=51001; ParentProcessId=41010; CreationDate=$created.AddDays(-1); CommandLine='unrelated application' }
)
$global:ManualDayMockStopped=[Collections.Generic.List[int]]::new()
function Get-Content {
  param([string]$LiteralPath,[switch]$Raw)
  if ($LiteralPath -eq "$testRun/manual-day.json") { return '{"kind":"kybo-manual-day","runId":"20261105-120000-abcdef12"}' }
  if ($LiteralPath -eq "$testRun/processes.json") { return '{"runId":"20261105-120000-abcdef12","wrapper":41010}' }
  throw 'Unexpected read in isolated process-ownership test.'
}
function Get-CimInstance {
  param([string]$ClassName,[string]$Filter)
  if ($Filter -match 'ProcessId\s*=\s*(\d+)') {
    $wanted=[int]$Matches[1]
    if ($wanted -eq 41011 -and $global:ManualDayMockReuse -eq 'cim') {
      return [pscustomobject]@{ ProcessId=41011; ParentProcessId=41010; CreationDate=$created.AddMinutes(1); CommandLine='unrelated reused PID' }
    }
    return $global:ManualDayMockProcesses | Where-Object { $_.ProcessId -eq $wanted }
  }
  return $global:ManualDayMockProcesses
}
function Get-Process {
  param([int]$Id,[string]$ErrorAction)
  $candidate=$global:ManualDayMockProcesses | Where-Object ProcessId -eq $Id
  $started=$candidate.CreationDate
  if ($Id -eq 41011 -and $global:ManualDayMockReuse -eq 'handle') { $started=$started.AddMinutes(1) }
  return [pscustomobject]@{ Id=$Id; StartTime=$started; Handle=[IntPtr]::Zero }
}
function Stop-Process {
  param([int]$Id,[object]$InputObject,[string]$ErrorAction)
  $global:ManualDayMockStopped.Add($(if ($InputObject) { $InputObject.Id } else { $Id }))
}
# All process APIs above are mocks. No actual process can be terminated by this test.
& "$workspace/scripts/manual-day/stop.ps1" -RunDirectory $testRun | Out-Null
if ($global:ManualDayMockStopped.Contains(51001)) { throw 'An older unrelated process was incorrectly selected through a reused parent PID.' }
if (($global:ManualDayMockStopped -join ',') -ne '41010,41011,41012') { throw "The owned process tree was not selected correctly: $($global:ManualDayMockStopped -join ',')." }
Write-Output 'PASS · only the current owned process tree is stopped; recycled parent PID is excluded.'
foreach ($reuse in @('cim','handle')) {
  $global:ManualDayMockReuse=$reuse
  $global:ManualDayMockStopped.Clear()
  & "$workspace/scripts/manual-day/stop.ps1" -RunDirectory $testRun | Out-Null
  if (($global:ManualDayMockStopped -join ',') -ne '41010,41012') { throw "PID identity was not revalidated at $reuse." }
}
Write-Output 'PASS · a PID recycled after enumeration or before obtaining the handle is never stopped.'
