$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '..\KyboPrintConnector.ps1') -LibraryOnly
$ready=Join-Path $PSScriptRoot ('port-'+[guid]::NewGuid())
$fixture=Join-Path $PSScriptRoot 'HttpFixture.ps1'
$proc=Start-Process powershell.exe -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+$fixture+'"'),('"'+$ready+'"')) -WindowStyle Hidden -PassThru
try {
 for($i=0;$i -lt 100 -and -not (Test-Path $ready);$i++){ Start-Sleep -Milliseconds 50 }
 if(-not (Test-Path $ready)){throw 'loopback fixture did not start'}
 $port=Get-Content $ready -Raw; $origin='http://127.0.0.1:'+ $port
 $pair=Invoke-RestMethod -Uri ($origin+'/api/printing/connector') -Method Post -ContentType 'application/json; charset=utf-8' -Body '{"action":"pair"}' -TimeoutSec 5 -MaximumRedirection 0
 $script:ServerUrl=$origin; $script:Token='fake'; $claim=Invoke-KyboApi @{action='claim';instanceId='fake'}
 $expected='Caf'+[char]0x00e9+' '+[char]0x00f1
 if($pair.printerName -cne $expected -or $claim.job.document.lines[0].text -cne $expected){throw 'UTF-8 response decoding failed'}
 'PASS HTTP 5.1 UTF-8 pair and ticket'
} finally { if(-not $proc.HasExited){Stop-Process -Id $proc.Id}; if(Test-Path $ready){Remove-Item $ready} }
