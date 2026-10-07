# Headless screenshot of an autotest scene.
#   powershell -File tools\shot.ps1 -Test floor -Out shots\floor.png [-Query "floor=2"] [-Size 1600,900]
# The autotest drives the sim with BD.debug.step and renders directly, then copies the canvas into an <img>.
param(
  [string]$Test = 'floor',
  [string]$Out = '',
  [string]$Query = '',
  [string]$Size = '1600,900'
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not $Out) { $Out = Join-Path $root ('shots\' + $Test + '.png') }
if (-not [System.IO.Path]::IsPathRooted($Out)) { $Out = Join-Path $root $Out }
New-Item -ItemType Directory -Force (Split-Path $Out) | Out-Null

$browser = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $browser)) { $browser = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$profile = Join-Path $env:TEMP ('bdshot_' + [guid]::NewGuid().ToString('N'))
$url = 'file:///' + ($root.Replace('\', '/')) + '/index.html?debug=1&autotest=' + $Test
if ($Query) { $url = $url + '&' + $Query }

Remove-Item $Out -Force -ErrorAction SilentlyContinue
try {
  # a fresh --user-data-dir is required or no file is written
  & $browser --headless=new --disable-gpu --hide-scrollbars --user-data-dir="$profile" --window-size=$Size `
    --virtual-time-budget=5000 --screenshot="$Out" "$url" | Out-Null
  $deadline = (Get-Date).AddSeconds(20)
  while (-not (Test-Path $Out) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 250 }
  Start-Sleep -Milliseconds 500
} finally {
  Remove-Item $profile -Recurse -Force -ErrorAction SilentlyContinue
}
if (Test-Path $Out) { Write-Output "screenshot: $Out" } else { Write-Error 'screenshot was not written' }
