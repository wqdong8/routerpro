# Root SSH on Xiaomi BE3600 2.5G

[English](SSH.md) | [切换为中文](SSH.zh-CN.md)

## Applicable Device

This installation is **Xiaomi BE3600 2.5G, model RD15, stock firmware 1.0.87**. It is not GL.iNET GL-BE3600. **The root SSH method used for this project follows [this Enshan forum article](https://www.right.com.cn/forum/thread-8485993-1-1.html).** The current installation already has working root SSH. RouterPro itself neither unlocks SSH nor flashes firmware.

The linked forum method reports an SSH unlock without opening the case on RD15 firmware 1.0.87. Firmware-specific unlock behavior must be checked against the source article; the source code repository does not establish compatibility with other firmware versions.

## Unlock Method Reference

The [1.0.87 forum article](https://www.right.com.cn/forum/thread-8485993-1-1.html) explains that older newline injection is filtered in `start_binding`, and describes a different input for enabling SSH. Its sequence is:

1. Connect to the router LAN and sign in to `http://192.168.31.1/` with the router management password.
2. Read the current session's `stok` from the authenticated LuCI URL. This is a private session token and must never be committed.
3. Follow the article's four requests: set `ssh_en=1`, commit NVRAM, change Dropbear's channel check to `debug`, then start Dropbear.
4. Determine the device-specific root password using the serial-number method/tool referenced in the [earlier article](https://www.right.com.cn/forum/forum.php?mod=viewthread&tid=8321180), then connect as root.

Example requests adapted from the article, with a placeholder token:

```sh
curl -X POST 'http://192.168.31.1/cgi-bin/luci/;stok=YOUR_STOK/api/xqsystem/start_binding' \
  --data-urlencode 'uid=1234' --data-urlencode "key=' <(nvram set ssh_en=1) #"
curl -X POST 'http://192.168.31.1/cgi-bin/luci/;stok=YOUR_STOK/api/xqsystem/start_binding' \
  --data-urlencode 'uid=1234' --data-urlencode "key=' <(nvram commit) #"
curl -X POST 'http://192.168.31.1/cgi-bin/luci/;stok=YOUR_STOK/api/xqsystem/start_binding' \
  --data-urlencode 'uid=1234' --data-urlencode "key=' <(sed -i 's/channel=.*/channel=\"debug\"/g' /etc/init.d/dropbear) #"
curl -X POST 'http://192.168.31.1/cgi-bin/luci/;stok=YOUR_STOK/api/xqsystem/start_binding' \
  --data-urlencode 'uid=1234' --data-urlencode "key=' <(/etc/init.d/dropbear start) #"
```

These are reference instructions, not commands run by RouterPro's deployment script. Do not repeat them on a router whose SSH already works. The root password is device-specific; it is not the RouterPro management password. No serial number, password or working session token is included here.

## Connect as Root

Modern OpenSSH may need the legacy host-key algorithm used by this firmware:

```sh
ssh -o HostKeyAlgorithms=+ssh-rsa -o PubkeyAuthentication=no root@192.168.31.1
```

Enter the root password at the prompt. Confirm the router's host-key fingerprint on the first connection. The command does not disable host-key checking.

For reuse, add an alias to your private `~/.ssh/config`:

```sshconfig
Host rd15
    HostName 192.168.31.1
    User root
    Port 22
    HostKeyAlgorithms +ssh-rsa
    PubkeyAuthentication no
    ConnectTimeout 5
```

Then run `ssh rd15`. Passwords are not stored in this block. Older vendor firmware may require legacy SCP (`scp -O`) because SFTP is unavailable.

SSH unlock persistence and RouterPro boot persistence are separate. RouterPro's startup hooks restore the application service; they are not an SSH unlock mechanism. An actual reboot verification has not been performed during this installation work.

## References

- [RD15 1.0.87: SSH unlock without disassembly and persistence discussion](https://www.right.com.cn/forum/thread-8485993-1-1.html)
- [Earlier RD15 procedure and root-password reference](https://www.right.com.cn/forum/forum.php?mod=viewthread&tid=8321180)
- [xmir-patcher](https://github.com/openwrt-xiaomi/xmir-patcher): linked in the forum discussion; verify support for the exact model/firmware.
- [wukongdaily/be3600](https://github.com/wukongdaily/be3600): a GL.iNET GL-BE3600 application/UI customization project, not the Xiaomi RD15 SSH unlock or this deployment's installer.
- [Mihomo v1.19.17](https://github.com/MetaCubeX/mihomo/releases/tag/v1.19.17): proxy core used in this installation.
