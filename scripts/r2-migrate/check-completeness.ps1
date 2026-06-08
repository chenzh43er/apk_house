# Check houseat/housech completeness vs Supabase
param(
    [ValidateSet('houseat', 'housech', 'both')]
    [string]$Bucket = 'both'
)

$ErrorActionPreference = 'Stop'
$Rclone = 'C:\rclone\rclone.exe'
$Cfg = Join-Path $PSScriptRoot '.r2-migrate-active.conf'

function Get-UniqueImageNames {
    param($Url, $Key, $Table = 'house_ger')
    $names = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    $offset = 0
    $pageSize = 1000
    while ($true) {
        $uri = "$Url/rest/v1/${Table}?select=pics_jsonStr&limit=$pageSize&offset=$offset"
        $headers = @{ apikey = $Key; Authorization = "Bearer $Key" }
        $rows = Invoke-RestMethod -Uri $uri -Headers $headers
        if (-not $rows -or $rows.Count -eq 0) { break }
        foreach ($row in $rows) {
            if (-not $row.pics_jsonStr) { continue }
            try {
                $pics = $row.pics_jsonStr | ConvertFrom-Json
                foreach ($p in $pics) { if ($p) { [void]$names.Add([string]$p) } }
            } catch {}
        }
        if ($rows.Count -lt $pageSize) { break }
        $offset += $pageSize
    }
    return $names
}

function Get-R2ImageNames {
    param([string]$Bucket)
    $existing = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    $lines = @(& $Rclone --config $Cfg lsf "r2-target:${Bucket}" --recursive --files-only 2>$null)
    foreach ($line in $lines) {
        if ($line -match '^images/(.+)$') { [void]$existing.Add($Matches[1]) }
    }
    return ,$existing
}

function Show-Report {
    param($Label, $Url, $Key, $BucketName)
    Write-Host ""
    Write-Host "========== $Label ($BucketName) ==========" -ForegroundColor Cyan
    $expected = Get-UniqueImageNames -Url $Url -Key $Key
    $r2 = Get-R2ImageNames -Bucket $BucketName
    $missing = @($expected | Where-Object { -not $r2.Contains($_) })
    $extra = @($r2 | Where-Object { -not $expected.Contains($_) })
    $pct = if ($expected.Count -gt 0) { [math]::Round(100 * ($expected.Count - $missing.Count) / $expected.Count, 2) } else { 0 }
    Write-Host "Supabase expected : $($expected.Count)"
    Write-Host "R2 images/        : $($r2.Count)"
    Write-Host "Missing in R2     : $($missing.Count)"
    Write-Host "Extra in R2 only  : $($extra.Count)"
    Write-Host "Completeness      : $pct%"
    if ($missing.Count -gt 0 -and $missing.Count -le 20) {
        Write-Host "Missing files:"
        $missing | ForEach-Object { Write-Host "  $_" }
    } elseif ($missing.Count -gt 20) {
        Write-Host "Missing sample (first 10):"
        $missing | Select-Object -First 10 | ForEach-Object { Write-Host "  $_" }
    }
    $size = & $Rclone --config $Cfg size "r2-target:${BucketName}" 2>$null
    Write-Host "R2 size           : $size"
}

if ($Bucket -eq 'both' -or $Bucket -eq 'houseat') {
    Show-Report -Label 'AT' -BucketName 'houseat' `
        -Url 'https://zxvflhunzznslxzqreih.supabase.co' `
        -Key 'sb_publishable_rR8k81Y-lslto8ZIME11Hg_iorubIcG'
}

if ($Bucket -eq 'both' -or $Bucket -eq 'housech') {
    Show-Report -Label 'CH' -BucketName 'housech' `
        -Url 'https://yioqqdprzzeqrlwfyqov.supabase.co' `
        -Key 'sb_publishable_4Rhk--WUKJFTeEDjwveyjg_kaIPxlDa'
}

Write-Host ""
