# 从本地目录补传 CH 缺失图片到 housech
param(
    [string]$LocalDir = "D:\pythonProject\pythonProject\house_ch\images",
    [string]$RetryLog = (Join-Path $PSScriptRoot "migrate-at-ch-retry.log"),
    [int]$Parallel = 16,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$Rclone = "C:\rclone\rclone.exe"
$Cfg = Join-Path $PSScriptRoot ".r2-migrate-active.conf"
$TargetBucket = "housech"

if (-not (Test-Path $LocalDir)) {
    throw "本地目录不存在: $LocalDir"
}
if (-not (Test-Path $RetryLog)) {
    throw "补传日志不存在: $RetryLog"
}

$missing = [System.Collections.Generic.List[string]]::new()
Get-Content $RetryLog -Encoding UTF8 | ForEach-Object {
    if ($_ -match '^FAIL:\s*(.+)$') {
        [void]$missing.Add($Matches[1].Trim())
    }
}
Write-Host "日志中缺失文件: $($missing.Count)" -ForegroundColor Cyan

$todo = [System.Collections.Generic.List[string]]::new()
$noLocal = 0
foreach ($name in $missing) {
    $localPath = Join-Path $LocalDir $name
    if (Test-Path -LiteralPath $localPath) {
        [void]$todo.Add($name)
    } else {
        $noLocal++
    }
}
Write-Host "本地可补传: $($todo.Count)  本地也没有: $noLocal" -ForegroundColor Cyan

if ($todo.Count -eq 0) {
    Write-Host "没有可上传的文件" -ForegroundColor Yellow
    exit 0
}

if ($DryRun) {
    $todo | Select-Object -First 10 | ForEach-Object { Write-Host "[dry-run] $_ -> r2-target:${TargetBucket}/images/$_" }
    if ($todo.Count -gt 10) { Write-Host "[dry-run] ... and $($todo.Count - 10) more" }
    exit 0
}

$ok = 0
$fail = 0
$done = 0
$total = $todo.Count
$pool = [runspacefactory]::CreateRunspacePool(1, $Parallel)
$pool.Open()

try {
    $handles = New-Object System.Collections.ArrayList

    foreach ($name in $todo) {
        $src = Join-Path $LocalDir $name
        $dst = "r2-target:${TargetBucket}/images/$name"
        $ps = [powershell]::Create().AddScript({
            param($Rclone, $Cfg, $Src, $Dst)
            & $Rclone --config $Cfg copyto $Src $Dst 2>$null | Out-Null
            if ($null -ne $LASTEXITCODE) { return [int]$LASTEXITCODE }
            return 1
        }).AddArgument($Rclone).AddArgument($Cfg).AddArgument($src).AddArgument($dst)
        $ps.RunspacePool = $pool
        [void]$handles.Add(@{ Handle = $ps.BeginInvoke(); PS = $ps; Name = $name })

        while ($handles.Count -ge $Parallel) {
            $completed = @($handles | Where-Object { $_.Handle.IsCompleted })
            foreach ($item in $completed) {
                $code = @($item.PS.EndInvoke($item.Handle))[-1]
                $item.PS.Dispose()
                [void]$handles.Remove($item)
                $done++
                if ($code -eq 0) { $ok++ } else { $fail++; Write-Host "FAIL: $($item.Name)" -ForegroundColor Yellow }
                if ($done % 200 -eq 0) {
                    $pct = [math]::Round(100 * $done / $total, 1)
                    Write-Host "  progress: $done/$total ($pct%) ok=$ok fail=$fail"
                }
            }
            if ($handles.Count -ge $Parallel -and $completed.Count -eq 0) {
                Start-Sleep -Milliseconds 50
            }
        }
    }

    while ($handles.Count -gt 0) {
        $completed = @($handles | Where-Object { $_.Handle.IsCompleted })
        if ($completed.Count -eq 0) {
            Start-Sleep -Milliseconds 50
            continue
        }
        foreach ($item in $completed) {
            $code = @($item.PS.EndInvoke($item.Handle))[-1]
            $item.PS.Dispose()
            [void]$handles.Remove($item)
            $done++
            if ($code -eq 0) { $ok++ } else { $fail++; Write-Host "FAIL: $($item.Name)" -ForegroundColor Yellow }
            if ($done % 200 -eq 0) {
                $pct = [math]::Round(100 * $done / $total, 1)
                Write-Host "  progress: $done/$total ($pct%) ok=$ok fail=$fail"
            }
        }
    }
} finally {
    $pool.Close()
    $pool.Dispose()
}

Write-Host "完成: ok=$ok fail=$fail noLocal=$noLocal totalMissing=$($missing.Count)" -ForegroundColor Green
