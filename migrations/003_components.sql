-- Full hardware fingerprint: CPU, GPU, RAM, storage
-- Populated by the 'inventory' boot profile (Alpine + lshw → POST)

ALTER TABLE machines
    ADD COLUMN cpu_model       TEXT,
    ADD COLUMN cpu_cores       INT,
    ADD COLUMN cpu_threads     INT,
    ADD COLUMN gpu_model       TEXT,
    ADD COLUMN gpu_vram_mb     INT,
    ADD COLUMN ram_gb          INT,
    ADD COLUMN ram_modules     JSONB,    -- [{size_gb, type, speed_mhz, vendor}, ...]
    ADD COLUMN storage_total_gb INT,
    ADD COLUMN storage_devices JSONB,    -- [{model, size_gb, type, vendor}, ...]
    ADD COLUMN inventoried_at  TIMESTAMPTZ;

CREATE INDEX idx_machines_inventoried ON machines(inventoried_at) WHERE inventoried_at IS NOT NULL;
