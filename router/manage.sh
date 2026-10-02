#!/bin/sh
set -eu

base=/data/rd15-proxy
runtime=/tmp/rd15-proxy
case "${1:-status}" in
    start)
        cp "$base/service.init" /etc/init.d/rd15-proxy
        chmod 755 /etc/init.d/rd15-proxy
        /etc/init.d/rd15-proxy start
        ;;
    stop)
        [ ! -x /etc/init.d/rd15-proxy ] || /etc/init.d/rd15-proxy stop
        ;;
    restart)
        "$0" stop
        "$0" start
        ;;
    status)
        ubus call service list '{"name":"rd15-proxy"}'
        awk '/MemTotal:|MemAvailable:/ {print}' /proc/meminfo
        df -h "$base"
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status}" >&2
        exit 1
        ;;
esac
