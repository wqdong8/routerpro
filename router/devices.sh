#!/bin/sh
set -eu

base=/data/rd15-proxy
pc=$(cat "$base/protected-mac" 2>/dev/null | tr 'A-F' 'a-f' | tr -d '\r\n' || true)
if [ "${1:-}" != _locked ]; then
    exec flock -x "$base/devices.lock" /bin/sh "$0" _locked "$@"
fi
shift
action=${1:-list}
mac=$(printf '%s' "${2:-}" | tr 'A-F' 'a-f')
touch "$base/devices.list"
case "$action" in
    add|remove)
        printf '%s\n' "$mac" | grep -Eq '^([0-9a-f]{2}:){5}[0-9a-f]{2}$' || exit 2
        [ "$mac" != "$pc" ] || exit 3
        cp "$base/devices.list" "$base/devices.previous"
        awk -v mac="$mac" '$0 != mac' "$base/devices.list" > "$base/devices.next"
        [ "$action" != add ] || printf '%s\n' "$mac" >> "$base/devices.next"
        mv "$base/devices.next" "$base/devices.list"
        if ! "$base/firewall.sh" apply; then
            mv "$base/devices.previous" "$base/devices.list"
            "$base/firewall.sh" apply || true
            exit 4
        fi
        rm -f "$base/devices.previous"
        ;;
    list) cat "$base/devices.list" ;;
    clear)
        : > "$base/devices.list"
        "$base/firewall.sh" stop
        ;;
    *) exit 1 ;;
esac
