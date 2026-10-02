# <img src="web/router.svg" width="38" alt="RouterPro 图标"> RouterPro

[🌐 English](README.md) | [🇨🇳 简体中文](README.zh-CN.md)

RouterPro 让 **小米 BE3600 2.5G（RD15）无需刷机，也能具备类似软路由的代理管理能力**。保留原厂系统，不增加额外主机，通过一个浏览器界面统一管理设备分流、代理节点、策略组和订阅更新。

🤗 推荐使用 AI 工具辅助部署和二次开发，根据自己的网络环境与使用需求定制 RouterPro。

## 📡 型号与访问

已验证设备使用原厂固件 **1.0.87**、ARMv7、OpenWrt 18.06 衍生系统和 Linux 5.4。Linux 可见内存约 176 MiB，与硬件标称容量不是同一个数值。

管理界面为 `http://192.168.31.1:9091/`；HTTP/SOCKS 代理端口为 `7890`，需要认证的核心接口端口为 `9090`。

本方案使用原厂系统解锁的 root SSH，方法参考 [这篇恩山论坛文章](https://www.right.com.cn/forum/thread-8485993-1-1.html)，没有刷入 OpenWrt。[Root SSH 与参考网页](docs/SSH.zh-CN.md) 介绍操作方式及连接命令。

## ✨ 用途与功能

- 每台设备独立选择规则分流、全局代理、直连或跟随默认；保护电脑固定直连，继续使用本机客户端。
- 节点分享链接导入、批量导入、手动节点编辑、删除、置顶、搜索、复制分享链接。
- 策略组支持手动选择、自动优选、故障切换和负载均衡，可以管理节点与订阅源成员。
- 原生 V2Ray/Clash 订阅，支持单独更新、全部更新及每小时、每六小时、每天更新。更新失败保留已有节点。
- 基础连通、YouTube、X 响应测试及排序，可批量测试、停止排队任务，最多两个节点并发。
- 规则查询、按设备归类的连接，以及带轮询回退的实时流量图。
- 设置支持开机自动启动、独立管理账号、密码显示/隐藏、取消修改、保存反馈和错误提示。
- 桌面与手机布局、可调整列宽、页面和测试结果保留、短时交互动画及减少动态效果兼容。

HTTP 测试测量响应时间，不是下载带宽。原有节点快照不会自动成为可更新订阅；需要在订阅页面添加受管理订阅。

## 🗂️ 目录结构

| 目录 | 用途 |
| --- | --- |
| `web/` | 前端页面、样式、图标和需要认证的 Lua CGI 接口 |
| `router/` | 配置管理、异步任务、防火墙、服务与启动恢复脚本 |
| `tools/` | 私有配置准备及面板打开工具 |
| `tests/` | 导入、界面、设置、流量与真实路由器测试 |
| `docs/` | 架构、部署约定及 root SSH 参考说明 |

为兼容现有运行环境，路由器内部路径、服务名和防火墙链仍使用 `rd15-proxy` / `RD15P_*`。

## 🖥️ 界面预览

![RouterPro 桌面概览与手机设置](docs/assets/preview.png)

[查看桌面原图](docs/assets/overview.png) · [查看手机原图](docs/assets/settings-mobile.png)

*全部使用合成演示数据，不包含真实账号、设备或订阅。*

## 🧪 本地验证

前端没有构建步骤：

```sh
npm install
npm test
npm run check
```

浏览器测试需要现有管理服务和仓库外的私有凭据文件：

```sh
npx playwright install chromium
export ROUTERPRO_ACCESS=/absolute/path/outside/repository/access.json
npm run test:ui
```

截图写入被 Git 忽略的 `artifacts/`。可用 `CHROME_EXECUTABLE` 指定现有浏览器。界面测试模拟写入操作，但会读取实际路由器，部分设备夹具与现有安装绑定。

`npm run test:router` 会创建并删除临时策略组和订阅，并真实重载配置，代理连接可能短暂重连。它需要 `rd15` SSH 别名及路由器可访问的 `ROUTERPRO_FIXTURE_HOST`。需要网络连续使用时不要运行这项测试。

## 🔐 部署与私有数据

这份代码针对现有安装，不是任意路由器的一键安装器。部署需要在私有环境准备 Mihomo SquashFS 包及运行配置。详见 [实现与部署说明](docs/ARCHITECTURE.zh-CN.md)。

Git 中没有真实密码、控制器密钥、订阅地址、节点配置和设备状态文件。私有数据及生成文件已加入忽略规则。解析测试中的 `example.com`、假 UUID 和测试密码都是合成数据。

Lucide 图标遵循 [ISC 许可](web/icons/LICENSE)。
