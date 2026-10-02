#!/bin/sh
set -eu
umask 077
base=/data/rd15-proxy
if [ "${1:-}" != _locked ]; then
    exec flock -w 3 -x "$base/manager.lock" /bin/sh "$0" _locked "$@"
fi
shift
case "${1:-}" in
    /tmp/rd15-manager-*) exec /usr/bin/lua "$base/manager.lua" "$1" ;;
    *) exit 2 ;;
esac
