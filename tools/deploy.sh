#!/bin/sh
set -eu

source_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
router_host=${ROUTERPRO_SSH_HOST:-rd15}
control_path=${ROUTERPRO_CONTROL_PATH:-none}
stage=/tmp/routerpro-deploy-$$
base=/data/rd15-proxy
ssh_router() { ssh -o "ControlPath=$control_path" "$router_host" "$@"; }

# Only upload source code. Private router state is never part of this deployment.
ssh_router "test -f $base/base.json && test -f $base/access.json && test -d $base/web && mkdir -m 700 $stage"
trap 'ssh_router "rm -rf $stage" >/dev/null 2>&1 || true' EXIT HUP INT TERM
scp -O -o "ControlPath=$control_path" "$source_dir"/router/* "$router_host:$stage/"
scp -O -r -o "ControlPath=$control_path" "$source_dir/web" "$router_host:$stage/"
ssh_router "lua -e 'assert(loadfile(\"$stage/manager.lua\")); assert(loadfile(\"$stage/web/cgi-bin/manage\")); assert(loadfile(\"$stage/web/cgi-bin/devices\"))'"
# Preserve legacy protection in private state before replacing older source code.
ssh_router "umask 077; lua -e 'local p=\"$base/protected-mac\"; local f=io.open(p); if f then f:close(); return end; f=assert(io.open(\"$base/manager.lua\")); local s=f:read(\"*a\"); f:close(); local mac=s:match(\"local pc = %c?\\\"([%x:]+)\\\"\"); f=assert(io.open(p,\"w\")); f:write(mac or \"\"); f:close()'"
ssh_router "cp $stage/*.sh $stage/manager.lua $stage/service.init $base/ && cp -R $stage/web/. $base/web/ && chmod 755 $base/*.sh $base/web/cgi-bin/devices $base/web/cgi-bin/manage"
printf '%s\n' 'RouterPro source deployed. Refresh the console to load the updated UI.'
