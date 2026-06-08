# R2 跨账户迁移：Ubeator(housepic/houseus) → Chjgf(apkintelligence.com)
# 用法：
#   1. 在两个账户分别创建 R2 API Token（Object Read and Write）
#   2. 设置环境变量后执行：.\migrate.ps1
#   或复制 rclone.conf.example 为 rclone.conf 填入密钥后：.\migrate.ps1 -UseConfigFile

param(
    [switch]$UseConfigFile,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$Rclone = "C:\rclone\rclone.exe"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ConfigFile = Join-Path $ScriptDir "rclone.conf"

$Buckets = @("housepic", "houseus")

function Get-RcloneArgs {
    if ($UseConfigFile) {
        if (-not (Test-Path $ConfigFile)) {
            throw "未找到 $ConfigFile，请从 rclone.conf.example 复制并填写密钥"
        }
        return @("--config", $ConfigFile)
    }

    $required = @(
        "R2_SOURCE_ACCESS_KEY_ID", "R2_SOURCE_SECRET_ACCESS_KEY",
        "R2_TARGET_ACCESS_KEY_ID", "R2_TARGET_SECRET_ACCESS_KEY"
    )
    foreach ($name in $required) {
        if (-not (Get-Item -Path "env:$name" -ErrorAction SilentlyContinue)) {
            throw "请设置环境变量: $name"
        }
    }

    return @()
}

function New-TempConfig {
    $tmp = [System.IO.Path]::GetTempFileName()
    @"
[r2-source]
type = s3
provider = Cloudflare
access_key_id = $($env:R2_SOURCE_ACCESS_KEY_ID)
secret_access_key = $($env:R2_SOURCE_SECRET_ACCESS_KEY)
endpoint = https://892acd09257ee1251aca55e5a6f9946e.r2.cloudflarestorage.com

[r2-target]
type = s3
provider = Cloudflare
access_key_id = $($env:R2_TARGET_ACCESS_KEY_ID)
secret_access_key = $($env:R2_TARGET_SECRET_ACCESS_KEY)
endpoint = https://0e70af17109f26d0d034bab33006f59e.r2.cloudflarestorage.com
"@ | Set-Content -Path $tmp -Encoding UTF8
    return $tmp
}

if (-not (Test-Path $Rclone)) {
    throw "未找到 rclone，请安装: https://rclone.org/downloads/"
}

$extraArgs = Get-RcloneArgs
$tempConfig = $null

if (-not $UseConfigFile) {
    $tempConfig = New-TempConfig
    $extraArgs = @("--config", $tempConfig)
}

$syncFlag = if ($DryRun) { "--dry-run" } else { "" }

Write-Host "=== R2 迁移开始 ===" -ForegroundColor Cyan
Write-Host "源账户: Ubeator (892acd...)"
Write-Host "目标账户: Chjgf (0e70af...) / apkintelligence.com"
Write-Host ""

foreach ($bucket in $Buckets) {
    Write-Host "同步桶: $bucket" -ForegroundColor Yellow
    $args = $extraArgs + @(
        "sync",
        "r2-source:${bucket}",
        "r2-target:${bucket}",
        "--progress",
        "--transfers", "16",
        "--checkers", "32",
        "--fast-list"
    )
    if ($syncFlag) { $args += $syncFlag }

    & $Rclone @args
    if ($LASTEXITCODE -ne 0) { throw "同步 $bucket 失败，退出码 $LASTEXITCODE" }
    Write-Host "完成: $bucket`n" -ForegroundColor Green
}

if ($tempConfig) { Remove-Item $tempConfig -Force }

Write-Host "=== 迁移完成 ===" -ForegroundColor Cyan
Write-Host "下一步："
Write-Host "  1. Chjgf 账户 R2 → housepic → Settings → Custom Domain → pic-de.apkintelligence.com"
Write-Host "  2. Chjgf 账户 R2 → houseus  → Settings → Custom Domain → pic-us.apkintelligence.com"
Write-Host "  3. 验证图片可访问后，更新前端 picURL 并重新部署网站"
