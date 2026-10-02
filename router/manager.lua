local json = require("cjson")
local base = "/data/rd15-proxy/"
local function read(path)
    local f = io.open(path, "r")
    if not f then return "" end
    local s = f:read("*a"); f:close(); return s
end
local function write(path, value)
    local f = assert(io.open(path, "w")); f:write(value); f:close()
end
local function decode(path, fallback)
    local s = read(path)
    if s == "" then return fallback end
    return assert(json.decode(s))
end
local function copy(value) return json.decode(json.encode(value)) end
local request_path = arg[1]
local response_path = request_path .. ".response"
local function progress(stage) write(request_path .. ".progress", json.encode({pending=true,stage=stage})) end
local function main()
    local pc = read(base .. "protected-mac"):match("^%s*(%x%x:%x%x:%x%x:%x%x:%x%x:%x%x)%s*$")
    if pc then pc=pc:lower() end
    local request = decode(request_path, {})
    local access = decode(base .. "access.json")
    assert(request.csrf == access.controller_secret, "Invalid request token")
    if request.action == "boot" then
        assert(type(request.enabled) == "boolean", "Invalid boot setting")
        if request.enabled then write(base .. "boot.enabled", "enabled\n")
        else os.remove(base .. "boot.enabled") end
        return {ok=true}
    end
    if request.action == "credentials" then
        assert(request.currentPassword == (access.admin_password or access.proxy_password), "Current password is incorrect")
        assert(type(request.username) == "string" and #request.username >= 1 and #request.username <= 32 and request.username:match("^[%w_.-]+$"), "Invalid username")
        assert(type(request.password) == "string" and #request.password >= 10 and #request.password <= 128 and not request.password:find("[^ -~]"), "Password must be 10-128 printable ASCII characters")
        local random = assert(io.open("/dev/urandom", "r")); local salt = random:read(4); random:close()
        salt = salt:gsub(".", function(c) return string.format("%02x", c:byte()) end)
        local hash = require("nixio").crypt(request.password, "$1$" .. salt .. "$")
        assert(hash and hash:sub(1,3) == "$1$", "Password hashing failed")
        if request.dryRun == true then return {ok=true} end
        local previous_access = read(base .. "access.json")
        access.admin_user = request.username; access.admin_password = request.password
        write(base .. "access.next.json", json.encode(access))
        write(base .. "httpd.next.conf", "/:" .. request.username .. ":" .. hash .. "\n")
        local fs = require("nixio.fs")
        fs.chmod(base .. "access.next.json", "600"); fs.chmod(base .. "httpd.next.conf", "600")
        assert(os.rename(base .. "access.next.json", base .. "access.json"), "Could not save account")
        if not os.rename(base .. "httpd.next.conf", base .. "httpd.conf") then
            write(base .. "access.json", previous_access); error("Could not save login configuration")
        end
        return {ok=true, reauthenticate=true}
    end
    local config = decode(base .. "base.json")
    local settings = decode(base .. "settings.json", {modes={}, nodes={}, defaultMode="rule"})
    settings.pins = settings.pins or {}
    settings.subscriptions = settings.subscriptions or {}
    config["proxy-providers"] = config["proxy-providers"] or {}
    local function validname(name)
        assert(type(name) == "string" and #name > 0 and #name < 120 and not name:find("[,/%c]"), "Invalid name")
        assert(name ~= "DIRECT" and name ~= "REJECT" and name ~= "GLOBAL" and name ~= "default", "Reserved name")
    end
    local function encodeurl(value) return (value:gsub("[^%w%-_.~]",function(c) return string.format("%%%02X",c:byte()) end)) end
    local function controller_header()
        write(base .. "controller.header", "Authorization: Bearer " .. access.controller_secret .. "\nContent-Type: application/json\n")
    end
    if request.action == "update-subscription" then
        assert(settings.subscriptions[request.name], "Subscription not found")
        controller_header(); progress("updating")
        local command = "curl --noproxy '*' -fsS --max-time 60 -X PUT -H @" .. base .. "controller.header 'http://192.168.31.1:9090/providers/proxies/" .. encodeurl(request.name) .. "' >/tmp/rd15-proxy/provider-update.log 2>&1"
        assert(os.execute(command) == 0, "Subscription update failed; existing nodes retained")
        return {ok=true}
    end
    if request.action == "pin-node" then
        assert(type(request.name) == "string" and type(request.pinned) == "boolean", "Invalid pin setting")
        local found = false
        for _,p in ipairs(config.proxies) do if p.name == request.name then found = true end end
        if not found then
            controller_header()
            os.execute("curl --noproxy '*' -fsS --max-time 8 -H @" .. base .. "controller.header 'http://192.168.31.1:9090/proxies' >/tmp/rd15-proxy/proxies-pin.json")
            local live = decode("/tmp/rd15-proxy/proxies-pin.json",{proxies={}})
            found = live.proxies and live.proxies[request.name] and not live.proxies[request.name].all
        end
        assert(found, "Node not found")
        settings.pins[request.name] = request.pinned and true or nil
        write(base .. "settings.next.json", json.encode(settings))
        assert(os.rename(base .. "settings.next.json", base .. "settings.json"), "Could not save pin setting")
        return {ok=true}
    end
    local devices = read(base .. "devices.list")
    local active_file = io.open(base .. "devices.active", "r")
    local previous_active = active_file and active_file:read("*a") or nil
    if active_file then active_file:close() end
    local previous_config = read(base .. "config.yaml")
    local previous_settings = read(base .. "settings.json")
    local previous_base = read(base .. "base.json")
    local removed_provider_path
    local main_group
    for _, g in ipairs(config["proxy-groups"]) do
        if g.name:find("节点选择", 1, true) then main_group = g end
    end
    assert(main_group, "Main policy group missing")
    local function validmode(mode) return mode == "inherit" or mode == "rule" or mode == "global" or mode == "direct" end
    local function validmac(mac) return type(mac) == "string" and mac:match("^%x%x:%x%x:%x%x:%x%x:%x%x:%x%x$") end
    if request.action == "save-group" then
        local g = request.group
        assert(type(g) == "table", "Invalid group"); validname(g.name)
        assert(g.type == "select" or g.type == "url-test" or g.type == "fallback" or g.type == "load-balance", "Invalid group type")
        if g.name == main_group.name then assert(g.type == "select","Main group must use manual selection") end
        assert(type(g.proxies) == "table" and type(g.use) == "table" and #g.proxies + #g.use > 0, "Select at least one member or subscription")
        assert(#g.proxies < 300 and #g.use <= 10, "Too many members")
        local members = {DIRECT=true,REJECT=true}
        for _,p in ipairs(config.proxies) do members[p.name]=true; assert(p.name ~= g.name, "Name conflicts with a node") end
        for _,p in ipairs(config["proxy-groups"]) do members[p.name]=true end
        for _,name in ipairs(g.proxies) do assert(members[name] and name ~= g.name,"Invalid group member") end
        for _,name in ipairs(g.use) do assert(config["proxy-providers"][name],"Subscription not found") end
        local original = request.original
        if original then assert(original == g.name,"Group names cannot be changed") end
        local nextgroup = {name=g.name,type=g.type}
        if #g.proxies > 0 then nextgroup.proxies=g.proxies end
        if #g.use > 0 then nextgroup.use=g.use end
        if g.type ~= "select" then
            assert(g.url == "https://www.gstatic.com/generate_204" or g.url == "https://www.youtube.com/generate_204" or g.url == "https://x.com/robots.txt","Invalid test target")
            assert(type(g.interval) == "number" and g.interval >= 60 and g.interval <= 86400,"Invalid test interval")
            nextgroup.url=g.url; nextgroup.interval=g.interval; nextgroup.lazy=true
            if g.type == "url-test" then nextgroup.tolerance=50 end
            if g.type == "load-balance" then nextgroup.strategy="consistent-hashing" end
        end
        local found=false
        for i,existing in ipairs(config["proxy-groups"]) do
            if existing.name == g.name then assert(original,"Group already exists");config["proxy-groups"][i]=nextgroup;found=true end
        end
        if original then assert(found,"Group not found") else config["proxy-groups"][#config["proxy-groups"]+1]=nextgroup;main_group.proxies=main_group.proxies or {};main_group.proxies[#main_group.proxies+1]=g.name end
    elseif request.action == "delete-group" or request.action == "delete-subscription" then
        local name=request.name; validname(name)
        assert(name ~= main_group.name,"Main policy group cannot be deleted")
        if request.action == "delete-subscription" then assert(settings.subscriptions[name],"Subscription not found") end
        for _,rule in ipairs(config.rules) do
            local parts={};for part in rule:gmatch("[^,]+") do parts[#parts+1]=part end
            local target=parts[#parts]=="no-resolve" and parts[#parts-1] or parts[#parts]
            assert(target ~= name,"Group is used by routing rules")
        end
        local found=false
        for i=#config["proxy-groups"],1,-1 do if config["proxy-groups"][i].name==name then table.remove(config["proxy-groups"],i);found=true end end
        assert(found,"Group not found")
        for _,g in ipairs(config["proxy-groups"]) do
            for i=#(g.proxies or {}),1,-1 do if g.proxies[i]==name then table.remove(g.proxies,i) end end
            if request.action == "delete-subscription" then for i=#(g.use or {}),1,-1 do if g.use[i]==name then table.remove(g.use,i) end end end
            assert(#(g.proxies or {})+#(g.use or {})>0,"Deletion would empty a group")
            if g.proxies and #g.proxies==0 then g.proxies=nil end
            if g.use and #g.use==0 then g.use=nil end
        end
        if request.action == "delete-subscription" then removed_provider_path=config["proxy-providers"][name].path;config["proxy-providers"][name]=nil;settings.subscriptions[name]=nil end
    elseif request.action == "save-subscription" then
        validname(request.name)
        assert(type(request.url)=="string" and #request.url<4096 and request.url:match("^https?://") and not request.url:find("[%s%c]"),"Invalid subscription URL")
        assert(request.interval==0 or request.interval==3600 or request.interval==21600 or request.interval==86400,"Invalid update interval")
        local original=request.original
        if original then assert(original==request.name and settings.subscriptions[original],"Subscription not found") end
        if not original then
            local count=0;for _ in pairs(settings.subscriptions) do count=count+1 end;assert(count<5,"At most five subscriptions on this router")
            for _,g in ipairs(config["proxy-groups"]) do assert(g.name~=request.name,"Group name already exists") end
            for _,p in ipairs(config.proxies) do assert(p.name~=request.name,"Node name already exists") end
        end
        local id=original and settings.subscriptions[original].id or tostring(os.time()) .. "-" .. tostring(math.random(1000,9999))
        local path=base .. "providers/" .. id .. ".yaml"
        require("nixio.fs").mkdir(base .. "providers", "700")
        config["proxy-providers"][request.name]={type="http",url=request.url,path=path,interval=request.interval,["size-limit"]=524288,header={["User-Agent"]={"clash.meta"}},override={["additional-prefix"]=request.name .. " · "},["health-check"]={enable=false,url="https://www.gstatic.com/generate_204",interval=0}}
        settings.subscriptions[request.name]={name=request.name,url=request.url,interval=request.interval,id=id}
        if not original then
            config["proxy-groups"][#config["proxy-groups"]+1]={name=request.name,type="select",use={request.name}}
            main_group.proxies=main_group.proxies or {}
            main_group.proxies[#main_group.proxies+1]=request.name
        end
    elseif request.action == "device" then
        assert(validmac(request.mac) and validmode(request.mode), "Invalid device policy")
        request.mac = request.mac:lower()
        assert(request.mac ~= pc, "This computer is protected")
        local known = false
        for line in read("/tmp/dhcp.leases"):gmatch("[^\r\n]+") do
            local mac = line:match("^%S+%s+(%S+)")
            if mac and mac:lower() == request.mac then known = true end
        end
        assert(known or devices:find(request.mac, 1, true), "Device not found")
        settings.modes[request.mac] = request.mode
        local list = {}
        for mac in devices:gmatch("[^\r\n]+") do
            if mac ~= request.mac then list[#list+1] = mac end
        end
        if request.mode ~= "direct" then list[#list+1] = request.mac end
        devices = table.concat(list, "\n") .. (#list > 0 and "\n" or "")
    elseif request.action == "default" then
        assert(request.mode == "rule" or request.mode == "global" or request.mode == "direct", "Invalid default mode")
        settings.defaultMode = request.mode
    elseif request.action == "save-node" or request.action == "import-nodes" then
        local entries=request.action=="import-nodes" and request.entries or {request}
        assert(type(entries)=="table" and #entries>0 and #entries<=50,"Import 1-50 nodes at a time")
        for _,entry in ipairs(entries) do
        local request=entry
        local node = request.node
        assert(type(node) == "table" and type(node.name) == "string", "Invalid node")
        assert(#node.name > 0 and #node.name < 180 and not node.name:find("[,\r\n]"), "Invalid node name")
        local types = {vless=true, vmess=true, trojan=true, ss=true, hysteria2=true}
        assert(types[node.type] and type(node.server) == "string" and #node.server < 254, "Unsupported node")
        assert(not node.server:find("[%s/%c]"), "Invalid server")
        assert(type(node.port) == "number" and node.port >= 1 and node.port <= 65535 and node.port % 1 == 0, "Invalid port")
        assert(type(request.uri) == "string" and #request.uri < 12000, "Invalid share link")
        assert(not node["dialer-proxy"] and not node["routing-mark"] and not node.interface, "Unsupported node fields")
        for _,g in ipairs(config["proxy-groups"]) do assert(g.name ~= node.name, "Name conflicts with policy group") end
        assert(node.name ~= "DIRECT" and node.name ~= "REJECT" and node.name ~= "GLOBAL", "Reserved node name")
        local old = request.original
        if old and old ~= "" then
            assert(settings.nodes[old], "Only imported nodes can be edited")
        else old = nil end
        local found = false
        for i,p in ipairs(config.proxies) do
            if p.name == node.name and p.name ~= old then error("Node name already exists") end
            if p.name == old then config.proxies[i] = node; found = true end
        end
        if old then assert(found, "Original node missing") else config.proxies[#config.proxies+1] = node end
        for _,g in ipairs(config["proxy-groups"]) do
            if old then
                for i,name in ipairs(g.proxies or {}) do if name == old then g.proxies[i] = node.name end end
            elseif g.name == main_group.name then g.proxies=g.proxies or {};g.proxies[#g.proxies+1] = node.name end
        end
        if old and old ~= node.name then
            for _,rule in ipairs(config.rules) do assert(not rule:find("," .. old .. "$"), "Node is referenced directly by a rule") end
            settings.nodes[old] = nil
            if settings.pins[old] then settings.pins[node.name] = true; settings.pins[old] = nil end
        end
        settings.nodes[node.name] = {uri=request.uri, name=node.name}
        end
    elseif request.action == "delete-node" then
        assert(type(request.name) == "string", "Invalid node name")
        local found = false
        for i=#config.proxies,1,-1 do
            if config.proxies[i].name == request.name then table.remove(config.proxies,i); found = true end
        end
        assert(found, "Node not found")
        for _,rule in ipairs(config.rules) do
            local parts = {}; for part in rule:gmatch("[^,]+") do parts[#parts+1] = part end
            local target = parts[#parts] == "no-resolve" and parts[#parts-1] or parts[#parts]
            assert(target ~= request.name, "Node is referenced directly by a rule")
        end
        for _,g in ipairs(config["proxy-groups"]) do
            for i=#(g.proxies or {}),1,-1 do if g.proxies[i] == request.name then table.remove(g.proxies,i) end end
            assert(#(g.proxies or {}) + #(g.use or {}) > 0, "Cannot empty a policy group")
        end
        settings.nodes[request.name] = nil
        settings.pins[request.name] = nil
    elseif request.action ~= "sync" then error("Unknown action") end
    local active = {}; for mac in devices:gmatch("[^\r\n]+") do active[mac] = true end
    local redirected = {}
    for mac in pairs(active) do
        local mode = settings.modes[mac]
        if not mode or mode == "inherit" then mode = settings.defaultMode or "rule" end
        if mode ~= "direct" and mac ~= pc then redirected[#redirected+1] = mac end
    end
    table.sort(redirected)
    local effective_devices = table.concat(redirected, "\n") .. (#redirected > 0 and "\n" or "")
    local effective = copy(config); effective.mode = "rule"
    local rules = {}
    for line in read("/tmp/dhcp.leases"):gmatch("[^\r\n]+") do
        local mac, ip = line:match("^%S+%s+(%S+)%s+(%S+)")
        if mac then
            mac = mac:lower()
            if active[mac] and mac ~= pc then
                local mode = settings.modes[mac]
                if not mode or mode == "inherit" then mode = settings.defaultMode or "rule" end
                if mode == "global" then rules[#rules+1] = "SRC-IP-CIDR," .. ip .. "/32," .. main_group.name end
                if mode == "direct" then rules[#rules+1] = "SRC-IP-CIDR," .. ip .. "/32,DIRECT" end
            end
        end
    end
    for _,rule in ipairs(config.rules) do rules[#rules+1] = rule end
    effective.rules = rules
    effective.tun["dns-hijack"] = nil
    if not next(effective["proxy-providers"]) then effective["proxy-providers"]=nil end
    -- Mihomo uses YAML decoding, which rejects JSON's optional escaped slash.
    local candidate = json.encode(effective):gsub("\\/", "/")
    if request.action == "sync" then
        local ok, previous = pcall(json.decode, previous_config)
        if ok and type(previous) == "table" and previous.mode == "rule" and
            json.encode(previous.rules) == json.encode(rules) and read(base .. "devices.active") == effective_devices then return {ok=true} end
    end
    write(base .. "config.next.json", candidate)
    progress("validating")
    local check = os.execute("SAFE_PATHS=/tmp/rd15-proxy/bundle GOMEMLIMIT=15MiB GOGC=20 /tmp/rd15-proxy/bundle/mihomo -t -d " .. base .. " -f " .. base .. "config.next.json >/tmp/rd15-proxy/manager-check.log 2>&1")
    assert(check == 0, "Node/configuration validation failed; previous configuration retained")
    if request.dryRun == true then
        os.remove(base .. "config.next.json")
        return {ok=true, firstRule=rules[1], ruleCount=#rules}
    end
    write(base .. "controller.header", "Authorization: Bearer " .. access.controller_secret .. "\nContent-Type: application/json\n")
    write(base .. "reload.json", json.encode({path=base .. "config.yaml"}))
    local reload_command = "curl --noproxy '*' -fsS --max-time 8 -X PUT -H @" .. base .. "controller.header --data-binary @" .. base .. "reload.json 'http://192.168.31.1:9090/configs?force=true' >/tmp/rd15-proxy/manager-reload.log 2>&1"
    local function rollback()
        write(base .. "config.yaml", previous_config)
        write(base .. "settings.json", previous_settings)
        write(base .. "base.json", previous_base)
        write(base .. "devices.list", read(base .. "devices.previous-manager"))
        if previous_active ~= nil then write(base .. "devices.active", previous_active)
        else os.remove(base .. "devices.active") end
        os.execute(reload_command)
        os.execute(base .. "firewall.sh apply >/dev/null 2>&1")
    end
    write(base .. "devices.previous-manager", read(base .. "devices.list"))
    progress("saving")
    write(base .. "config.yaml", candidate)
    write(base .. "base.json", json.encode(config))
    write(base .. "settings.json", json.encode(settings))
    write(base .. "devices.list", devices)
    write(base .. "devices.active", effective_devices)
    progress("reloading")
    if os.execute(reload_command) ~= 0 then rollback(); error("Configuration reload failed; changes rolled back") end
    if request.action == "save-subscription" then
        progress("updating")
        local command="curl --noproxy '*' -fsS --max-time 60 -X PUT -H @" .. base .. "controller.header 'http://192.168.31.1:9090/providers/proxies/" .. encodeurl(request.name) .. "' >/tmp/rd15-proxy/provider-update.log 2>&1"
        if os.execute(command) ~= 0 then rollback(); error("Subscription could not be loaded; changes rolled back") end
    end
    progress("applying")
    if os.execute(base .. "firewall.sh apply >/dev/null 2>&1") ~= 0 then rollback(); error("Device rules failed; changes rolled back") end
    os.remove(base .. "config.next.json"); os.remove(base .. "devices.previous-manager")
    if removed_provider_path and removed_provider_path:sub(1,#base+10)==base .. "providers/" then os.remove(removed_provider_path) end
    return {ok=true}
end
local ok, result = pcall(main)
if not ok then result = {error=tostring(result):gsub("^.-:%d+: ", "")} end
write(response_path, json.encode(result))
os.exit(ok and 0 or 1)
