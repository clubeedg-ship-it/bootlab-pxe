-- Operator-managed post-boot setup scripts
--
-- These are the scripts that run on a Windows machine on its FIRST boot after
-- FOG deploys an image. The baked SetupComplete.cmd bootstrap downloads the
-- assembled firstboot.ps1 (GET /api/v1/setup/firstboot.ps1) and runs it as
-- SYSTEM with no logon. Operators edit these rows from the panel's "Setup
-- Scripts" tab; edits take effect on the next deploy with no master re-capture.
--
-- language = 'powershell'  -> body inlined verbatim into firstboot.ps1
-- language = 'batch'       -> body written to C:\PXE\<name>.cmd, run via cmd /c

CREATE TABLE IF NOT EXISTS setup_scripts (
    id          BIGSERIAL PRIMARY KEY,
    name        TEXT UNIQUE NOT NULL,
    description TEXT,
    language    TEXT NOT NULL DEFAULT 'powershell'
                  CHECK (language IN ('powershell', 'batch')),
    content     TEXT NOT NULL DEFAULT '',
    run_order   INTEGER NOT NULL DEFAULT 100,
    enabled     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_setup_scripts_order ON setup_scripts(run_order, name);

-- Seed: the whole fleet is RTX 3050+, so one NVIDIA package installs on every
-- machine — no GPU detection needed. The driver .exe is hosted on the bootlab
-- box at ./data/drivers/nvidia/ (served by nginx at $PXE_BASE/drivers/). The
-- $PXE_BASE / $WorkDir / Write-Log helpers are provided by firstboot.ps1.
INSERT INTO setup_scripts (name, description, language, content, run_order, enabled) VALUES
('10-gpu-nvidia',
 'Silent-install the NVIDIA driver (one package for the whole RTX 3050+ fleet)',
 'powershell',
$script$
$exe = Join-Path $WorkDir "nvidia-driver.exe"
Write-Log "Downloading NVIDIA driver from $PXE_BASE/drivers/nvidia/nvidia-driver.exe"
Invoke-WebRequest -Uri "$PXE_BASE/drivers/nvidia/nvidia-driver.exe" -OutFile $exe -UseBasicParsing -TimeoutSec 900
Write-Log "Installing NVIDIA driver silently..."
$p = Start-Process -FilePath $exe -ArgumentList "-s","-clean","-noreboot","-noeula" -Wait -PassThru
Write-Log "NVIDIA installer exit code: $($p.ExitCode)"
Remove-Item $exe -Force -ErrorAction SilentlyContinue
$script$,
 10, TRUE)
ON CONFLICT (name) DO NOTHING;
