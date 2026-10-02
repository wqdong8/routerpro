#!/bin/sh
umask 077
request=$1
if ! /bin/sh /data/rd15-proxy/manager.sh "$request"; then
    if [ ! -s "$request.response" ]; then
        RD15_JOB_RESPONSE="$request.response" /usr/bin/lua -e 'local j=require("cjson");local f=io.open(os.getenv("RD15_JOB_RESPONSE"),"w");f:write(j.encode({error="Manager busy; retry shortly"}));f:close()'
    fi
fi
rm -f "$request" "$request.progress"
