$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\KyboPrintConnector.ps1') -LibraryOnly
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Web.Extensions
Add-Type -Path (Join-Path $PSScriptRoot '..\KyboPrintNative.cs') -ReferencedAssemblies System.Drawing,System.Web.Extensions
if ([Kybo.Print.Native]::PresenceFromEntries(@('Kybo original'),@(99),'Kybo original',42,$true) -ne 'present') { throw 'changed ID must remain present' }
if ([Kybo.Print.Native]::PresenceFromEntries(@('Other'),@(42),'Kybo original',42,$true) -ne 'unknown') { throw 'recycled ID must be unknown' }
if ([Kybo.Print.Native]::PresenceFromEntries(@(),@(),'Kybo original',42,$true) -ne 'removed') { throw 'empty queue must be removed' }
if ([Kybo.Print.Native]::PresenceFromEntries(@(),@(),'Kybo original',42,$false) -ne 'unknown') { throw 'failed enumeration must be unknown' }
$dir=Join-Path $PSScriptRoot ('lock-test-'+[guid]::NewGuid())
New-Item -ItemType Directory $dir | Out-Null
try {
 $lock=Open-KyboWorkerLock $dir
 $child=Join-Path $dir 'child.ps1'
 $library=(Resolve-Path (Join-Path $PSScriptRoot '..\KyboPrintConnector.ps1')).Path
 $source='param($library,$dir)' + "`n" + '. $library -LibraryOnly' + "`n" + 'try { $lock=Open-KyboWorkerLock $dir; $lock.Dispose(); exit 2 } catch [System.IO.IOException] { exit 0 }'
 [IO.File]::WriteAllText($child,$source,[Text.Encoding]::UTF8)
 $p=Start-Process powershell.exe -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+$child+'"'),('"'+$library+'"'),('"'+$dir+'"')) -WindowStyle Hidden -Wait -PassThru
 if($p.ExitCode -ne 0) { throw "second process acquired lock: $($p.ExitCode)" }
 $lock.Dispose(); $lock=Open-KyboWorkerLock $dir; $lock.Dispose()
} finally { if($lock){$lock.Dispose()}; Remove-Item -LiteralPath $dir -Recurse -Force }
'PASS queue reconciliation and two-process lock'
