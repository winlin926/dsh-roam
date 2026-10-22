# dsh-roam

把电脑上的 DeepSeek Harness 会话漫游到手机：扫码即可在手机浏览器继续当前对话，同一 Wi-Fi 内直连，也能通过公网入口在外远程访问，无需安装 App。

## 它能给你什么

- **不用装 App**：手机浏览器扫码即用，页面和电脑端是同一套界面语言。
- **离开电脑也能接着聊**：在家／办公室同一 Wi-Fi 下直连电脑；打开公网入口后，不在同一网络也能用手机继续。
- **看到的就是这台电脑的会话**：手机端列出本机会话，可以继续已有对话、新建会话、切换模型、发送与取消。
- **默认不敞开门**：设置面板的接口只接受本机回环请求；局域网靠二维码里的一次性配对令牌进场；公网入口必须再输 6 位连接密码。

## 怎么用

1. 在 DSH 里打开 **设置 → 连接手机**。
2. 手机连同一个 Wi-Fi，用相机或浏览器扫面板上的二维码。
3. 需要在外网使用：打开面板里的 **公网入口**，等隧道建立后再扫码；也可以填一个固定公网域名，此时临时隧道自动停用。
4. 可选：设置 6 位连接密码（公网入口必须输入，已连接的手机改密码后需要重新输入）。

### 用 AI-HUB 手机 App 连同一个地址

不需要另装或启用 dsh-mobile-plugin。打开 AI-HUB，协议选 `https`，地址填同一个域名
（例如 `dsh.sanlin.xin`），配对码填面板上显示的 6 位连接密码。浏览器页面和 App
共用同一个地址、同一个配对码；`/api/mobile/*` 由 dsh-roam 内嵌的移动 API 直接处理，
设备凭据和旧版 dsh-mobile 配对记录继续有效。

## 工作原理

- 插件在电脑上起一个只给手机用的 Web 服务，默认端口 `43128`，被占用时自动往后找空闲端口。
- 手机页面通过 WebSocket 连回 DSH 主机，配对令牌写在二维码里；令牌过期或已用完时，面板会换一张新码。
- 公网入口优先用 cloudflared 快速隧道（首次启用会把 cloudflared 下载到数据目录），失败时可以切到 pinggy 兜底。
- 设置面板读写的 `/phone-bridge/*` 路由是回环专属，并且校验同源，避免别的网页诱导本机开隧道或改密码。
- `/api/mobile/*` 由 dsh-roam 内嵌的 dsh-mobile 移动 API 处理，使用设备凭据鉴权；其余路径仍然走本插件的配对闸门。不会启动 dsh-mobile 的 sidecar、relay 或 18787 端口。

## 数据与端口

| 项目 | 位置 |
| --- | --- |
| 数据目录 | `%USERPROFILE%\.dsh\dsh-roam`（设置了 `DSH_HOME` 时跟随它） |
| `settings.json` | 固定公网域名等设置 |
| `mobile-pairing-pin.json` | 浏览器与 AI-HUB 共用的固定 6 位连接密码 |
| `relay.json` / `relay-device-credentials.json` | `%USERPROFILE%\.dsh\` 下的兼容身份与设备凭据，升级后保留已配对设备 |
| `bin/` | 下载的 cloudflared |
| 端口 | 默认 43128，占用时自动顺延，面板显示实际端口 |

## 开发

```
src/index.js        宿主入口：注册路由、启动手机桥接
src/client.js       设置页「连接手机」面板（浏览器模块）
src/bridge/*.ts     桥接实现：配对、手机页面、隧道、设置读写
lib/                构建产物（tsc 编译 + client.js 原样复制），git 忽略，不手改
test/               测试（引用 lib，即要发布的产物）
```

```bash
pnpm build   # 清空 lib，tsc 编译 src/，client.js 原样复制
pnpm test    # 先 build，再跑全部测试
```

约定：`src/` 是唯一源码；`lib/` 只由构建生成；测试跑构建产物，所以构建失败等于测试失败。

`dsh-mobile-plugin@0.1.92` 是内部运行依赖，只提供 AI-HUB 的移动 API 路由和凭据实现；不要在 DSH profile 里单独启用它。上游模块的兼容边界集中在 `src/bridge/mobile-api-host.ts`，升级版本前先跑契约测试。

`src/client.js` 由 DSH 当普通 `<script>` 加载，必须保持经典脚本：一旦被编译进 `export {}`，浏览器会直接抛 `Unexpected token 'export'`，设置页整块白屏。因此它不参与 tsc 编译，构建时原样复制，`test/browser-client.test.ts` 守住“产物与源码逐字节一致、且不含顶层模块语法”。

## 装进 DSH

profile 里用本地链接依赖，改完代码 `pnpm build`，在 DSH 里重载插件即可生效：

```json
"dsh-roam": "link:F:/AIData/deepseekdata/dsh-roam"
```

## 排错

- **手机打不开二维码里的地址**：确认手机和电脑在同一 Wi-Fi，并且电脑防火墙放行该端口。
- **公网入口一直转圈**：多半是 cloudflared 下载失败（网络或代理问题），改用 pinggy 兜底或填固定域名。
- **二维码提示失效**：面板会重新生成配对令牌，刷新后重新扫。
- **端口不是 43128**：43128 被占用时插件会自动顺延，以面板显示的端口为准。
