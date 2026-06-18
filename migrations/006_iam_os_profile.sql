-- iam-os dev appliance — diskless network boot via iPXE iSCSI sanboot
--
-- Network-boots the exact iam-os v0.1.0 dev appliance image (ESP + systemd-boot
-- + writable ext4) straight off an iSCSI target on the PXE server. Nothing is
-- written to the client's local disk — the whole appliance runs over iSCSI.
--
-- The iSCSI target is served by tgt on the PXE host (see etc/iam-os/tgt-iam-os.conf):
--   IQN  iqn.2026-06.nl.omiximo:iam-os-dev
--   LUN1 = /srv/iam-os/iam-os-dev.img  (raw full-disk image, read-write)
--
-- ${pxe_server} is substituted Python-side by the backend (config.pxe_server).
-- iPXE's sanboot attaches the iSCSI LUN as a local disk and boots it.

INSERT INTO boot_profiles (name, display_name, description, category, icon, ipxe_template) VALUES
('iam_os_dev', 'iam-os dev appliance (iSCSI)',
 'Diskless network boot of the iam-os v0.1.0 dev appliance over iSCSI sanboot. Nothing is written to the local disk.',
 'boot', 'hard-drive',
 'sanboot iscsi:${pxe_server}::::iqn.2026-06.nl.omiximo:iam-os-dev')
ON CONFLICT (name) DO UPDATE
SET display_name  = EXCLUDED.display_name,
    description   = EXCLUDED.description,
    category      = EXCLUDED.category,
    icon          = EXCLUDED.icon,
    ipxe_template = EXCLUDED.ipxe_template,
    updated_at    = now();
