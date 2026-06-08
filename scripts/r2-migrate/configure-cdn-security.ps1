# 为 R2 图片 CDN 子域名跳过 Cloudflare 人机验证（Bot Fight / Managed Challenge）
# 原因：<img> 标签无法完成 JS Challenge，导致页面内图片 403 破损，但地址栏直接访问可通过验证
#
# 用法：
#   $env:CLOUDFLARE_API_TOKEN = "带 Zone WAF Edit 权限的 Token"
#   $env:CLOUDFLARE_ZONE_ID = "apkintelligence.com 的 Zone ID"
#   .\configure-cdn-security.ps1

param(
    [string]$ZoneId = $env:CLOUDFLARE_ZONE_ID,
    [string]$ApiToken = $env:CLOUDFLARE_API_TOKEN
)

$ErrorActionPreference = "Stop"

if (-not $ApiToken) { throw "请设置 CLOUDFLARE_API_TOKEN" }
if (-not $ZoneId) { throw "请设置 CLOUDFLARE_ZONE_ID" }

$headers = @{
    Authorization = "Bearer $ApiToken"
    "Content-Type" = "application/json"
}

$cdnHosts = @(
    "pic-us.apkintelligence.com",
    "pic-de.apkintelligence.com",
    "pic-at.apkintelligence.com",
    "pic-ch.apkintelligence.com"
)
$hostList = ($cdnHosts | ForEach-Object { "`"$_`"" }) -join " "
$expression = "(http.host in {$hostList})"

$phaseUri = "https://api.cloudflare.com/client/v4/zones/$ZoneId/rulesets/phases/http_request_firewall_custom/entrypoint"
Write-Host "读取现有 WAF 自定义规则 ..." -ForegroundColor Cyan

$entrypoint = Invoke-RestMethod -Uri $phaseUri -Method Get -Headers $headers
$existingRules = @()
if ($entrypoint.result.rules) {
    $existingRules = @($entrypoint.result.rules)
}

$skipRule = $existingRules | Where-Object { $_.description -eq "Bypass security for R2 image CDN" }
if ($skipRule) {
    Write-Host "规则已存在，跳过创建。" -ForegroundColor Yellow
    exit 0
}

$newRule = @{
    expression = $expression
    description = "Bypass security for R2 image CDN"
    action = "skip"
    action_parameters = @{
        ruleset = "current"
        phases = @(
            "http_ratelimit",
            "http_request_firewall_managed",
            "http_request_sbfm"
        )
    }
    enabled = $true
}

$allRules = @($newRule) + $existingRules
$body = @{ rules = $allRules } | ConvertTo-Json -Depth 10

Write-Host "创建 WAF Skip 规则: $expression" -ForegroundColor Cyan
$resp = Invoke-RestMethod -Uri $phaseUri -Method Put -Headers $headers -Body $body
if (-not $resp.success) {
    throw "创建失败: $($resp.errors | ConvertTo-Json -Compress)"
}

Write-Host "OK: R2 CDN 子域名已跳过 Bot Fight / Managed Challenge" -ForegroundColor Green
Write-Host "验证: curl.exe -sI https://pic-us.apkintelligence.com/<图片路径> 应返回 HTTP 200" -ForegroundColor Cyan
