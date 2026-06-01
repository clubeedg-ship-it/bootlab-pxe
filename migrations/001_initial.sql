-- Blue Team Boot Platform — initial schema

CREATE TABLE machines (
    mac           TEXT PRIMARY KEY,
    hostname      TEXT,
    asset_tag     TEXT,
    notes         TEXT,
    first_seen    TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen     TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_ip       INET,
    vendor        TEXT,
    arch          TEXT
);
CREATE INDEX idx_machines_last_seen ON machines(last_seen DESC);

CREATE TABLE boot_profiles (
    name          TEXT PRIMARY KEY,
    display_name  TEXT NOT NULL,
    description   TEXT,
    category      TEXT NOT NULL,
    icon          TEXT,
    ipxe_template TEXT NOT NULL,
    enabled       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE boot_intents (
    id            BIGSERIAL PRIMARY KEY,
    mac           TEXT NOT NULL REFERENCES machines(mac) ON DELETE CASCADE,
    profile       TEXT NOT NULL REFERENCES boot_profiles(name),
    parameters    JSONB NOT NULL DEFAULT '{}'::jsonb,
    set_by        TEXT,
    set_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    consumed_at   TIMESTAMPTZ,
    expires_at    TIMESTAMPTZ,
    one_shot      BOOLEAN NOT NULL DEFAULT TRUE,
    notes         TEXT
);
CREATE INDEX idx_intents_pending ON boot_intents(mac) WHERE consumed_at IS NULL;

CREATE TABLE boot_sessions (
    id            BIGSERIAL PRIMARY KEY,
    mac           TEXT NOT NULL REFERENCES machines(mac) ON DELETE CASCADE,
    intent_id     BIGINT REFERENCES boot_intents(id),
    profile       TEXT REFERENCES boot_profiles(name),
    client_ip     INET,
    started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at      TIMESTAMPTZ,
    status        TEXT NOT NULL DEFAULT 'active',
    stages        JSONB NOT NULL DEFAULT '[]'::jsonb,
    bytes_served  BIGINT NOT NULL DEFAULT 0
);
CREATE INDEX idx_sessions_active ON boot_sessions(started_at DESC) WHERE ended_at IS NULL;
CREATE INDEX idx_sessions_mac ON boot_sessions(mac, started_at DESC);

CREATE TABLE audit_log (
    id            BIGSERIAL PRIMARY KEY,
    ts            TIMESTAMPTZ NOT NULL DEFAULT now(),
    operator      TEXT,
    operator_ip   INET,
    action        TEXT NOT NULL,
    target_type   TEXT,
    target_id     TEXT,
    details       JSONB NOT NULL DEFAULT '{}'::jsonb,
    success       BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX idx_audit_ts ON audit_log(ts DESC);
CREATE INDEX idx_audit_operator ON audit_log(operator, ts DESC);

-- Seed default boot profiles
INSERT INTO boot_profiles (name, display_name, description, category, icon, ipxe_template) VALUES
('deploy_windows', 'Deploy Windows 11 Pro', 'Fully unattended Windows 11 Pro nl-NL install with NVIDIA + MAS activation', 'deploy', 'monitor',
 'kernel http://${pxe_server}:8085/wimboot
initrd http://${pxe_server}:8085/winpe/BCD       BCD
initrd http://${pxe_server}:8085/winpe/boot.sdi  boot.sdi
initrd http://${pxe_server}:8085/winpe/boot.wim  boot.wim
boot'),

('alpine_rescue', 'Alpine Rescue Shell', 'Minimal Alpine Linux netboot — interactive shell for diagnostics', 'rescue', 'terminal',
 'kernel http://${pxe_server}:8085/profiles/alpine/vmlinuz-lts modules=loop,squashfs,sd-mod,usb-storage,ext4 modloop=http://${pxe_server}:8085/profiles/alpine/modloop-lts alpine_repo=https://dl-cdn.alpinelinux.org/alpine/v3.20/main
initrd http://${pxe_server}:8085/profiles/alpine/initramfs-lts
boot'),

('local_boot', 'Boot from local disk', 'Skip PXE — boot whatever is installed on the local disk', 'fallback', 'hard-drive',
 'sanboot --no-describe --drive 0x80 || exit');