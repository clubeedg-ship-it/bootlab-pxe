-- Add hardware fingerprint columns to machines

ALTER TABLE machines
    ADD COLUMN manufacturer TEXT,
    ADD COLUMN product      TEXT,
    ADD COLUMN serial       TEXT,
    ADD COLUMN system_uuid  TEXT,
    ADD COLUMN bios_vendor  TEXT,
    ADD COLUMN nic_vendor   TEXT;   -- looked up from MAC OUI

-- Index for fast lookup by serial / uuid (asset tracking)
CREATE INDEX idx_machines_serial ON machines(serial) WHERE serial IS NOT NULL;
CREATE INDEX idx_machines_uuid   ON machines(system_uuid) WHERE system_uuid IS NOT NULL;
