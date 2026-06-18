#!/usr/bin/env bash
# build-iam-os-dev-image.sh
# Build the iam-os DEV image: take the stock v0.1.0 release (no sshd/networking)
# and bake in openssh-server + systemd-networkd DHCP + systemd-resolved +
# a single root authorized_key. Native amd64 chroot surgery on an x86_64 host.
#
# Usage:
#   sudo ./build-iam-os-dev-image.sh <pubkey-file> [release-url] [output-img]
set -euo pipefail

PUBKEY_FILE="${1:?usage: build-iam-os-dev-image.sh <pubkey-file> [release-url] [output-img]}"
RELEASE_URL="${2:-https://github.com/clubeedg-ship-it/iam-os/releases/download/v0.1.0/iam-os-0.1.0-amd64.img.gz}"
OUT_IMG="${3:-/srv/iam-os/iam-os-dev.img}"
WORKDIR="$(dirname "$OUT_IMG")"
STOCK_GZ="$WORKDIR/stock.img.gz"

[ -f "$PUBKEY_FILE" ] || { echo "pubkey file not found: $PUBKEY_FILE" >&2; exit 1; }
PUBKEY="$(cat "$PUBKEY_FILE")"

command -v parted >/dev/null || apt-get install -y parted e2fsprogs gdisk

mkdir -p "$WORKDIR"
if [ ! -f "$STOCK_GZ" ]; then
  echo ">> Downloading stock release..."
  curl -fL -o "$STOCK_GZ" "$RELEASE_URL"
fi

echo ">> Decompressing to $OUT_IMG"
gunzip -c "$STOCK_GZ" > "$OUT_IMG"

echo ">> Growing image + root partition (~512M headroom)"
truncate -s +512M "$OUT_IMG"
LOOP="$(losetup -Pf --show "$OUT_IMG")"
MNT=""
cleanup() {
  [ -n "$MNT" ] && {
    umount "$MNT/dev/pts" "$MNT/dev" "$MNT/sys" "$MNT/proc" "$MNT" 2>/dev/null || true
    rmdir "$MNT" 2>/dev/null || true
  }
  losetup -d "$LOOP" 2>/dev/null || true
}
trap cleanup EXIT

sgdisk -e "$LOOP" 2>/dev/null || true
parted -s "$LOOP" resizepart 2 100% || true
partprobe "$LOOP" || true
sleep 1

ROOT="${LOOP}p2"
echo ">> fsck + resize2fs $ROOT"
e2fsck -fy "$ROOT" || true
resize2fs "$ROOT"

MNT="$(mktemp -d)"
mount "$ROOT" "$MNT"
mount --bind /proc "$MNT/proc"
mount --bind /sys  "$MNT/sys"
mount --bind /dev  "$MNT/dev"
mount --bind /dev/pts "$MNT/dev/pts"

# Working DNS inside the chroot (stock image symlinks resolv.conf at the
# systemd-resolved stub, which is not present until we install it).
rm -f "$MNT/etc/resolv.conf"
printf "nameserver 8.8.8.8\nnameserver 1.1.1.1\n" > "$MNT/etc/resolv.conf"

# Config files written from the host side (avoids fragile nested heredocs).
mkdir -p "$MNT/etc/systemd/network" "$MNT/etc/ssh/sshd_config.d" "$MNT/root/.ssh"
printf "[Match]\nName=en* eth*\n\n[Network]\nDHCP=yes\n" > "$MNT/etc/systemd/network/10-dhcp.network"
printf "PermitRootLogin prohibit-password\nPasswordAuthentication no\n" > "$MNT/etc/ssh/sshd_config.d/10-iam-dev.conf"
chmod 700 "$MNT/root/.ssh"
printf "%s\n" "$PUBKEY" > "$MNT/root/.ssh/authorized_keys"
chmod 600 "$MNT/root/.ssh/authorized_keys"

echo ">> chroot: install sshd + resolved, enable units"
chroot "$MNT" /bin/bash -euxo pipefail -c "
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y openssh-server systemd-resolved
systemctl enable ssh systemd-networkd systemd-resolved
ln -sf /run/systemd/resolve/stub-resolv.conf /etc/resolv.conf
"

echo ">> Cleanup"
sync
cleanup
trap - EXIT
echo ">> DONE: $OUT_IMG"
