# 对比 Supabase CH 列表与 R2 housech，从本地补传缺失图片
param(
    [string]$LocalDir = "D:\pythonProject\pythonProject\house_ch\images",
    [string]$TargetBucket = "housech",
    [int]$Parallel = 16,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$Rclone = "C:\rclone\rclone.exe"
$Cfg = Join-Path $PSScriptRoot ".r2-migrate-active.conf"

if (-not (Test-Path $LocalDir)) {
    throw "Local dir not found: $LocalDir"
}

function Get-UniqueImageNames {
    param($Url, $Key, $Table = "house_ger")
    $names = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    $offset = 0
    $pageSize = 1000
    while ($true) {
        $uri = "$Url/rest/v1/${Table}?select=pics_jsonStr&limit=$pageSize&offset=$offset"
        $headers = @{
            apikey = $Key
            Authorization = "Bearer $Key"
        }
        $rows = Invoke-RestMethod -Uri $uri -Headers $headers
        if (-not $rows -or $rows.Count -eq 0) { break }
        foreach ($row in $rows) {
            if (-not $row.pics_jsonStr) { continue }
            try {
                $pics = $row.pics_jsonStr | ConvertFrom-Json
                foreach ($p in $pics) {
                    if ($p) { [void]$names.Add([string]$p) }
                }
            } catch {}
        }
        if ($rows.Count -lt $pageSize) { break }
        $offset += $pageSize
    }
    return $names
}

function Get-ExistingImageNames {
    param([string]$Bucket)
    $existing = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    $lines = @(& $Rclone --config $Cfg lsf "r2-target:${Bucket}" --recursive --files-only 2>$null)
    foreach ($line in $lines) {
        if ($line -match '^images/(.+)$') {
            [void]$existing.Add($Matches[1])
        }
    }
    return ,$existing
}

Write-Host "=== Supabase CH list ===" -ForegroundColor Cyan
$chNames = Get-UniqueImageNames `
    -Url "https://yioqqdprzzeqrlwfyqov.supabase.co" `
    -Key "sb_publishable_4Rhk--WUKJFTeEDjwveyjg_kaIPxlDa"
Write-Host "Supabase CH: $($chNames.Count)"

Write-Host "=== Scan R2 $TargetBucket ===" -ForegroundColor Cyan
$existing = Get-ExistingImageNames -Bucket $TargetBucket
Write-Host "R2 existing: $($existing.Count)"

$missing = [System.Collections.Generic.List[string]]::new()
foreach ($name in $chNames) {
    if ([string]::IsNullOrWhiteSpace($name)) { continue }
    if (-not $existing.Contains($name)) {
        [void]$missing.Add($name)
    }
}
Write-Host "R2 missing: $($missing.Count)" -ForegroundColor Cyan

$todo = [System.Collections.Generic.List[string]]::new()
$noLocal = 0
foreach ($name in $missing) {
    $localPath = Join-Path $LocalDir $name
    if (Test-Path -LiteralPath $localPath) {
        [void]$todo.Add($name)
    } else {
        $noLocal++
        Write-Host "not in local: $name" -ForegroundColor DarkYellow
    }
}
Write-Host "local upload: $($todo.Count)  not in local: $noLocal" -ForegroundColor Cyan

if ($todo.Count -eq 0) {
    if ($missing.Count -eq 0) {
        Write-Host "housech complete, nothing to upload" -ForegroundColor Green
    } else {
        Write-Host "R2 missing $($missing.Count) files but none found in local dir" -ForegroundColor Yellow
    }
    exit 0
}

if ($DryRun) {
    foreach ($n in $todo) {
        Write-Host ('[dry-run] ' + $n + ' -> r2-target:' + $TargetBucket + '/images/' + $n)
    }
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
                if ($done % 50 -eq 0 -or $done -eq $total) {
                    Write-Host "  progress: $done/$total ok=$ok fail=$fail"
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
            if ($done % 50 -eq 0 -or $done -eq $total) {
                Write-Host "  progress: $done/$total ok=$ok fail=$fail"
            }
        }
    }
} finally {
    $pool.Close()
    $pool.Dispose()
}

Write-Host "done: ok=$ok fail=$fail noLocal=$noLocal r2Missing=$($missing.Count) supabaseTotal=$($chNames.Count)" -ForegroundColor Green
