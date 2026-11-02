param([string]$readyFile)
$listener=New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback,0)
$listener.Start()
[IO.File]::WriteAllText($readyFile,[string]$listener.LocalEndpoint.Port)
try {
 for($i=0;$i -lt 2;$i++) {
  $client=$listener.AcceptTcpClient(); $stream=$client.GetStream()
  $reader=New-Object IO.StreamReader($stream,[Text.Encoding]::ASCII,$false,1024,$true)
  $first=$reader.ReadLine(); $length=0
  do { $line=$reader.ReadLine(); if($line -match '^Content-Length:\s*(\d+)') { $length=[int]$Matches[1] } } while($line)
  if($length -gt 0) { $chars=New-Object char[] $length; $n=0; while($n -lt $length) { $n += $reader.Read($chars,$n,$length-$n) } }
  $accent=[string][char]0x00e9; $enye=[string][char]0x00f1
  $json = if($i -eq 0) { '{"connectorId":"1","token":"fake","printerName":"Caf'+$accent+' '+$enye+'"}' } else { '{"job":{"document":{"lines":[{"text":"Caf'+$accent+' '+$enye+'"}]}}}' }
  $body=[Text.Encoding]::UTF8.GetBytes($json)
  $header=[Text.Encoding]::ASCII.GetBytes("HTTP/1.1 200 OK`r`nContent-Type: application/json; charset=utf-8`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n")
  $stream.Write($header,0,$header.Length); $stream.Write($body,0,$body.Length); $stream.Flush(); $client.Close()
 }
} finally { $listener.Stop() }
