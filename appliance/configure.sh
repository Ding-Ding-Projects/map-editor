#!/bin/sh
# Runs inside the image while it is built (chroot). Keeps the system minimal.
set -eu
rc-update add docker default
rc-update add chronyd default
# Guest agents report the VM's network address to VMware (vmrun getGuestIPAddress) and VirtualBox
# (guest property /VirtualBox/GuestInfo/Net/0/V4/IP). Each exits quietly under other hypervisors.
for svc in open-vm-tools virtualbox-guest-additions; do
  if [ -x "/etc/init.d/$svc" ]; then rc-update add "$svc" default; echo "guest agent enabled: $svc"; else echo "guest agent service not found: $svc"; ls /etc/init.d | grep -i -E 'vm|vbox|virtualbox' || true; fi
done
rc-update add networking boot
rc-update add devfs sysinit
rc-update add mdev sysinit
rc-update add hwdrivers sysinit
rc-update add modules boot
rc-update add sysctl boot
rc-update add hostname boot
rc-update add bootmisc boot
rc-update add syslog boot
rc-update add mount-ro shutdown
rc-update add killprocs shutdown
# Serial console too, so the boot test and VM consoles show the banner.
echo 'ttyS0::respawn:/sbin/getty -L 115200 ttyS0 vt100' >> /etc/inittab
# Make sure the initramfs can mount the ext4 root.
sed -i 's/^features="/features="ext4 /' /etc/mkinitfs/mkinitfs.conf 2>/dev/null || true
mkinitfs $(ls /lib/modules | head -1)
cat > /etc/network/interfaces <<'NET'
auto lo
iface lo inet loopback
auto eth0
iface eth0 inet dhcp
NET
echo map-editor > /etc/hostname
mkdir -p /opt/map-editor /var/lib/map-editor/worlds
mv /map-editor-image.tar /opt/map-editor/image.tar
mv /VERSION /opt/map-editor/VERSION
install -m 0755 /dev/stdin /etc/init.d/map-editor <<'SVC'
#!/sbin/openrc-run
description="Map Editor web app"
depend() { need docker net; }
start_pre() {
  # The Docker service reports started before its socket answers; wait for it, up to 90 s.
  i=0
  until docker info >/dev/null 2>&1; do
    i=$((i + 1)); [ "$i" -ge 90 ] && { eerror "Docker did not become ready"; return 1; }
    sleep 1
  done
  # Load the preloaded image once, then keep using it (an update replaces image.tar).
  if [ ! -f /var/lib/map-editor/.loaded-$(cat /opt/map-editor/VERSION) ]; then
    docker load -i /opt/map-editor/image.tar && touch /var/lib/map-editor/.loaded-$(cat /opt/map-editor/VERSION)
  fi
}
start() {
  ebegin "Starting Map Editor"
  docker rm -f map-editor >/dev/null 2>&1 || true
  docker run -d --name map-editor --restart unless-stopped -p 8420:8420 \
    -v /var/lib/map-editor/data:/data -v /var/lib/map-editor/worlds:/worlds \
    ghcr.io/ding-ding-projects/map-editor:$(cat /opt/map-editor/VERSION)
  eend $?
  /usr/local/bin/map-editor-banner
}
stop() { ebegin "Stopping Map Editor"; docker stop map-editor; eend $?; }
SVC
rc-update add map-editor default
install -m 0755 /dev/stdin /usr/local/bin/map-editor-banner <<'BAN'
#!/bin/sh
IP=$(ip -4 -o addr show eth0 2>/dev/null | awk '{print $4}' | cut -d/ -f1)
{
  echo "Map Editor appliance $(cat /opt/map-editor/VERSION)"
  if [ -n "$IP" ]; then echo "Open http://$IP:8420/ from a computer on this network."; else echo "No network address yet. Check the cable or Wi-Fi."; fi
  echo "The first person to open it becomes the owner."
  echo
  echo "Quick tour of this appliance:"
  echo "  1. This screen: the version and the link above. It updates when the network changes."
  echo "  2. The link: open it in a browser on another computer to reach the editor."
  echo "  3. First visit: create the owner account, then follow the setup steps."
  echo "  4. In the editor, the ? button > Take a tour walks through every screen."
  echo "Nothing needs typing here; there is no console login."
  echo
} > /etc/issue
BAN
# No password login on the console; the appliance is managed from the web app.
passwd -l root
