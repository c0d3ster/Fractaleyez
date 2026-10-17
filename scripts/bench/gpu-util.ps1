# Samples Windows GPU engine utilization for the benchmark browser's processes, once a second, and prints JSON:
# { "<adapter luid>": { "3D": avg%, "Copy": avg%, "VideoDecode": avg%, "samples": n } }
# Usage: powershell -NoProfile -File gpu-util.ps1 -Seconds 20 -ExePath C:\path\to\chrome.exe
param([int]$Seconds = 20, [string]$ExePath)
$pids = @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and ($_.ExecutablePath -ieq $ExePath) } | ForEach-Object { $_.ProcessId })
$result = @{}
$samples = Get-Counter -Counter '\GPU Engine(*)\Utilization Percentage' -SampleInterval 1 -MaxSamples $Seconds -ErrorAction SilentlyContinue
foreach ($sample in $samples) {
  $perSecond = @{}
  foreach ($c in $sample.CounterSamples) {
    if ($c.InstanceName -notmatch 'pid_(\d+)_luid_(0x[0-9a-fA-F]+_0x[0-9a-fA-F]+)_phys_\d+_eng_\d+_engtype_(\w+)') { continue }
    if ($pids -notcontains [int]$Matches[1]) { continue }
    $key = $Matches[2] + '|' + $Matches[3]
    $perSecond[$key] = [double]$perSecond[$key] + $c.CookedValue
  }
  foreach ($key in $perSecond.Keys) {
    $luid, $type = $key -split '\|'
    if (-not $result.ContainsKey($luid)) { $result[$luid] = @{ samples = 0 } }
    $result[$luid][$type] = [double]$result[$luid][$type] + $perSecond[$key]
  }
}
$out = @{}
foreach ($luid in $result.Keys) {
  $n = [Math]::Max(1, @($samples).Count)
  $out[$luid] = @{}
  foreach ($type in $result[$luid].Keys) { if ($type -ne 'samples') { $out[$luid][$type] = [Math]::Round($result[$luid][$type] / $n, 1) } }
}
$out | ConvertTo-Json -Depth 4 -Compress
