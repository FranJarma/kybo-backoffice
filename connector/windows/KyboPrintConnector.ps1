param([switch]$LibraryOnly)
$ErrorActionPreference = 'Stop'
function Open-KyboWorkerLock($directory) {
    return New-Object IO.FileStream((Join-Path $directory 'worker.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
}
function Get-KyboJournalPath($id) {
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $hash = [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes([string]$id))).Replace('-','').ToLowerInvariant() } finally { $sha.Dispose() }
    Join-Path $script:JournalDirectory ($hash + '.json')
}
function Save-KyboJournal($record) {
    $path = Get-KyboJournalPath $record.id
    $temp = $path + '.' + [guid]::NewGuid().ToString('N') + '.tmp'
    $bytes = [Text.Encoding]::UTF8.GetBytes(($record | ConvertTo-Json -Depth 30 -Compress))
    $stream = New-Object IO.FileStream($temp,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try { $stream.Write($bytes,0,$bytes.Length); $stream.Flush($true) } finally { $stream.Dispose() }
    if ([IO.File]::Exists($path)) { [IO.File]::Replace($temp,$path,($path + '.bak')); [IO.File]::Delete(($path + '.bak')) } else { [IO.File]::Move($temp,$path) }
}
function Read-KyboJournal($id) {
    $path = Get-KyboJournalPath $id
    if (Test-Path -LiteralPath $path) { return Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json }
    return $null
}
function Send-KyboReport($record) {
    $body = @{action='report';instanceId=$script:InstanceId;jobId=$record.id;leaseToken=$record.leaseToken;outcome=$record.outcome}
    if ($null -ne $record.spoolJobId) { $body.spoolJobId = [int]$record.spoolJobId }
    if ($record.error) { $body.error = [string]$record.error }
    $null = Invoke-KyboApi $body
    $record.acknowledged = $true
    Save-KyboJournal $record
}
function Invoke-KyboJob($job) {
    $record = Read-KyboJournal $job.id
    if ($record) {
        if (-not $record.outcome) { $record.outcome = 'uncertain'; $record.error = 'El proceso se interrumpió durante el envío.'; Save-KyboJournal $record }
        if (-not $record.acknowledged) { Send-KyboReport $record }
        return
    }
    $begin = Invoke-KyboApi @{action='begin';instanceId=$script:InstanceId;jobId=$job.id;leaseToken=$job.leaseToken}
    if (-not $begin.dispatch) { return }
    $record = [pscustomobject]@{id=$job.id;leaseToken=$job.leaseToken;documentName=$job.documentName;outcome=$null;spoolJobId=$null;error=$null;acknowledged=$false}
    Save-KyboJournal $record
    try {
        $record.spoolJobId = Submit-KyboDocument $job
        $record.outcome = 'sent'
    } catch {
        $record.outcome = 'uncertain'
        $record.error = 'No se pudo confirmar la aceptación en la cola de Windows.'
    }
    Save-KyboJournal $record
    Send-KyboReport $record
}
function Invoke-KyboApi($body) {
    $headers = @{Authorization = 'Bearer ' + $script:Token}
    Invoke-RestMethod -Uri ($script:ServerUrl.TrimEnd('/') + '/api/printing/connector') -Method Post -Headers $headers -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes(($body | ConvertTo-Json -Depth 30 -Compress))) -TimeoutSec 20 -MaximumRedirection 0
}
function Submit-KyboDocument($job) {
    if ($job.printerName -ne $script:PrinterName) { throw 'Printer mismatch' }
    $json = $job.document | ConvertTo-Json -Depth 30 -Compress
    $bytes = [Kybo.Print.Native]::Render($json, $script:LogoPath, $script:WidthDots)
    [Kybo.Print.Native]::Submit($script:PrinterName,[string]$job.documentName,$bytes)
}
function Sync-KyboReports {
    foreach ($file in Get-ChildItem -LiteralPath $script:JournalDirectory -Filter '*.json') {
        $record = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
        if (-not $record.outcome) { $record.outcome='uncertain'; $record.error='El proceso se interrumpió durante el envío.'; Save-KyboJournal $record }
        if (-not $record.acknowledged) { Send-KyboReport $record }
    }
}
if ($LibraryOnly) { return }
$base = $PSScriptRoot
$config = Get-Content -LiteralPath (Join-Path $base 'config.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$uri = [uri]$config.serverUrl
if ($uri.Scheme -ne 'https' -and -not ($uri.Scheme -eq 'http' -and $uri.IsLoopback)) { throw 'HTTPS obligatorio' }
$script:ServerUrl = $uri.AbsoluteUri.TrimEnd('/')
$script:PrinterName = [string]$config.printerName
$script:WidthDots = [int]$config.widthDots
if ($script:WidthDots -notin @(384,512,576)) { throw 'Ancho no admitido' }
$script:InstanceId = [string]$config.instanceId
$script:JournalDirectory = Join-Path $base 'journal'
$script:LogoPath = Join-Path $base 'assets\kybo-logo.png'
New-Item -ItemType Directory -Force $script:JournalDirectory | Out-Null
Add-Type -AssemblyName System.Security
$protected = [IO.File]::ReadAllBytes((Join-Path $base 'credential.bin'))
$script:Token = [Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect($protected,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Web.Extensions
Add-Type -Path (Join-Path $base 'KyboPrintNative.cs') -ReferencedAssemblies System.Drawing,System.Web.Extensions
$lock = $null
try {
    try { $lock = Open-KyboWorkerLock $script:JournalDirectory } catch [IO.IOException] { return }
    while ($true) {
        try {
            Sync-KyboReports
            $status = [Kybo.Print.Native]::Status($script:PrinterName)
            $heartbeat = Invoke-KyboApi @{action='heartbeat';instanceId=$script:InstanceId;printerStatus=$status}
            foreach ($item in $heartbeat.reconcile) {
                $presence = [Kybo.Print.Native]::Presence($script:PrinterName,[string]$item.documentName,$item.spoolJobId)
                $body = @{action='reconcile';instanceId=$script:InstanceId;jobId=$item.id;leaseToken=$item.leaseToken;outcome=$presence}
                if ($null -ne $item.spoolJobId) { $body.spoolJobId=[int]$item.spoolJobId }
                $null = Invoke-KyboApi $body
            }
            $claim = Invoke-KyboApi @{action='claim';instanceId=$script:InstanceId}
            if ($claim.job) { Invoke-KyboJob $claim.job } else { Start-Sleep -Seconds 3 }
        } catch { Start-Sleep -Seconds 10 }
    }
} finally { if ($lock) { $lock.Dispose() } }
