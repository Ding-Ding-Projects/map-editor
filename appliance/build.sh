#!/bin/sh
# Builds the Map Editor appliance OS image: a small Alpine Linux that boots straight
# into Docker and runs the Map Editor web app image preloaded inside it.
# Outputs (in appliance/out):
#   map-editor-appliance-x86_64.img   raw disk, flash to USB for a spare PC
#   map-editor-appliance-x86_64.vmdk  disk for VMware and VirtualBox
#   map-editor-appliance-x86_64.ova   one-file import for VirtualBox and VMware
# Usage: sudo appliance/build.sh <docker-image-tar> <version>
# Needs: root (loop devices), qemu-img, sfdisk, mkfs.ext4, wget, sha256sum.
# Uses a loop device rather than NBD, which reports zero-size devices on some CI hosts.
set -eu
IMAGE_TAR=${1:?path to docker save tarball of the web app image}
VERSION=${2:?version, for example 0.1.0}
HERE=$(cd "$(dirname "$0")" && pwd)
OUT="$HERE/out"
ROOT="$OUT/rootfs"
RAW="$OUT/map-editor-appliance-x86_64.img"
mkdir -p "$OUT"

# Pinned tool: alpine-make-rootfs v0.7.2, checked by SHA-256 before use.
AMRF_URL=https://raw.githubusercontent.com/alpinelinux/alpine-make-rootfs/v0.7.2/alpine-make-rootfs
AMRF_SHA256=$(cut -d' ' -f1 "$HERE/tools.sha256")
wget -qO "$OUT/alpine-make-rootfs" "$AMRF_URL"
echo "$AMRF_SHA256  $OUT/alpine-make-rootfs" | sha256sum -c -
chmod +x "$OUT/alpine-make-rootfs"

mkdir -p "$OUT/payload"
cp "$IMAGE_TAR" "$OUT/payload/map-editor-image.tar"
echo "$VERSION" > "$OUT/payload/VERSION"

rm -rf "$ROOT"
"$OUT/alpine-make-rootfs" --branch v3.21 \
  --packages "alpine-base linux-lts syslinux docker openrc chrony e2fsprogs" \
  --fs-skel-dir "$OUT/payload" --fs-skel-chown root:root \
  --script-chroot "$ROOT" -- "$HERE/configure.sh"

# Disk: one bootable ext4 partition, BIOS boot through syslinux.
rm -f "$RAW"
truncate -s 4G "$RAW"
echo 'start=2048, type=83, bootable' | sfdisk -q "$RAW"
LOOP=$(losetup --find --show --partscan "$RAW")
cleanup() { for fs in sys proc dev; do umount "$OUT/mnt/$fs" 2>/dev/null || true; done; umount "$OUT/mnt" 2>/dev/null || true; losetup -d "$LOOP" 2>/dev/null || true; }
trap cleanup EXIT
for i in 1 2 3 4 5; do [ -b "${LOOP}p1" ] && break; partprobe "$LOOP" 2>/dev/null || true; sleep 1; done
mkfs.ext4 -q -L map-editor -O ^64bit "${LOOP}p1"
mkdir -p "$OUT/mnt"
mount "${LOOP}p1" "$OUT/mnt"
cp -a "$ROOT"/. "$OUT/mnt"/
echo 'LABEL=map-editor / ext4 defaults,noatime 0 1' > "$OUT/mnt/etc/fstab"
mkdir -p "$OUT/mnt/boot/syslinux"
cp "$ROOT"/usr/share/syslinux/*.c32 "$OUT/mnt/boot/syslinux/"
cat > "$OUT/mnt/boot/syslinux/syslinux.cfg" <<CFG
DEFAULT map-editor
TIMEOUT 10
LABEL map-editor
  LINUX /boot/vmlinuz-lts
  INITRD /boot/initramfs-lts
  APPEND root=LABEL=map-editor rootfstype=ext4 modules=ext4 quiet console=tty0 console=ttyS0,115200
CFG
# Use the image's own extlinux so the installer matches its boot modules.
for fs in dev proc sys; do mount --bind "/$fs" "$OUT/mnt/$fs"; done
chroot "$OUT/mnt" /sbin/extlinux --install /boot/syslinux
for fs in sys proc dev; do umount "$OUT/mnt/$fs"; done
umount "$OUT/mnt"
dd if="$ROOT/usr/share/syslinux/mbr.bin" of="$LOOP" bs=440 count=1 conv=notrunc status=none
losetup -d "$LOOP"
trap - EXIT

qemu-img convert -O vmdk -o subformat=streamOptimized "$RAW" "$OUT/map-editor-appliance-x86_64.vmdk"
VMDK_SIZE=$(stat -c %s "$OUT/map-editor-appliance-x86_64.vmdk")
sed -e "s/@VERSION@/$VERSION/g" -e "s/@VMDK_SIZE@/$VMDK_SIZE/g" "$HERE/appliance.ovf" > "$OUT/map-editor-appliance-x86_64.ovf"
( cd "$OUT" && sha256sum map-editor-appliance-x86_64.ovf map-editor-appliance-x86_64.vmdk | sed 's/^\([0-9a-f]*\)  \(.*\)$/SHA256(\2)= \1/' > map-editor-appliance-x86_64.mf \
  && tar -cf map-editor-appliance-x86_64.ova map-editor-appliance-x86_64.ovf map-editor-appliance-x86_64.vmdk map-editor-appliance-x86_64.mf )
( cd "$OUT" && sha256sum map-editor-appliance-x86_64.img map-editor-appliance-x86_64.ova > SHA256SUMS )
echo "Built appliance $VERSION:"; cat "$OUT/SHA256SUMS"
