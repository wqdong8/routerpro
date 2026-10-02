import argparse
import json
import os
import secrets
from pathlib import Path

import yaml


parser = argparse.ArgumentParser()
parser.add_argument("subscription", type=Path)
parser.add_argument("output", type=Path)
parser.add_argument("--transparent", action="store_true")
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True)
os.chmod(args.output, 0o700)
access_path = args.output / "access.json"
if access_path.exists():
    access = json.loads(access_path.read_text())
else:
    access = {
        "proxy_user": "rd15",
        "proxy_password": secrets.token_urlsafe(12),
        "controller_secret": secrets.token_urlsafe(24),
    }
    access_path.write_text(json.dumps(access, indent=2) + "\n")
    os.chmod(access_path, 0o600)

config = yaml.safe_load(args.subscription.read_text())
if not isinstance(config, dict) or not config.get("proxies"):
    raise ValueError("The subscription must contain Clash proxies")
config.update({
    "mixed-port": 7890,
    "allow-lan": True,
    "bind-address": "192.168.31.1",
    "lan-allowed-ips": ["192.168.31.0/24"],
    "mode": "rule",
    "log-level": "warning",
    "external-controller": "192.168.31.1:9090",
    "external-ui": "/tmp/rd15-proxy/bundle/ui",
    "secret": access["controller_secret"],
    "authentication": [access["proxy_user"] + ":" + access["proxy_password"]],
    "ipv6": False,
    "find-process-mode": "off",
    "dns": {"enable": False},
    "profile": {"store-selected": True, "store-fake-ip": False},
    "tun": {"enable": False},
    "geodata-mode": False,
    "geo-auto-update": False,
})
for key in ("redir-port", "tproxy-port", "external-ui-url", "listeners"):
    config.pop(key, None)
for group in config.get("proxy-groups", []):
    if group.get("type") in ("url-test", "fallback", "load-balance"):
        group["type"] = "select"
        for key in ("url", "interval", "tolerance", "lazy", "strategy"):
            group.pop(key, None)

# A compact local country rule avoids downloading a full GeoIP database.
rules = []
for rule in config.get("rules", []):
    fields = rule.split(",")
    if fields[0] == "GEOIP" and fields[1].lower() == "cn":
        fields[:2] = ["RULE-SET", "cn-ip"]
        fields = [field for field in fields if field != "resolve"]
        rule = ",".join(fields)
    rules.append(rule)
config["rules"] = rules
config.setdefault("rule-providers", {})["cn-ip"] = {
    "type": "file",
    "behavior": "ipcidr",
    "format": "mrs",
    "path": "/tmp/rd15-proxy/bundle/cn.mrs",
}
if args.transparent:
    config["redir-port"] = 7892
    config["tun"] = {
        "enable": True,
        "device": "rd15tun",
        "stack": "system",
        "auto-route": False,
        "auto-redirect": False,
        "auto-detect-interface": False,
        "dns-hijack": [],
        "mtu": 1400,
    }
    config["dns"] = {
        "enable": True,
        "listen": "[::]:1053",
        "ipv6": False,
        "enhanced-mode": "fake-ip",
        "fake-ip-range": "198.18.0.1/16",
        "fake-ip-filter": ["*.lan", "*.local", "localhost", "+.miwifi.com"],
        "default-nameserver": ["223.5.5.5", "119.29.29.29"],
        "proxy-server-nameserver": ["223.5.5.5", "119.29.29.29"],
        "direct-nameserver": ["223.5.5.5", "119.29.29.29"],
        "nameserver": ["https://1.1.1.1/dns-query#" + config["proxy-groups"][0]["name"]],
    }
config_path = args.output / "config.yaml"
config_path.write_text(yaml.safe_dump(config, allow_unicode=True, sort_keys=False))
os.chmod(config_path, 0o600)
print("Prepared configuration:", len(config["proxies"]), "nodes,", len(rules), "rules")
