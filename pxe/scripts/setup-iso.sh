#!/bin/bash
set -euo pipefail

# setup-iso.sh — Extract Windows ISOs, build WinPE with language menu,
# extract Microsoft-signed bootloader, prepare TFTP directory.
# Run once after placing ISO(s) in /data/iso/

GEN="/generated"
DATA="/data"
TFTP="$GEN/tftp"
WINPE="$GEN/winpe"

echo "============================================"
echo " bootlab-pxe: ISO Setup"
echo "============================================"
echo ""

# --- 1. Find ISOs ---
shopt -s nullglob
ISOS=("$DATA/iso/"*.iso)
shopt -u nullglob

if [ ${#ISOS[@]} -eq 0 ]; then
    echo "ERROR: No .iso files found in /data/iso/"
    echo "Place Windows 11 ISOs there and re-run."
    echo "  e.g. win11-nl.iso, win11-fr.iso, win11-en.iso"
    echo "  or just win11.iso for a single language"
    exit 1
fi

echo "Found ${#ISOS[@]} ISO(s):"
for iso in "${ISOS[@]}"; do
    echo "  $(basename "$iso") ($(du -h "$iso" | cut -f1))"
done
echo ""

# --- 2. Create directories ---
mkdir -p "$TFTP/Boot" "$WINPE" "$GEN/win11" "$GEN/scripts"

# --- 3. Extract each ISO ---
# For MVP, we use the FIRST ISO as the primary install source.
# All ISOs contribute their install.wim to the same win11/ directory.
PRIMARY_ISO="${ISOS[0]}"
echo "Primary ISO: $(basename "$PRIMARY_ISO")"
echo ""

echo "[1/5] Extracting ISO to $GEN/win11/ ..."
MOUNT_DIR=$(mktemp -d)
mount -o loop,ro "$PRIMARY_ISO" "$MOUNT_DIR"
cp -r "$MOUNT_DIR"/* "$GEN/win11/"
sync
umount "$MOUNT_DIR"
rmdir "$MOUNT_DIR"

echo "  install.wim: $(du -h "$GEN/win11/sources/install.wim" | cut -f1)"

# --- 4. Extract Microsoft-signed bootloader ---
echo ""
echo "[2/5] Extracting Microsoft-signed bootloader..."

if [ -f "$GEN/win11/efi/boot/bootx64.efi" ]; then
    cp "$GEN/win11/efi/boot/bootx64.efi" "$TFTP/bootx64.efi"
    echo "  bootx64.efi: $(du -h "$TFTP/bootx64.efi" | cut -f1) (Microsoft-signed, Secure Boot OK)"
else
    echo "  WARNING: bootx64.efi not found in ISO. Falling back to iPXE-only boot."
fi

# --- 5. Build TFTP directory for network boot ---
echo ""
echo "[3/5] Building TFTP boot structure..."

# Copy BCD from ISO (it's designed for removable media but works for TFTP too
# when the directory structure matches)
cp "$GEN/win11/boot/bcd" "$TFTP/Boot/BCD"
cp "$GEN/win11/boot/boot.sdi" "$TFTP/Boot/boot.sdi"

echo "  BCD:      $(du -h "$TFTP/Boot/BCD" | cut -f1)"
echo "  boot.sdi: $(du -h "$TFTP/Boot/boot.sdi" | cut -f1)"

# --- 6. Extract + customize WinPE ---
echo ""
echo "[4/5] Customizing WinPE boot image..."

cp "$GEN/win11/sources/boot.wim" "$WINPE/boot.wim"

# Mount WinPE image index 1 and inject startnet.cmd
WIM_MOUNT=$(mktemp -d)
wimlib-imagex mountrw "$WINPE/boot.wim" 1 "$WIM_MOUNT"

# Process startnet.cmd template
if [ -f /etc/pxe-templates/startnet.cmd.template ]; then
    envsubst '${PXE_SERVER} ${PXE_HTTP_PORT}' < /etc/pxe-templates/startnet.cmd.template \
        > "$WIM_MOUNT/Windows/System32/startnet.cmd"
    echo "  startnet.cmd injected with language menu"
else
    echo "  WARNING: startnet.cmd.template not found"
fi

wimlib-imagex unmount "$WIM_MOUNT" --commit
rmdir "$WIM_MOUNT"

# Copy customized boot.wim to TFTP
cp "$WINPE/boot.wim" "$TFTP/Boot/boot.wim"
echo "  boot.wim: $(du -h "$TFTP/Boot/boot.wim" | cut -f1)"

# --- 7. Copy iPXE binaries (secondary path) ---
echo ""
echo "[5/5] Setting up iPXE secondary path..."

for f in ipxe.efi undionly.kpxe snponly.efi; do
    if [ -f "/opt/ipxe/$f" ]; then
        cp "/opt/ipxe/$f" "$TFTP/$f"
        echo "  $f: $(du -h "$TFTP/$f" | cut -f1)"
    fi
done

# Copy wimboot if available (for iPXE WinPE path)
if [ -f /opt/ipxe/wimboot ]; then
    cp /opt/ipxe/wimboot "$TFTP/wimboot"
fi

# --- 8. Verify ---
echo ""
echo "============================================"
echo " Verification"
echo "============================================"
OK=true
for required in "$TFTP/bootx64.efi" "$TFTP/Boot/BCD" "$TFTP/Boot/boot.sdi" "$TFTP/Boot/boot.wim" "$GEN/win11/sources/install.wim"; do
    if [ -f "$required" ]; then
        printf "  %-40s %s\n" "$(basename "$required")" "$(du -h "$required" | cut -f1)"
    else
        printf "  %-40s MISSING\n" "$(basename "$required")"
        OK=false
    fi
done

echo ""
if [ "$OK" = true ]; then
    echo "Setup complete. PXE clients can now boot."
    echo ""
    echo "Primary boot path (Secure Boot OK):"
    echo "  UEFI → bootx64.efi → BCD → boot.wim → language menu → setup.exe"
    echo ""
    echo "Secondary boot path (requires Secure Boot disabled):"
    echo "  UEFI → ipxe.efi → boot.ipxe → API → dynamic menu"
else
    echo "WARNING: Some files are missing. Check the ISO and re-run."
fi
