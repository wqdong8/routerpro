#!/bin/sh
set -eu
base=/data/rd15-proxy
attempt=0
while [ "$attempt" -lt 60 ]; do
    [ -f "$base/boot.enabled" ] || exit 0
    pidof mihomo >/dev/null && exit 0
    if ip -4 addr show br-lan | grep -q 'inet 192.168.31.1/'; then
        cp "$base/service.init" /etc/init.d/rd15-proxy
        chmod 755 /etc/init.d/rd15-proxy
        /etc/init.d/rd15-proxy start
        sleep 3
        pidof mihomo >/dev/null && exit 0
    fi
    attempt=$((attempt + 1))
    sleep 2
done
echo 'RouterPro boot startup timed out' >&2
exit 1
