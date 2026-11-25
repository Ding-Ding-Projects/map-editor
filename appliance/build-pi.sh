#!/bin/sh
# Builds the Raspberry Pi 4 / 5 appliance image (arm64): a FAT boot partition with the Pi firmware,
# kernel and device trees, and an ext4 root with Alpine, Docker and the Map Editor image inside.
# Usage: sudo appliance/build-pi.sh <map-editor-image-arm64.tar> <version>
# Runs on an x86_64 build machine through qemu-user (binfmt) for the arm64 package scripts.
set -eu
IMAGE_TAR=${1:?arm64 image tar}
VERSION=${2:?version, for example 0.1.40}
HERE=$(cd "$(dirname "$0")" && pwd)
OUT="$HERE/out"
ROOT="$OUT/pi-rootfs"
IMG="$OUT/map-editor-appliance-rpi-arm64.img"
mkdir -p "$OUT"

# Pinned tool, checked by SHA-256 before use (same as the x86_64 build).
AMRF_URL=https://raw.githubusercontent.com/alpinelinux/alpine-make-rootfs/v0.7.2/alpine-make-rootfs
AMRF_SHA256=$(cut -d' ' -f1 "$HERE/tools.sha256")
[ -x "$OUT/alpine-make-rootfs" ] || { wget -qO "$OUT/alpine-make-rootfs" "$AMRF_URL"; echo "$AMRF_SHA256  $OUT/alpine-make-rootfs" | sha256sum -c -; chmod +x "$OUT/alpine-make-rootfs"; }

# Same payload layout as the x86_64 build: configure.sh moves these into /opt/map-editor.
rm -rf "$OUT/pi-payload"; mkdir -p "$OUT/pi-payload"
cp "$IMAGE_TAR" "$OUT/pi-payload/map-editor-image.tar"
echo "$VERSION" > "$OUT/pi-payload/VERSION"

# The arm64 package index is signed with Alpine's aarch64 keys. Take them from the alpine-keys
# package, installed (and signature-checked) into a tiny native rootfs first.
rm -rf "$OUT/keys-rootfs"
"$OUT/alpine-make-rootfs" --branch v3.21 --mirror-uri https://dl-cdn.alpinelinux.org/alpine --packages "alpine-keys" "$OUT/keys-rootfs"
KEYS="$OUT/keys-rootfs/usr/share/apk/keys/aarch64"
ls "$KEYS"/*.pub >/dev/null

rm -rf "$ROOT"
# alpine-make-rootfs v0.7.2 has no --arch option; apk itself installs arm64 packages with --arch.
APK_OPTS="--no-progress --arch aarch64" "$OUT/alpine-make-rootfs" --branch v3.21 \
  --mirror-uri https://dl-cdn.alpinelinux.org/alpine --keys-dir "$KEYS" \
  --packages "alpine-base linux-rpi raspberrypi-bootloader docker openrc chrony e2fsprogs dosfstools" \
  --fs-skel-dir "$OUT/pi-payload" --fs-skel-chown root:root \
  --script-chroot "$ROOT" -- "$HERE/configure.sh"

# The Pi firmware looks for these on the boot partition; fail early if a package changed layout.
for f in start4.elf fixup4.dat vmlinuz-rpi initramfs-rpi; do [ -e "$ROOT/boot/$f" ] || { echo "missing /boot/$f"; ls "$ROOT/boot"; exit 1; }; done

rm -f "$IMG"
truncate -s 4G "$IMG"
# Boot (FAT, 256 MiB), system (ext4, about 2.75 GiB) and a separate data partition (ext4) for accounts,
# history, notes and worlds, so the system can be replaced without touching data.
printf 'start=2048, size=524288, type=c, bootable\nstart=526336, size=5767168, type=83\nstart=6293504, type=83\n' | sfdisk -q "$IMG"
LOOP=$(losetup --find --show --partscan "$IMG")
cleanup() { umount "$OUT/pi-boot" 2>/dev/null || true; umount "$OUT/pi-mnt" 2>/dev/null || true; losetup -d "$LOOP" 2>/dev/null || true; }
trap cleanup EXIT
# The partition devices can take a moment to appear on busy runners.
for i in $(seq 1 30); do [ -b "${LOOP}p1" ] && [ -b "${LOOP}p2" ] && [ -b "${LOOP}p3" ] && break; partprobe "$LOOP" 2>/dev/null || true; udevadm settle 2>/dev/null || true; sleep 1; done
[ -b "${LOOP}p1" ] && [ -b "${LOOP}p2" ] && [ -b "${LOOP}p3" ] || { echo "partitions of $LOOP did not appear"; lsblk "$LOOP"; exit 1; }
mkfs.vfat -F 32 -n MEBOOT "${LOOP}p1" >/dev/null
mkfs.ext4 -q -L map-editor "${LOOP}p2"
mkfs.ext4 -q -L me-data "${LOOP}p3"

mkdir -p "$OUT/pi-mnt" "$OUT/pi-boot"
mount "${LOOP}p2" "$OUT/pi-mnt"
cp -a "$ROOT"/. "$OUT/pi-mnt"/
mount "${LOOP}p1" "$OUT/pi-boot"
# Firmware, kernel and initramfs at the top of the boot partition; device trees and overlays beside them.
cp -r "$ROOT"/boot/. "$OUT/pi-boot"/ 2>/dev/null || true
if [ -d "$ROOT/boot/dtbs-rpi" ]; then cp -r "$ROOT"/boot/dtbs-rpi/. "$OUT/pi-boot"/; rm -rf "$OUT/pi-boot/dtbs-rpi"; fi
find "$OUT/pi-boot" -name 'bcm2711-rpi-4-b.dtb' | grep -q . || { echo 'no Pi 4 device tree'; exit 1; }
cat > "$OUT/pi-boot/config.txt" <<CFG
# Map Editor appliance $VERSION for Raspberry Pi 4 and 5
arm_64bit=1
kernel=vmlinuz-rpi
initramfs initramfs-rpi followkernel
enable_uart=1
disable_overscan=1
CFG
echo 'root=LABEL=map-editor rootfstype=ext4 modules=ext4 rootwait quiet console=serial0,115200 console=tty1' > "$OUT/pi-boot/cmdline.txt"
printf 'LABEL=map-editor / ext4 defaults,noatime 0 1\nLABEL=MEBOOT /boot vfat defaults,noatime 0 2\nLABEL=me-data /var/lib/map-editor ext4 defaults,noatime 0 2\n' > "$OUT/pi-mnt/etc/fstab"
mkdir -p "$OUT/pi-data" && mount "${LOOP}p3" "$OUT/pi-data" && cp -a "$OUT/pi-mnt/var/lib/map-editor"/. "$OUT/pi-data"/ && umount "$OUT/pi-data"
# The root keeps its own /boot empty; the boot partition is mounted there at runtime.
rm -rf "$OUT/pi-mnt/boot"/*
ls "$OUT/pi-boot" | head -40
umount "$OUT/pi-boot"; umount "$OUT/pi-mnt"
losetup -d "$LOOP"
trap - EXIT

xz -T0 -f -k "$IMG"
( cd "$OUT" && sha256sum "$(basename "$IMG").xz" > SHA256SUMS-rpi )
echo "Built Raspberry Pi appliance $VERSION:"; cat "$OUT/SHA256SUMS-rpi"
