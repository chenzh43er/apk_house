# 绑定 R2 自定义 CDN 域名
# 需要：带 R2 Edit 权限的 API Token + Zone ID
#
# 用法：
#   $env:CLOUDFLARE_API_TOKEN = "你的Token"
#   $env:CLOUDFLARE_ZONE_ID = "apkintelligence.com 的 Zone ID"
#   .\bind-domains.ps1

param(
    [string]$AccountId = "0e70af17109f26d0d034bab33006f59e",
    [string]$ZoneId = $env:CLOUDFLARE_ZONE_ID,
    [string]$ApiToken = $env:CLOUDFLARE_API_TOKEN
)

$ErrorActionPreference = "Stop"

if (-not $ApiToken) { throw "请设置 CLOUDFLARE_API_TOKEN" }
if (-not $ZoneId) { throw "请设置 CLOUDFLARE_ZONE_ID（Dashboard → apkintelligence.com → 右侧 API → Zone ID）" }

$domains = @(
    @{ Bucket = "housepic"; Domain = "pic-de.apkintelligence.com" },
    @{ Bucket = "houseus";  Domain = "pic-us.apkintelligence.com" }
)

$headers = @{
    Authorization = "Bearer $ApiToken"
    "Content-Type" = "application/json"
}

foreach ($item in $domains) {
    $body = @{
        domain  = $item.Domain
        enabled = $true
        zoneId  = $ZoneId
    } | ConvertTo-Json

    $uri = "https://api.cloudflare.com/client/v4/accounts/$AccountId/r2/buckets/$($item.Bucket)/domains/custom"
    Write-Host "绑定 $($item.Domain) -> $($item.Bucket) ..." -ForegroundColor Cyan

    $resp = Invoke-RestMethod -Uri $uri -Method Post -Headers $headers -Body $body
    if (-not $resp.success) {
        throw "绑定失败: $($item.Domain) - $($resp.errors | ConvertTo-Json -Compress)"
    }
    Write-Host "  OK: $($resp.result.domain) enabled=$($resp.result.enabled)" -ForegroundColor Green
}

Write-Host "`n全部绑定完成。DNS 记录由 Cloudflare 自动创建，几分钟后生效。" -ForegroundColor Cyan
Write-Host "验证: https://pic-de.apkintelligence.com/<图片路径>"
