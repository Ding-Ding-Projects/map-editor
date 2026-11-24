# Detects Node.js 22+ and Git; installs only what is missing through Chocolatey.
param([switch]$s)
$ErrorActionPreference = 'Stop'
function Refresh-Path { $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User') }
function Have($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$need = @()
if (-not (Have node) -or [int]((node -v).TrimStart('v').Split('.')[0]) -lt 22) { $need += 'nodejs-lts' }
if (-not (Have git)) { $need += 'git' }
if ($need.Count -eq 0) { Write-Host 'Dependencies: Node.js and Git already present.'; return }
if (-not $isAdmin) {
  if ($s) { Write-Host "Not elevated, cannot install: $($need -join ', '). Run without /s to allow the admin prompt."; exit 5 }
  Start-Process powershell -Verb RunAs -Wait -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',$PSCommandPath)
  Refresh-Path; if ($need | Where-Object { -not (Have ($_ -replace 'nodejs-lts','node')) }) { Write-Host 'Install did not complete.'; exit 6 }; return
}
if (-not (Have choco)) {
  Write-Host 'Installing Chocolatey from community.chocolatey.org'
  Set-ExecutionPolicy Bypass -Scope Process -Force
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor 3072
  Invoke-Expression ((New-Object Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
  Refresh-Path
}
foreach ($p in $need) {
  $t = Measure-Command { choco install $p -y --no-progress | Out-Host }
  if ($LASTEXITCODE -ne 0) { Write-Host "choco install $p failed with exit code $LASTEXITCODE"; exit $LASTEXITCODE }
  Write-Host ("Installed {0} in {1:n0} s" -f $p, $t.TotalSeconds)
}
Refresh-Path
node -v; git --version
