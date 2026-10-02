#!/bin/sh
set -eu
umask 077
base=/data/rd15-proxy
request=/tmp/rd15-manager-sync
while :; do
    signature=$(md5sum /tmp/dhcp.leases "$base/devices.list" "$base/settings.json" 2>/dev/null || true)
    if [ "$signature" != "${previous:-}" ] && pidof mihomo >/dev/null; then
        /usr/bin/lua -e 'local j=require("luci.json");local f=io.open("/data/rd15-proxy/access.json");local a=j.decode(f:read("*a"));f:close();io.write(j.encode({action="sync",csrf=a.controller_secret}))' > "$request"
        if /bin/sh "$base/manager.sh" "$request"; then previous=$signature; fi
        rm -f "$request" "$request.response"
    fi
    sleep 60
done
