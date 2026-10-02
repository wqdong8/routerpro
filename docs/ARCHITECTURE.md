# Architecture and Deployment

[English](ARCHITECTURE.md) | [切换为中文](ARCHITECTURE.zh-CN.md)

## Design

RouterPro runs a Mihomo core and uhttpd on Xiaomi BE3600 2.5G (RD15) stock firmware. It uses root SSH rather than flashing firmware. The tested environment is firmware 1.0.87, ARMv7, an OpenWrt 18.06-derived system and Linux 5.4.

The executable, legacy dashboard and country rules live in a privately prepared compressed SquashFS bundle. `service.init` mounts the bundle read-only and starts Mihomo, the device-policy synchronizer and the console. The binary bundle is outside this source repository.

The browser reads authenticated Lua CGI endpoints for devices/settings and uses Bearer authentication for the core API. The console uses HTTP Basic authentication. This LAN deployment has no additional HTTPS termination layer.

## Per-Device Routing

MAC addresses identify devices; DHCP leases supply current IP addresses. Global mode prepends a source-IP rule pointing to the main group. Rule mode retains the original routing rules. Direct mode excludes the device from interception.

The firewall manages its own `RD15P_*` chains. TCP goes to redirect port 7892, selected DNS goes to 1053, and UDP uses `rd15tun`, mark `0x180` and route table 180. Selected public IPv6 forwarding is blocked to avoid bypass. Native DHCP and shared DNS configuration are retained.

An optional private `/data/rd15-proxy/protected-mac` file holds the MAC of a device that must stay direct. The worker, device endpoint and firewall read the same setting; no personal device address is hardcoded in source. An empty file disables fixed-device protection. The code-update script migrates older hardcoded protection into this private file before replacing the old code.

## Configuration Writes

Private `base.json` is authoritative; `settings.json` stores device modes, imported share links, pins and subscriptions. Effective `config.yaml` uses JSON syntax accepted by the core YAML decoder.

1. CGI authenticates the request and writes a private asynchronous job file.
2. `manager.sh` acquires a lock to serialize configuration changes.
3. `manager.lua` generates a candidate and validates it using Mihomo `-t`.
4. The worker saves state, reloads the core and applies scoped firewall rules.
5. Reload/application failures restore previous configuration, settings and device lists.

The browser polls job progress. Management password changes update the management account and restart only the console Web service; proxy credentials remain separate.

## Nodes, Groups and Subscriptions

The browser parses VLESS, VMess, Trojan, Shadowsocks and Hysteria2 share links. The worker checks fields again, then validates the resulting configuration with the core. Batch imports use one candidate; duplicate names or invalid nodes reject the whole write.

Subscriptions use native `proxy-providers`, including core V2Ray conversion and Clash parsing. Requests go directly from the router to the source with a `clash.meta` User-Agent. No external subscription conversion service is used. Each source prefixes its node names to avoid collisions.

Each subscription creates a selector group; groups can also use subscription providers directly. Provider nodes are maintained through the source rather than edited locally. Scheduled updates are handled by the core, and manual updates use asynchronous jobs. Failed downloads/parsing retain the existing provider nodes. At most five subscriptions are allowed, with a 512 KiB response limit each.

## UI and Validation

The frontend is plain JavaScript and CSS, without a build step. It uses separate node/group/subscription views and device-grouped connections. Columns, page state and test results use browser storage.

Live traffic prefers WebSocket data, with rates calculated from existing connection-counter polls as a fallback. The chart begins on the left and keeps a one-minute window, interpolating linearly between samples.

Buttons, menus, dialogs and views use short transitions. Save operations have disabled/loading states. System reduced-motion preferences disable animations.

Playwright checks desktop/mobile layouts, forms, toggles, node operations, column alignment/resizing and chart pixels. Live checks exercise group CRUD, provider updates, failed-update retention and selected-node preservation. Router integration checks may briefly interrupt proxy connections.

## Updating the Existing Installation

Persistent files live in `/data/rd15-proxy`; runtime files live in `/tmp/rd15-proxy`. Source code maps as follows:

| Repository | Router |
| --- | --- |
| `router/*` | `/data/rd15-proxy/` |
| `web/*` | `/data/rd15-proxy/web/` |

```sh
export ROUTERPRO_SSH_HOST=rd15
# Optional: reuse an already authenticated SSH control connection.
export ROUTERPRO_CONTROL_PATH=/path/to/ssh-control-socket
sh tools/deploy.sh
```

The script stages code, checks Lua syntax and restores CGI executable permissions. It only updates source files; it does not overwrite private configuration, change accounts, restart the core or reboot the router. Lua CGI endpoints must have executable permissions (`755`). Service/boot script changes take effect when those scripts are next invoked.

Initial deployment additionally needs the core bundle, runtime configuration, account files, uhttpd authentication configuration and device lists. `tools/prepare_config.py` prepares an initial config; it is not a complete installer, and its output must not overwrite an existing deployment's authoritative state.

```sh
python3 -m pip install -r tools/requirements.txt
python3 tools/prepare_config.py /private/clash.yaml /private/router-state --transparent
```

Keep credentials and node data outside Git. `access.json` contains proxy/admin credentials and the controller secret; `httpd.conf` contains console authentication configuration. Private files require restricted permissions. Tests read credentials from `ROUTERPRO_ACCESS`; live subscription fixtures also require `ROUTERPRO_FIXTURE_HOST`, with optional `ROUTERPRO_CONTROL_PATH` for SSH reuse.

## Boot and Limits

Stock firmware rebuilds `/etc` on boot. A persistent UCI firewall include invokes `boot-hook.sh`, which restores the service according to `boot.enabled`. Disabling that flag does not stop the running service.

- Configuration reloads can briefly reconnect proxied flows.
- Existing static snapshots need a managed source before they can update.
- HTTP response tests do not prove native Telegram connectivity or download speed.
- Go memory limits are soft; the router has limited memory and flash storage.
- Boot flags/hooks were tested, but an actual reboot was not performed.
- This is an installation-specific source repository, not a universal installer.
