# 实现与部署说明

[Switch to English](ARCHITECTURE.md) | [简体中文](ARCHITECTURE.zh-CN.md)

## 整体做法

本项目在小米 BE3600 2.5G（RD15）原厂系统上运行 Mihomo 和 uhttpd，使用 root SSH，不刷固件。已验证环境为固件 1.0.87、ARMv7、OpenWrt 18.06 衍生系统和 Linux 5.4。

可执行文件、旧版核心面板及国家规则存放在私有的压缩 SquashFS 包中。`service.init` 只读挂载该包，启动核心、设备策略同步服务和管理界面。这个二进制包不属于源码仓库。

浏览器通过已认证的 Lua CGI 读取设备与设置，通过 Bearer 认证访问核心。管理界面使用 HTTP Basic，当前局域网部署没有额外的 HTTPS 终止层。

## 设备代理

设备由 MAC 地址标识，DHCP 租约提供当前 IP。全局模式添加源 IP 规则，指向主策略组；规则模式保留原有分流规则；直连设备不会进入代理拦截清单。

防火墙只管理独立的 `RD15P_*` 链。TCP 重定向至 7892，选中设备的 DNS 重定向至 1053，UDP 使用 `rd15tun`、标记 `0x180` 和路由表 180。选中设备的公共 IPv6 转发会被阻止以避免绕过代理。保留原生 DHCP 和共享 DNS 配置。

可选的私有 `/data/rd15-proxy/protected-mac` 文件保存必须直连的设备 MAC。配置管理、设备接口与防火墙读取同一配置，源码不写入个人设备地址。空文件表示不启用固定设备保护。代码更新脚本会先把旧版源码中的保护配置迁移到这个私有文件，再替换旧代码。

## 配置保存

私有 `base.json` 是基础配置；`settings.json` 保存设备模式、导入分享链接、置顶与订阅。有效 `config.yaml` 使用核心 YAML 解码器可接受的 JSON 语法。

1. CGI 校验身份与令牌，创建私有异步任务文件。
2. `manager.sh` 获取文件锁，串行执行配置修改。
3. `manager.lua` 生成候选配置，通过核心 `-t` 校验。
4. 保存状态，重载核心，再应用独立防火墙规则。
5. 重载或规则应用失败时，恢复旧配置、设置与设备清单。

浏览器轮询任务进度。管理密码修改只更新管理凭据并重启管理 Web 服务，代理账号独立保留。

## 节点、策略组与订阅

浏览器解析 VLESS、VMess、Trojan、Shadowsocks 和 Hysteria2 分享链接；后端再次检查字段，再通过核心校验。批量导入使用同一份候选配置，重名或无效节点会拒绝整个写入。

订阅使用核心原生 `proxy-providers`，包括 V2Ray 转换和 Clash 解析。路由器直接请求源地址，使用 `clash.meta` User-Agent，不把订阅交给外部转换服务。不同订阅给节点添加来源前缀，避免重名。

订阅会生成同名手动策略组，其他策略组也可以直接使用订阅源。订阅节点由上游源维护，不在本地手工编辑。核心执行定时更新，手动更新通过异步任务完成；下载或解析失败时保留现有节点。最多五个订阅，每个响应限制 512 KiB。

## 界面与验证

前端使用原生 JavaScript 和 CSS，没有构建步骤。节点页分为节点、策略组和订阅；连接页按设备归类。列宽、页面与部分测试结果使用浏览器存储。

实时流量优先使用 WebSocket，不可用时根据既有连接统计轮询的计数差计算速率。曲线从左边开始，保留一分钟窗口，在样本间线性更新。

按钮、菜单、弹窗和页面使用短时过渡；保存有禁用和加载状态。系统开启减少动态效果时关闭动画。

Playwright 验证桌面、手机布局、表单、开关、节点操作、表头对齐、列宽和流量图像素。真实集成检查覆盖策略组 CRUD、订阅更新、更新失败保留节点和当前选择保持不变。真实路由器测试可能让代理连接短暂重连。

## 更新现有安装

持久化目录为 `/data/rd15-proxy`，临时目录为 `/tmp/rd15-proxy`：

| 仓库 | 路由器 |
| --- | --- |
| `router/*` | `/data/rd15-proxy/` |
| `web/*` | `/data/rd15-proxy/web/` |

```sh
export ROUTERPRO_SSH_HOST=rd15
# 可选：复用已认证的 SSH 连接。
export ROUTERPRO_CONTROL_PATH=/path/to/ssh-control-socket
sh tools/deploy.sh
```

脚本先暂存代码、检查 Lua 语法，再恢复 CGI 执行权限。它只更新源码，不覆盖私有配置，不修改账号，不重启核心或路由器。Lua CGI 必须有 `755` 权限。服务与启动脚本的变更在下一次调用相应脚本时生效。

首次部署还需要私有核心包、运行配置、账号、uhttpd 认证配置和设备清单。`tools/prepare_config.py` 只是初始配置准备工具，不是完整安装器；输出不能覆盖现有安装的基础配置和用户状态。

```sh
python3 -m pip install -r tools/requirements.txt
python3 tools/prepare_config.py /private/clash.yaml /private/router-state --transparent
```

凭据和节点数据放在 Git 外。`access.json` 包含代理与管理凭据及控制器密钥，`httpd.conf` 保存管理端认证配置。私有文件应限制权限。测试通过 `ROUTERPRO_ACCESS` 读取凭据；真实订阅夹具还需要 `ROUTERPRO_FIXTURE_HOST`，SSH 可用 `ROUTERPRO_CONTROL_PATH` 复用连接。

## 启动与限制

原厂系统每次启动重建 `/etc`。持久化 UCI 防火墙 include 调用 `boot-hook.sh`，根据 `boot.enabled` 恢复服务。关闭标记不会立即停止正在运行的服务。

- 配置重载可能让代理连接短暂重连。
- 静态节点快照需要受管理来源才能更新。
- HTTP 响应测试不代表 Telegram 原生连通性或下载速度。
- Go 内存限制是软限制，路由器内存和闪存较少。
- 已验证启动标记和挂钩，没有进行实际重启验证。
- 本仓库针对现有安装，不是通用路由器安装器。
