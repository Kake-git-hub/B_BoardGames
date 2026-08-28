param(
  [string]$Message = "release",
  [switch]$NoCommit,

  # Where to publish.
  # 2026-08-29: dev リポジトリ(B_BoardGames-dev)は廃止したので stable(origin)のみ。
  [ValidateSet('stable')]
  [string]$Channel = 'stable',

  # Remote name (GitHub Pages の公開先)
  [string]$StableRemote = 'origin'
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

# Unique cache buster for GitHub Pages/CDN caches
$assetV = Get-Date -Format "yyyyMMddHHmmss"

function Replace-AssetV([string]$path) {
  $p = Join-Path $root $path
  $s = Get-Content -Raw -Encoding UTF8 $p

  # Replace existing ?v=... for known assets
  $eval = [System.Text.RegularExpressions.MatchEvaluator]{
    param($m)
    $m.Groups[1].Value + $assetV
  }

  $s = [regex]::Replace($s, '(bbg\.css\?v=)[^"\s>]+', $eval)
  $s = [regex]::Replace($s, '(bbg-config\.js\?v=)[^"\s>]+', $eval)
  $s = [regex]::Replace($s, '(bbg\.js\?v=)[^"\s>]+', $eval)

  Set-Content -Encoding UTF8 -NoNewline -Path $p -Value $s
}

Replace-AssetV "index.html"

# Stamp the Service Worker version (changing sw.js content triggers the
# browser's SW update flow -> clients auto-reload to the new version).
function Replace-SwVersion([string]$path) {
  $p = Join-Path $root $path
  $s = Get-Content -Raw -Encoding UTF8 $p
  $s = [regex]::Replace($s, "(const SW_VERSION = ')[^']*(')", ('${1}' + $assetV + '${2}'))
  Set-Content -Encoding UTF8 -NoNewline -Path $p -Value $s
}

Replace-SwVersion "sw.js"

function Ensure-Remote([string]$name) {
  $existing = git remote 2>$null | Where-Object { $_ -eq $name }
  if ($existing) { return }
  throw "Git remote '$name' is not configured. Add it with: git remote add $name <url>"
}

Ensure-Remote $StableRemote

git add -A

# If nothing changed, avoid empty commits
$st = git status --porcelain
if (-not $st) {
  Write-Host "No changes to commit. (assetV=$assetV)"
  exit 0
}

if (-not $NoCommit) {
  git commit -m "$Message (assets $assetV)"
  if ($LASTEXITCODE -ne 0) {
    throw "git commit failed"
  }
}

git push $StableRemote main
if ($LASTEXITCODE -ne 0) {
  throw "git push $StableRemote main failed"
}

Write-Host "Released: channel=$Channel assets=$assetV"