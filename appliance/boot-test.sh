#!/bin/sh
# Boots the raw appliance image under QEMU and waits for the web app's health check.
set -eu
IMG=${1:?raw image}
qemu-system-x86_64 -m 2048 -smp 2 -nographic -drive file="$IMG",format=raw,if=virtio,snapshot=on \
  -netdev user,id=n0,hostfwd=tcp::18420-:8420 -device virtio-net-pci,netdev=n0 > boot.log 2>&1 &
QEMU=$!
trap 'kill $QEMU 2>/dev/null || true' EXIT
for i in $(seq 1 90); do
  if curl -fsS http://127.0.0.1:18420/api/health; then echo; echo "Appliance booted and answered its health check."; exit 0; fi
  sleep 5
done
echo "Appliance did not answer within 450 s. Last boot log lines:"; tail -50 boot.log; exit 1
