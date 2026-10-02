#!/bin/sh
base=/data/rd15-proxy
if pidof mihomo >/dev/null; then
    exec /bin/sh "$base/firewall.sh" apply
fi
[ -f "$base/boot.enabled" ] || exit 0
(flock -n "$base/boot.lock" /bin/sh "$base/boot-start.sh") >/tmp/rd15-boot.log 2>&1 &
exit 0
