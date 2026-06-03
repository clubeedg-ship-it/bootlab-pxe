-- FOG Project imaging integration
--
-- Adds a boot profile that hands the client off to the external FOG server's
-- iPXE menu (the custom version x language menu in fog/ipxe/default.ipxe).
-- This keeps bootlab-pxe's dnsmasq as the single proxyDHCP on the LAN while
-- FOG owns image deployment.
--
-- ${fog_server} is substituted by the backend from BT_FOG_SERVER (config.py).
-- ${net0/mac} / ${buildarch} are resolved by iPXE on the client.

INSERT INTO boot_profiles (name, display_name, description, category, icon, ipxe_template) VALUES
('fog_imaging', 'Deploy Windows 11 Pro (FOG image)',
 'Hand off to the FOG server: pick Windows 11 Pro version + language, then auto-deploy the Sysprep image',
 'deploy', 'hard-drive',
 'echo Connecting to FOG imaging server ${fog_server}...
chain http://${fog_server}/fog/service/ipxe/boot.php?mac=${net0/mac:hexhyp}&arch=${buildarch} || sanboot --no-describe --drive 0x80')
ON CONFLICT (name) DO UPDATE
SET display_name  = EXCLUDED.display_name,
    description   = EXCLUDED.description,
    category      = EXCLUDED.category,
    icon          = EXCLUDED.icon,
    ipxe_template = EXCLUDED.ipxe_template,
    updated_at    = now();
