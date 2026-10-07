# Run every browser autotest headless and report the ones that raised an error.
#   powershell -File tools\autotests.ps1 [-Only combat,shop]
# Node tests cover core/data/sim; this covers the browser-only layers (view, audio, ui, input, app wiring).
# A scene fails when the page shows an "AUTOTEST ERROR" (the scene threw) or an "ERROR:" (uncaught error).
param([string]$Only = '')
$ErrorActionPreference = 'Continue'   # the browser writes harmless noise to stderr
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$browser = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $browser)) { $browser = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }

$tests = Get-ChildItem (Join-Path $root 'js\debug\autotests') -Filter *.js | ForEach-Object { $_.BaseName }
if ($Only) { $tests = $Only.Split(',') }
$failed = @()
foreach ($t in $tests) {
  $profile = Join-Path $env:TEMP ('bdauto_' + [guid]::NewGuid().ToString('N'))
  $url = 'file:///' + ($root.Replace('\', '/')) + '/index.html?debug=1&autotest=' + $t
  try {
    $dom = & $browser --headless=new --disable-gpu --user-data-dir="$profile" --window-size=1600,900 `
      --virtual-time-budget=5000 --dump-dom "$url" 2>$null | Out-String
  } finally {
    Remove-Item $profile -Recurse -Force -ErrorAction SilentlyContinue
  }
  $err = [regex]::Match($dom, '(AUTOTEST ERROR|ERROR): [^<]{0,300}')
  if (-not $dom.Trim()) { $failed += $t; Write-Output ("FAIL {0}: no page output" -f $t) }
  elseif ($err.Success) { $failed += $t; Write-Output ("FAIL {0}: {1}" -f $t, $err.Value) }
  else { Write-Output ("ok   {0}" -f $t) }
}
Write-Output ('{0} scenes, {1} failed' -f $tests.Count, $failed.Count)
if ($failed.Count) { exit 1 }
