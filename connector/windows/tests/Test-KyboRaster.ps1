$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Web.Extensions
Add-Type -Path (Join-Path $PSScriptRoot '..\KyboPrintNative.cs') -ReferencedAssemblies System.Drawing,System.Web.Extensions
$logo=(Resolve-Path (Join-Path $PSScriptRoot '..\assets\kybo-logo.png')).Path
function Render($width,$lines,$hasLogo) {
 $json=@{version=1;widthDots=576;logo=$hasLogo;lines=$lines} | ConvertTo-Json -Depth 5 -Compress
 return ,([Kybo.Print.Native]::Render($json,$logo,$width))
}
function Inspect($bytes) {
 $segments=@(); $offset=2
 while($offset -lt $bytes.Length-6) {
  if($bytes[$offset] -ne 29 -or $bytes[$offset+1] -ne 118 -or $bytes[$offset+2] -ne 48){throw 'invalid raster framing'}
  $rowBytes=[int]$bytes[$offset+4]+256*[int]$bytes[$offset+5]; $height=[int]$bytes[$offset+6]+256*[int]$bytes[$offset+7]
  $length=$rowBytes*$height; $black=0; for($i=$offset+8;$i -lt $offset+8+$length;$i++){if($bytes[$i] -ne 0){$black++}}
  $segments += [pscustomobject]@{height=$height;black=$black;rowBytes=$rowBytes}
  $offset+=8+$length
 }
 if($offset -ne $bytes.Length-6){throw 'truncated raster'}
 return ,$segments
}
$accent='caf'+[char]0x00e9+' '+[char]0x00f1
$long=($accent+' instrucciones adicionales ') * 35
foreach($width in @(384,512,576)) {
 $lines=@(@{text=$accent;style='bold'},@{text=$long;style='normal'},@{text='ULTIMA LINEA';style='heading'})
 $bytes=Render $width $lines $true; $parts=Inspect $bytes
 if($parts.Count -lt 4 -or $parts[0].black -le 0 -or $parts[1].black -le 0 -or $parts[-1].black -le 0 -or (($parts | Measure-Object -Property height -Sum).Sum) -le 300 -or $parts[0].rowBytes -ne $width/8) { throw "content or wrapping missing at width $width" }
 $plain=Render $width @(@{text='cafe n';style='bold'}) $false
 $unicode=Render $width @(@{text=$accent;style='bold'}) $false
 if([Convert]::ToBase64String($plain) -eq [Convert]::ToBase64String($unicode)) { throw 'Unicode accents absent' }
 $control=Render $width @(@{text=($accent+[char]27+'@');style='bold'}) $false
 $clean=Render $width @(@{text=($accent+'@');style='bold'}) $false
 if([Convert]::ToBase64String($control) -ne [Convert]::ToBase64String($clean)) { throw 'ESC was not removed from text' }
}
'PASS raster 384/512/576 logo, Unicode, escaped control, long note and final line'
