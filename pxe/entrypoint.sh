#!/bin/bash
set -e

# Compute LAN_NETWORK from LAN_SUBNET (strip CIDR mask)
# e.g. 192.168.0.0/24 -> 192.168.0.0
if [ -n "$LAN_SUBNET" ]; then
    LAN_NETWORK="${LAN_SUBNET%/*}"
    export LAN_NETWORK
fi

# Create output directory
mkdir -p /etc/pxe-generated

# Only expand our variables (leave nginx $host, $scheme, $proxy_add_x_forwarded_for alone)
VARS='${PXE_SERVER} ${PXE_HTTP_PORT} ${PANEL_PORT} ${LAN_INTERFACE} ${LAN_SUBNET} ${LAN_NETWORK}'

for template in /etc/pxe-templates/*.template; do
    if [ -f "$template" ]; then
        filename=$(basename "$template" .template)
        envsubst "$VARS" < "$template" > "/etc/pxe-generated/$filename"
    fi
done

# Copy generated configs to service directories
mkdir -p /etc/dnsmasq.d /etc/nginx/http.d /etc/samba
cp /etc/pxe-generated/dnsmasq.conf /etc/dnsmasq.d/pxe.conf
# Remove Alpine default nginx config to avoid conflicts
rm -f /etc/nginx/http.d/default.conf
cp /etc/pxe-generated/nginx.conf /etc/nginx/http.d/pxe.conf
cp /etc/pxe-generated/smb.conf /etc/samba/smb.conf
cp /etc/pxe-generated/boot.ipxe /generated/tftp/boot.ipxe 2>/dev/null || true
cp /etc/pxe-generated/startnet.cmd /generated/scripts/startnet.cmd 2>/dev/null || true

# Create needed directories
mkdir -p /generated/{tftp,winpe,win11} /data/{drivers,activation,redist,branding,profiles}

# Copy iPXE binaries to TFTP root
if [ -d /opt/ipxe ]; then
    cp /opt/ipxe/* /generated/tftp/ 2>/dev/null || true
fi

# Ensure log directory exists
mkdir -p /var/log/nginx

# Hand off to s6-overlay
exec /init
