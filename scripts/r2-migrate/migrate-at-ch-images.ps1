# 从旧 pub.r2.dev 公开地址迁移 AT/CH 图片到 Chjgf houseat/housech（并行 copyurl）
param(
    [switch]$DryRun,
    [switch]$ChOnly,
    [int]$Parallel = 16
)

$ErrorActionPreference = "Stop"
$Rclone = "C:\rclone\rclone.exe"
$Cfg = Join-Path $PSScriptRoot ".r2-migrate-active.conf"

if (-not (Test-Path $Cfg)) {
    @'
[r2-target]
type = s3
provider = Cloudflare
access_key_id = 2587e0460e60f250dac49310a1784af1
secret_access_key = e699fa578997ed7bfc7f85ff0c4f99ffe9d1021dce3bee0cd872bed802bfe96e
endpoint = https://0e70af17109f26d0d034bab33006f59e.r2.cloudflarestorage.com
'@ | Set-Content -Path $Cfg -Encoding ASCII
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
    param([string]$TargetBucket)
    $existing = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    $lines = @(& $Rclone --config $Cfg lsf "r2-target:${TargetBucket}" --recursive --files-only 2>$null)
    foreach ($line in $lines) {
        if ($line -match '^images/(.+)$') {
            [void]$existing.Add($Matches[1])
        }
    }
    return ,$existing
}

function Copy-Images {
    param(
        [string]$SourceBase,
        [string]$TargetBucket,
        [System.Collections.Generic.HashSet[string]]$Names
    )

    $existing = Get-ExistingImageNames -TargetBucket $TargetBucket
    $todo = [System.Collections.Generic.List[string]]::new()
    foreach ($name in $Names) {
        if ([string]::IsNullOrWhiteSpace($name)) { continue }
        if (-not $existing.Contains($name)) { [void]$todo.Add($name) }
    }
    $skipped = $Names.Count - $todo.Count

    Write-Host "$TargetBucket : total=$($Names.Count) skip=$skipped todo=$($todo.Count) parallel=$Parallel" -ForegroundColor Cyan

    if ($DryRun) {
        $todo | Select-Object -First 5 | ForEach-Object { Write-Host "[dry-run] $SourceBase$_ -> r2-target:${TargetBucket}/images/$_" }
        if ($todo.Count -gt 5) { Write-Host "[dry-run] ... and $($todo.Count - 5) more" }
        return @{ ok = 0; fail = 0; skip = $skipped }
    }

    if ($todo.Count -eq 0) {
        Write-Host "$TargetBucket : nothing to copy" -ForegroundColor Green
        return @{ ok = 0; fail = 0; skip = $skipped }
    }

    $ok = 0
    $fail = 0
    $done = 0
    $total = $todo.Count
    $lock = [object]::new()
    $pool = [runspacefactory]::CreateRunspacePool(1, $Parallel)
    $pool.Open()

    try {
        $handles = New-Object System.Collections.ArrayList

        foreach ($name in $todo) {
            $src = "$SourceBase$name"
            $dst = "r2-target:${TargetBucket}/images/$name"
            $ps = [powershell]::Create().AddScript({
                param($Rclone, $Cfg, $Src, $Dst)
                & $Rclone --config $Cfg copyurl $Src $Dst 2>$null | Out-Null
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
                        Write-Host "  $TargetBucket progress: $done/$total ($pct%) ok=$ok fail=$fail"
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
                    Write-Host "  $TargetBucket progress: $done/$total ($pct%) ok=$ok fail=$fail"
                }
            }
        }
    } finally {
        $pool.Close()
        $pool.Dispose()
    }

    Write-Host "$TargetBucket : ok=$ok fail=$fail skip=$skipped total=$($Names.Count)" -ForegroundColor Green
    return @{ ok = $ok; fail = $fail; skip = $skipped }
}

if (-not $ChOnly) {
    Write-Host "=== 收集 AT 图片列表 ===" -ForegroundColor Cyan
    $atNames = Get-UniqueImageNames `
        -Url "https://zxvflhunzznslxzqreih.supabase.co" `
        -Key "sb_publishable_rR8k81Y-lslto8ZIME11Hg_iorubIcG"
    Write-Host "AT unique images: $($atNames.Count)"

    Write-Host "=== 迁移 AT -> houseat ===" -ForegroundColor Cyan
    Copy-Images `
        -SourceBase "https://pub-3f962bb7a4294160be9aef39a7f9bb0d.r2.dev/images/" `
        -TargetBucket "houseat" `
        -Names $atNames
}

Write-Host "=== 收集 CH 图片列表 ===" -ForegroundColor Cyan
$chNames = Get-UniqueImageNames `
    -Url "https://yioqqdprzzeqrlwfyqov.supabase.co" `
    -Key "sb_publishable_4Rhk--WUKJFTeEDjwveyjg_kaIPxlDa"
Write-Host "CH unique images: $($chNames.Count)"

Write-Host "=== 迁移 CH -> housech ===" -ForegroundColor Cyan
Copy-Images `
    -SourceBase "https://pub-834cbbaa1aca47e4acfd71e2b2fd5251.r2.dev/images/" `
    -TargetBucket "housech" `
    -Names $chNames

Write-Host "=== 完成 ===" -ForegroundColor Green
