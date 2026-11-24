#!/bin/sh
# Reports what the Linux build needs. Docker and QEMU are only needed for images.
set -eu
ok=1
for c in node npm git; do command -v $c >/dev/null && echo "found $c: $($c --version 2>/dev/null | head -1)" || { echo "missing $c"; ok=0; }; done
for c in docker qemu-img; do command -v $c >/dev/null && echo "found $c (images)" || echo "optional $c not found (needed only for the Docker or appliance image)"; done
[ $ok = 1 ] || { echo "Install the missing tools with your package manager, then run ./build.sh"; exit 3; }
