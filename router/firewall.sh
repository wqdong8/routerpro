#!/bin/sh
set -eu

base=/data/rd15-proxy
pc=$(cat "$base/protected-mac" 2>/dev/null | tr 'A-F' 'a-f' | tr -d '\r\n' || true)
if [ -n "$pc" ]; then
    printf '%s\n' "$pc" | grep -Eq '^([0-9a-f]{2}:){5}[0-9a-f]{2}$' || { echo 'Invalid protected-mac configuration' >&2; exit 2; }
fi
active_devices="$base/devices.list"
if [ -f "$base/devices.active" ]; then active_devices="$base/devices.active"; fi
if [ "${1:-}" != _locked ]; then
    exec flock -x "$base/firewall.lock" /bin/sh "$0" _locked "$@"
fi
shift
ipt() { iptables -w 5 "$@"; }
ipt6() { ip6tables -w 5 "$@"; }

remove_jump() {
    family=$1 table=$2 parent=$3 chain=$4
    while "$family" -t "$table" -C "$parent" -i br-lan -j "$chain" 2>/dev/null; do
        "$family" -t "$table" -D "$parent" -i br-lan -j "$chain"
    done
}

stop_rules() {
    remove_jump ipt nat PREROUTING RD15P_NAT
    remove_jump ipt mangle PREROUTING RD15P_MARK
    remove_jump ipt filter FORWARD RD15P_FWD
    remove_jump ipt6 nat PREROUTING RD15P_DNS6
    remove_jump ipt6 filter FORWARD RD15P_V6
    for chain in RD15P_NAT RD15P_TCP; do
        ipt -t nat -F "$chain" 2>/dev/null || true
    done
    for chain in RD15P_NAT RD15P_TCP; do
        ipt -t nat -X "$chain" 2>/dev/null || true
    done
    for chain in RD15P_MARK RD15P_UDP; do
        ipt -t mangle -F "$chain" 2>/dev/null || true
    done
    for chain in RD15P_MARK RD15P_UDP; do
        ipt -t mangle -X "$chain" 2>/dev/null || true
    done
    ipt -F RD15P_FWD 2>/dev/null || true
    ipt -X RD15P_FWD 2>/dev/null || true
    ipt6 -t nat -F RD15P_DNS6 2>/dev/null || true
    ipt6 -t nat -X RD15P_DNS6 2>/dev/null || true
    ipt6 -F RD15P_V6 2>/dev/null || true
    ipt6 -X RD15P_V6 2>/dev/null || true
    ip rule del priority 18000 fwmark 0x180/0xffffffff table 180 2>/dev/null || true
    ip route del default dev rd15tun table 180 2>/dev/null || true
}

apply_rules() {
    stop_rules
    pidof mihomo >/dev/null || return 0
    [ -s "$active_devices" ] || return 0
    trap 'stop_rules' EXIT HUP INT TERM
    for chain in RD15P_NAT RD15P_TCP; do ipt -t nat -N "$chain"; done
    for chain in RD15P_MARK RD15P_UDP; do ipt -t mangle -N "$chain"; done
    ipt -N RD15P_FWD
    ipt6 -t nat -N RD15P_DNS6
    ipt6 -N RD15P_V6
    if [ -n "$pc" ]; then
        ipt -t nat -A RD15P_NAT -m mac --mac-source "$pc" -j RETURN
        ipt -t mangle -A RD15P_MARK -m mac --mac-source "$pc" -j RETURN
        ipt -A RD15P_FWD -m mac --mac-source "$pc" -j RETURN
        ipt6 -t nat -A RD15P_DNS6 -m mac --mac-source "$pc" -j RETURN
        ipt6 -A RD15P_V6 -m mac --mac-source "$pc" -j RETURN
    fi
    for network in 0.0.0.0/8 10.0.0.0/8 100.64.0.0/10 127.0.0.0/8 169.254.0.0/16 172.16.0.0/12 192.168.0.0/16 224.0.0.0/4 240.0.0.0/4; do
        ipt -t nat -A RD15P_TCP -d "$network" -j RETURN
        ipt -t mangle -A RD15P_UDP -d "$network" -j RETURN
    done
    ipt -t nat -A RD15P_TCP -p tcp -j REDIRECT --to-ports 7892
    ipt -t mangle -A RD15P_UDP -p udp --dport 53 -j RETURN
    ipt -t mangle -A RD15P_UDP -p udp -j MARK --set-xmark 0x180/0xffffffff
    ipt -t mangle -A RD15P_UDP -p udp -j ACCEPT
    ip route add default dev rd15tun table 180
    ip rule add priority 18000 fwmark 0x180/0xffffffff table 180
    while IFS= read -r mac; do
        grep -Fxq "$mac" "$base/devices.list" || continue
        [ "$mac" != "$pc" ] || continue
        printf '%s\n' "$mac" | grep -Eq '^([0-9a-f]{2}:){5}[0-9a-f]{2}$' || continue
        for protocol in udp tcp; do
            ipt -t nat -A RD15P_NAT -m mac --mac-source "$mac" -p "$protocol" --dport 53 -j REDIRECT --to-ports 1053
            ipt6 -t nat -A RD15P_DNS6 -m mac --mac-source "$mac" -p "$protocol" --dport 53 -j REDIRECT --to-ports 1053
        done
        ipt -t nat -A RD15P_NAT -m mac --mac-source "$mac" -p tcp -j RD15P_TCP
        ipt -t mangle -A RD15P_MARK -m mac --mac-source "$mac" -p udp -j RD15P_UDP
        ipt -A RD15P_FWD -m mac --mac-source "$mac" -o rd15tun -p udp -j ACCEPT
        # Selected clients use IPv4 proxying; public IPv6 must not bypass it.
        for network in fc00::/7 fe80::/10 ff00::/8; do
            ipt6 -A RD15P_V6 -m mac --mac-source "$mac" -d "$network" -j RETURN
        done
        ipt6 -A RD15P_V6 -m mac --mac-source "$mac" -j REJECT
    done < "$active_devices"
    ipt -t nat -I PREROUTING 1 -i br-lan -j RD15P_NAT
    ipt -t mangle -I PREROUTING 1 -i br-lan -j RD15P_MARK
    ipt -I FORWARD 1 -i br-lan -j RD15P_FWD
    ipt6 -t nat -I PREROUTING 1 -i br-lan -j RD15P_DNS6
    ipt6 -I FORWARD 1 -i br-lan -j RD15P_V6
    trap - EXIT HUP INT TERM
}

case "${1:-apply}" in
    apply) apply_rules ;;
    apply-later)
        sleep 2
        if pidof mihomo >/dev/null; then apply_rules; fi
        ;;
    stop) stop_rules ;;
    *) exit 1 ;;
esac
