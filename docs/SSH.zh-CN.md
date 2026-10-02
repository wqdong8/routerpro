# 小米 BE3600 2.5G 的 Root SSH

[Switch to English](SSH.md) | [简体中文](SSH.zh-CN.md)

## 适用型号

当前安装对应 **小米 BE3600 2.5G，型号 RD15，原厂固件 1.0.87**，不是 GL.iNET GL-BE3600。**本项目使用的 root SSH 方法参考 [这篇恩山论坛文章](https://www.right.com.cn/forum/thread-8485993-1-1.html)。** 现有安装已经可以登录 root SSH。RouterPro 不负责解锁 SSH，也不会刷固件。

论坛参考方法描述的是 RD15 固件 1.0.87 的免拆机解锁。其他固件是否适用，需要查看原帖；源码仓库不能证明其他版本兼容。

## 解锁方法参考

[1.0.87 原帖](https://www.right.com.cn/forum/thread-8485993-1-1.html) 说明旧版 `start_binding` 的换行注入已被过滤，并提供了另一种输入方式。主要步骤为：

1. 连接路由器局域网，用路由器管理密码登录 `http://192.168.31.1/`。
2. 从登录后的 LuCI 地址读取当前会话的 `stok`。这是私有登录令牌，不能提交到 Git。
3. 按原帖发起四个请求：设置 `ssh_en=1`、提交 NVRAM、将 Dropbear 的 channel 检查改为 `debug`、启动 Dropbear。
4. 按 [较早的教程](https://www.right.com.cn/forum/forum.php?mod=viewthread&tid=8321180) 中的序列号方法或工具取得该设备的 root 密码，再以 root 登录。

以下请求改写自原帖，只使用占位令牌：

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

这是参考说明，不是部署脚本会执行的命令。已经能用 SSH 的设备不需要重复解锁。root 密码由设备决定，与 RouterPro 管理密码不同。这里没有真实序列号、密码或有效会话令牌。

## 以 Root 登录

现代 OpenSSH 连接该固件时可能需要允许旧的主机密钥算法：

```sh
ssh -o HostKeyAlgorithms=+ssh-rsa -o PubkeyAuthentication=no root@192.168.31.1
```

在提示中输入 root 密码，首次连接时核对路由器主机密钥指纹。这条命令没有关闭主机密钥校验。

可在私有 `~/.ssh/config` 中添加别名：

```sshconfig
Host rd15
    HostName 192.168.31.1
    User root
    Port 22
    HostKeyAlgorithms +ssh-rsa
    PubkeyAuthentication no
    ConnectTimeout 5
```

之后使用 `ssh rd15`。该配置不保存密码。原厂系统可能没有 SFTP，因此上传文件时使用旧式 SCP：`scp -O`。

SSH 固化与 RouterPro 自动启动是两件事。RouterPro 的启动挂钩只恢复应用服务，不负责解锁 SSH。本次安装工作没有通过实际重启验证它们的持久化行为。

## 参考网页

- [RD15 1.0.87 免拆开启 SSH 与固化讨论](https://www.right.com.cn/forum/thread-8485993-1-1.html)
- [较早的 RD15 教程与 root 密码参考](https://www.right.com.cn/forum/forum.php?mod=viewthread&tid=8321180)
- [xmir-patcher](https://github.com/openwrt-xiaomi/xmir-patcher)：论坛讨论提及的工具，使用前核对具体型号与固件支持。
- [wukongdaily/be3600](https://github.com/wukongdaily/be3600)：用于 GL.iNET GL-BE3600 的应用与界面定制，不是小米 RD15 的 SSH 解锁方法，也不是本项目的安装器。
- [Mihomo v1.19.17](https://github.com/MetaCubeX/mihomo/releases/tag/v1.19.17)：当前代理核心版本。
