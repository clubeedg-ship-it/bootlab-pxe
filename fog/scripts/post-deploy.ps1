#Requires -RunAsAdministrator
<#
================================================================================
 bootlab-pxe : Windows 11 Pro first-boot post-deploy  (FOG Sysprep workflow)
================================================================================
 Launched once by SetupComplete.cmd on the first boot after FOG images the disk.
 Runs autonomously as SYSTEM. Job:

   GPU : detect whether a DEDICATED GPU is present and, only then, silently
         install that vendor's driver. Integrated graphics (Intel UHD/Iris,
         AMD APU iGPU) are skipped.

 Activation is not performed here; it is handled outside this script.
#>

$ErrorActionPreference = "Continue"

# --- Config -------------------------------------------------------------------
# HTTP root that hosts the silent driver packages (put them on the FOG server's
# apache, e.g. /var/www/html/drivers/  ->  http://<fog-ip>/drivers/ ).
$DriverBase   = "http://FOG_SERVER_IP/drivers"
$WorkDir      = "C:\PXE"
$Log          = Join-Path $WorkDir "post-deploy.log"

New-Item -Path $WorkDir -ItemType Directory -Force | Out-Null

function Write-Log { param([string]$m)
    $line = "{0} - {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $m
    $line | Tee-Object -FilePath $Log -Append
}

function Get-File { param([string]$Url, [string]$Dest)
    try {
        Invoke-WebRequest -Uri $Url -OutFile $Dest -UseBasicParsing -TimeoutSec 600
        return (Test-Path $Dest)
    } catch {
        Write-Log "  download failed: $Url -- $($_.Exception.Message)"
        return $false
    }
}

Write-Log "=== post-deploy started ==="

# =============================================================================
# 1. DEDICATED GPU DETECTION + SILENT DRIVER INSTALL
# =============================================================================
# Each entry: how to recognise the discrete card, the silent installer to fetch
# under $DriverBase, and that installer's silent switches.
$GpuVendors = @(
    @{ Vendor = "NVIDIA"
       # GeForce / RTX / GTX / Quadro / NVIDIA RTX -- all discrete
       Match  = 'NVIDIA|GeForce|\bRTX\b|\bGTX\b|Quadro'
       Pkg    = "nvidia/nvidia-driver.exe"
       Args   = @("-s","-clean","-noreboot","-noeula") },

    @{ Vendor = "AMD"
       # discrete Radeon RX / Pro only; APU "Radeon Graphics" is excluded below
       Match  = 'Radeon (RX|PRO)|Radeon Pro|\bRX \d'
       Pkg    = "amd/amd-driver.exe"
       Args   = @("-INSTALL","-OUTPUT","screen") },

    @{ Vendor = "Intel"
       # Intel Arc discrete only (UHD / Iris Xe are integrated -> excluded)
       Match  = '\bArc\b|Arc A\d'
       Pkg    = "intel/intel-arc-driver.exe"
       Args   = @("-s") }
)

# Integrated adapters we must never treat as "dedicated".
$IntegratedMatch = 'UHD Graphics|Iris|Intel\(R\) HD|AMD Radeon\(TM\) Graphics|Radeon\(TM\) Vega|Microsoft Basic Display'

Write-Log "[1/1] Scanning display adapters..."
$adapters = Get-CimInstance Win32_VideoController -ErrorAction SilentlyContinue
foreach ($a in $adapters) { Write-Log "  found adapter: $($a.Name)" }

$installed = $false
foreach ($v in $GpuVendors) {
    $card = $adapters | Where-Object {
        $_.Name -match $v.Match -and $_.Name -notmatch $IntegratedMatch
    } | Select-Object -First 1

    if (-not $card) { continue }

    Write-Log "  dedicated $($v.Vendor) GPU detected: $($card.Name)"
    $exe = Join-Path $WorkDir ("gpu-" + $v.Vendor + ".exe")
    if (Get-File "$DriverBase/$($v.Pkg)" $exe) {
        Write-Log "  installing $($v.Vendor) driver silently..."
        $p = Start-Process -FilePath $exe -ArgumentList $v.Args -Wait -PassThru
        Write-Log "  $($v.Vendor) installer exit code: $($p.ExitCode)"
        Remove-Item $exe -Force -ErrorAction SilentlyContinue
        $installed = $true
    }
    break   # one dedicated GPU vendor per machine
}

if (-not $installed) {
    Write-Log "  no dedicated GPU detected (or no matching driver package) -- skipping GPU driver install."
}

Write-Log "=== post-deploy completed ==="
exit 0
