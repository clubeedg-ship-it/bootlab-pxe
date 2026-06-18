#!/usr/bin/env bash
# flash-usb.sh — USB fallback: write the iam-os dev image to a USB stick.
# Usage: sudo ./flash-usb.sh /dev/sdX [image]
#   image defaults to /srv/iam-os/iam-os-dev.img (raw) or .img.gz (compressed).
set -euo pipefail

DEV="${1:?usage: flash-usb.sh /dev/sdX [image]}"
IMG="${2:-/srv/iam-os/iam-os-dev.img}"

[ -b "$DEV" ] || { echo "Not a block device: $DEV" >&2; exit 1; }
case "$DEV" in
  /dev/sda|/dev/vda|/dev/nvme0n1) echo "Refusing to write to likely system disk $DEV" >&2; exit 1;;
esac

echo "About to OVERWRITE $DEV:"
lsblk -o NAME,SIZE,MODEL,TRAN "$DEV" || true
read -r -p "Type the device path again to confirm ($DEV): " CONFIRM
[ "$CONFIRM" = "$DEV" ] || { echo "Mismatch, aborting." >&2; exit 1; }

if [ "${IMG##*.}" = "gz" ]; then
  gunzip -c "$IMG" | dd of="$DEV" bs=4M status=progress conv=fsync
else
  dd if="$IMG" of="$DEV" bs=4M status=progress conv=fsync
fi
sync
echo "Done flashing $IMG -> $DEV"
