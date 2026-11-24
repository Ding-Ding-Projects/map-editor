#!/bin/sh
# Builds the Map Editor appliance OS image: a small Alpine Linux that boots straight
# into Docker and runs the Map Editor web app image preloaded inside it.
# Outputs (in appliance/out):
#   map-editor-appliance-x86_64.img   raw disk, flash to USB for a spare PC
#   map-editor-appliance-x86_64.vmdk  disk for VMware and VirtualBox
#   map-editor-appliance-x86_64.ova   one-file import for VirtualBox and VMware
# Usage: sudo appliance/build.sh <docker-image-tar> <version>
# Needs: root (loop devices), qemu-img, tar, wget, sha256sum.
set -eu
IMAGE_TAR=${1:?path to docker save tarball of the web app image}
VERSION=${2:?version, for example 0.1.0}
HERE=$(cd "$(dirname "$0")" && pwd)
OUT="$HERE/out"
mkdir -p "$OUT"

# Pinned tool: alpine-make-vm-image v0.13.1, checked by SHA-256 before use.
AMVI_URL=https://raw.githubusercontent.com/alpinelinux/alpine-make-vm-image/v0.13.1/alpine-make-vm-image
AMVI_SHA256=${AMVI_SHA256:?set AMVI_SHA256 to the pinned checksum recorded in appliance/tools.sha256}
wget -qO "$OUT/alpine-make-vm-image" "$AMVI_URL"
echo "$AMVI_SHA256  $OUT/alpine-make-vm-image" | sha256sum -c -
chmod +x "$OUT/alpine-make-vm-image"

mkdir -p "$OUT/payload"
cp "$IMAGE_TAR" "$OUT/payload/map-editor-image.tar"
echo "$VERSION" > "$OUT/payload/VERSION"

RAW="$OUT/map-editor-appliance-x86_64.img"
"$OUT/alpine-make-vm-image" \
  --image-format raw --image-size 4G --arch x86_64 \
  --branch v3.21 \
  --packages "docker openrc chrony e2fsprogs-extra" \
  --fs-skel-dir "$OUT/payload" --fs-skel-chown root:root \
  --script-chroot \
  "$RAW" -- "$HERE/configure.sh"

qemu-img convert -O vmdk -o subformat=streamOptimized "$RAW" "$OUT/map-editor-appliance-x86_64.vmdk"
VMDK_SIZE=$(stat -c %s "$OUT/map-editor-appliance-x86_64.vmdk")
sed -e "s/@VERSION@/$VERSION/g" -e "s/@VMDK_SIZE@/$VMDK_SIZE/g" "$HERE/appliance.ovf" > "$OUT/map-editor-appliance-x86_64.ovf"
( cd "$OUT" && sha256sum map-editor-appliance-x86_64.ovf map-editor-appliance-x86_64.vmdk | sed 's/^\([0-9a-f]*\)  \(.*\)$/SHA256(\2)= \1/' > map-editor-appliance-x86_64.mf \
  && tar -cf map-editor-appliance-x86_64.ova map-editor-appliance-x86_64.ovf map-editor-appliance-x86_64.vmdk map-editor-appliance-x86_64.mf )
( cd "$OUT" && sha256sum map-editor-appliance-x86_64.img map-editor-appliance-x86_64.ova > SHA256SUMS )
echo "Built appliance $VERSION:"; cat "$OUT/SHA256SUMS"
