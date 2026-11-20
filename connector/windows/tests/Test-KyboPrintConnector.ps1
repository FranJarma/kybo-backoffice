$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\KyboPrintConnector.ps1') -LibraryOnly
$dir = Join-Path $PSScriptRoot ('kybo-test-' + [guid]::NewGuid())
New-Item -ItemType Directory $dir | Out-Null
try {
  $script:reports = @(); $script:submits = 0
  $script:dispatch = $true; $script:failSubmit = $false; $script:loseAck = $false
  function Invoke-KyboApi($body) {
    if ($body.action -eq 'begin') { return @{ dispatch = $script:dispatch } }
    if ($body.action -eq 'report') { $script:reports += $body; if ($script:loseAck) { $script:loseAck = $false; throw 'response lost after acceptance' }; return @{ok=$true} }
    throw 'unexpected API call'
  }
  function Submit-KyboDocument($job) { $script:submits++; if ($script:failSubmit) { throw 'fake spool failure' }; return 42 }
  $script:JournalDirectory = $dir
  $job = @{id='abc';leaseToken='lease';documentName='Kybo abc';document=@{version=1;widthDots=576;logo=$true;lines=@(@{text='café ñ';style='normal'})}}
  Invoke-KyboJob $job
  if ($script:submits -ne 1 -or $script:reports[-1].outcome -ne 'sent') { throw 'first submission failed' }
  Invoke-KyboJob $job
  if ($script:submits -ne 1) { throw 'duplicate claim submitted twice' }
  $job.id='cancel'; $script:dispatch=$false; Invoke-KyboJob $job
  if ($script:submits -ne 1) { throw 'cancelled begin submitted' }
  $job.id='failure'; $script:dispatch=$true; $script:failSubmit=$true; Invoke-KyboJob $job
  if ($script:reports[-1].outcome -ne 'uncertain') { throw 'spool failure must be uncertain' }
  $job.id='crash'; $script:failSubmit=$false
  Save-KyboJournal ([pscustomobject]@{id='crash';leaseToken='lease';documentName='Kybo crash';outcome=$null;spoolJobId=$null;error=$null;acknowledged=$false})
  Invoke-KyboJob $job
  if ($script:submits -ne 2 -or $script:reports[-1].outcome -ne 'uncertain') { throw 'interrupted spool was retried' }
  $job.id='lost-ack'; $script:loseAck=$true
  try { Invoke-KyboJob $job; throw 'expected transport failure' } catch { if($_.Exception.Message -ne 'response lost after acceptance') { throw } }
  $sentBeforeRetry=$script:submits; $accepted=$script:reports[-1]
  Invoke-KyboJob $job
  if ($script:submits -ne $sentBeforeRetry -or $script:reports[-1].outcome -ne 'sent' -or $accepted.spoolJobId -ne $script:reports[-1].spoolJobId) { throw 'actual lost ACK retried spool or changed report' }
  $job.id='after-spool'; Save-KyboJournal ([pscustomobject]@{id='after-spool';leaseToken='lease';documentName='Kybo after';outcome='sent';spoolJobId=17;error=$null;acknowledged=$false})
  $beforeRecovery=$script:submits; Invoke-KyboJob $job
  if ($script:submits -ne $beforeRecovery -or $script:reports[-1].spoolJobId -ne 17) { throw 'post-spool recovery failed' }
  $record=Read-KyboJournal 'abc'; $record.acknowledged=$false; Save-KyboJournal $record
  Invoke-KyboJob $job
  Sync-KyboReports
  if ($script:submits -ne 3 -or $script:reports[-1].outcome -ne 'sent' -or $script:reports[-1].spoolJobId -ne 42) { throw 'lost ACK recovery failed' }
  Add-Type -AssemblyName System.Drawing
  Add-Type -AssemblyName System.Web.Extensions
  Add-Type -Path (Join-Path $PSScriptRoot '..\KyboPrintNative.cs') -ReferencedAssemblies System.Drawing,System.Web.Extensions
  $document=@{version=1;widthDots=576;logo=$true;lines=@(@{text=('caf'+[char]0x00e9+' '+[char]0x00f1+[char]27+'@');style='bold'})} | ConvertTo-Json -Depth 5 -Compress
  $bytes=[Kybo.Print.Native]::Render($document,(Join-Path $PSScriptRoot '..\assets\kybo-logo.png'),576)
  if ($bytes.Length -lt 100 -or $bytes[0] -ne 27 -or $bytes[1] -ne 64 -or $bytes[$bytes.Length-2] -ne 86) { throw 'Unicode render failed' }
  'PASS journal, duplicate claim, cancelled begin, spool failure, crash recovery, lost ACK, Unicode raster'
} finally { Remove-Item -LiteralPath $dir -Recurse -Force }
