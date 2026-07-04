# R2 跨账户迁移：Chjgf → Ubeator（S3 / rclone）
# 凭据：secrets/r2-migrate.env（S3 Access Key，非 cfat/cfut REST 令牌）
#
# 用法：
#   .\migrate-to-ubeator.ps1
#   .\migrate-to-ubeator.ps1 -DryRun
#   .\migrate-to-ubeator.ps1 -Bucket houseus

param(
    [switch]$DryRun,
    [string]$Bucket = ""
)

$ErrorActionPreference = "Stop"
$Rclone = "C:\rclone\rclone.exe"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$EnvFile = Join-Path $RepoRoot "secrets\r2-migrate.env"
$LogFile = Join-Path $ScriptDir "sync-to-ubeator.log"

$Buckets = @("houseus", "housepic", "houseat", "housech")
if ($Bucket) { $Buckets = @($Bucket) }

function Load-EnvFile {
    param([string]$Path)
    if (-not (Test-Path $Path)) {
        throw "未找到 $Path，请从 scripts/r2-migrate/tokens.env.example 复制并填写 S3 凭据"
    }
    Get-Content $Path | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith("#")) { return }
        $eq = $line.IndexOf("=")
        if ($eq -le 0) { return }
        $name = $line.Substring(0, $eq).Trim()
        $value = $line.Substring($eq + 1).Trim().Trim('"').Trim("'")
        if (-not (Get-Item -Path "env:$name" -ErrorAction SilentlyContinue)) {
            Set-Item -Path "env:$name" -Value $value
        }
    }
}

function Test-RequiredEnv {
    param([string[]]$Names)
    foreach ($name in $Names) {
        if (-not (Get-Item -Path "env:$name" -ErrorAction SilentlyContinue)) {
            throw "缺少环境变量: $name（请在 secrets/r2-migrate.env 中配置）"
        }
    }
}

function New-RcloneConfig {
    param([string]$Path)
    @"
[r2-src]
type = s3
provider = Cloudflare
access_key_id = $($env:R2_SRC_ACCESS_KEY_ID)
secret_access_key = $($env:R2_SRC_SECRET_ACCESS_KEY)
endpoint = https://0e70af17109f26d0d034bab33006f59e.r2.cloudflarestorage.com

[r2-dst]
type = s3
provider = Cloudflare
access_key_id = $($env:R2_DST_ACCESS_KEY_ID)
secret_access_key = $($env:R2_DST_SECRET_ACCESS_KEY)
endpoint = https://892acd09257ee1251aca55e5a6f9946e.r2.cloudflarestorage.com
"@ | Set-Content -Path $Path -Encoding UTF8
}

if (-not (Test-Path $Rclone)) {
    throw "未找到 rclone: $Rclone"
}

Load-EnvFile $EnvFile
Test-RequiredEnv @(
    "R2_SRC_ACCESS_KEY_ID", "R2_SRC_SECRET_ACCESS_KEY",
    "R2_DST_ACCESS_KEY_ID", "R2_DST_SECRET_ACCESS_KEY"
)

$ConfigFile = Join-Path $ScriptDir ".r2-migrate-ubeator.conf"
New-RcloneConfig $ConfigFile

$syncFlag = if ($DryRun) { "--dry-run" } else { "" }

Write-Host "=== R2 迁移 Chjgf -> Ubeator ===" -ForegroundColor Cyan
Write-Host "源: 0e70af17109f26d0d034bab33006f59e"
Write-Host "目标: 892acd09257ee1251aca55e5a6f9946e"
Write-Host "日志: $LogFile"
Write-Host ""

foreach ($b in $Buckets) {
    Write-Host "同步桶: $b" -ForegroundColor Yellow
    $args = @(
        "--config", $ConfigFile,
        "sync",
        "r2-src:${b}",
        "r2-dst:${b}",
        "--progress",
        "--transfers", "8",
        "--checkers", "16",
        "--fast-list",
        "--stats", "30s",
        "--stats-one-line",
        "--log-file", $LogFile,
        "--log-level", "INFO"
    )
    if ($syncFlag) { $args += $syncFlag }

    & $Rclone @args
    if ($LASTEXITCODE -ne 0) { throw "同步 $b 失败，退出码 $LASTEXITCODE" }
    Write-Host "完成: $b`n" -ForegroundColor Green
}

Write-Host "=== 迁移完成 ===" -ForegroundColor Cyan
Write-Host "校验: npm run cf:r2-verify"
