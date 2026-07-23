# TitanBot - 终极 Discord 机器人

[English](README.md) · **简体中文** · [日本語](README.ja.md)

**TitanBot** 是一款功能强大的全能型 Discord 机器人，旨在通过完善的管理工具、有趣的经济系统、实用功能等提升你的服务器体验。它采用现代化的 Discord.js v14 和 PostgreSQL 构建，以实现出色的性能与数据持久化。

[![支持服务器](https://img.shields.io/badge/-Support%20Server-%235865F2?logo=discord&logoColor=white&style=flat-square&logoWidth=20)](https://discord.gg/8kJBYhTGW9)
[![Discord.js](https://img.shields.io/npm/v/discord.js?style=flat-square&labelColor=%23202225&color=%23202225&logo=npm&logoColor=white&logoWidth=20)](https://www.npmjs.com/package/discord.js)
![PostgreSQL](https://img.shields.io/badge/-PostgreSQL-%23336791?logo=postgresql&logoColor=white&style=flat-square&logoWidth=20)

## 目录

- [功能概览](#features-overview)
- [快速设置](#quick-setup)
- [手动安装步骤](#manual-installation-steps)
- [支持服务器](https://discord.gg/QnWNz2dKCE)
- [必需的机器人意图](#bot-intents)
- [参与贡献](CONTRIBUTING.md)

<a name="features-overview"></a>
## 功能概览

TitanBot 为 Discord 服务器管理和社区互动提供了一整套工具：

<table>
<tr>
<td width="50%" valign="top">

### 管理与行政
- **批量操作** - 批量封禁或踢出用户
- **用户备注** - 保存详细的管理记录
- **事件管理** - 查看和追踪所有管理操作

### 经济系统
- **商店与库存** - 购买和管理物品
- **赌博** - 承担风险以赢取奖励
- **支付系统** - 在用户之间转账

### 趣味与娱乐
- **随机知识** - 学习新知识
- **通缉令** - 制作有趣的通缉令图片
- **文本反转** - 反转任意文本

### 高级工单系统
- **认领与优先级** - 工作人员工单管理
- **工单限制** - 防止滥用
- **记录系统** - 保存工单历史记录

### 服务器统计
- **成员计数器** - 实时显示成员数量的频道
- **语音计数器** - 追踪语音统计信息
- **动态更新** - 实时更新频道

### 反应身份组
- **身份组分配** - 用户可自行分配身份组
- **表情选择** - 基于反应的系统
- **多身份组支持** - 提供多个身份组选项

</td>
<td width="50%" valign="top">

### 等级与 XP 系统
- **XP 追踪** - 根据消息自动累积 XP
- **等级身份组** - 根据等级自动分配身份组
- **自定义配置** - 个性化等级系统

### 抽奖与活动
- **多位获奖者** - 支持多人获奖的抽奖
- **自动抽取** - 自动选出获奖者
- **重新抽取系统** - 必要时重新选出获奖者

### 生日系统
- **生日追踪** - 不再错过任何生日
- **自动公告** - 自动庆祝生日
- **时区支持** - 在全球范围内准确追踪

### 实用工具
- **举报系统** - 向工作人员举报问题
- **待办事项列表** - 管理个人任务
- **首条消息** - 跳转到频道的第一条消息

### 欢迎系统
- **欢迎消息** - 欢迎新成员
- **自动身份组** - 成员加入时自动分配身份组
- **自定义嵌入内容** - 个性化消息

### 音乐
- **全天候模式** - 全天候播放音乐
- **交互式按钮系统** - 通过按钮管理音乐
- **支持所有平台** - 支持 Spotify、Deezer、YouTube 和 Apple Music

</td>
</tr>
</table>

<a name="quick-setup"></a>
## 快速设置（推荐非开发者使用）

### 视频教程
如需详细的分步设置指南，请观看我们的完整视频教程：
[**TitanBot 设置教程**](https://www.youtube.com/@TouchDisc)

## Docker 部署（推荐）

TitanBot 已完全容器化，便于部署。

1. **克隆仓库：**
   ```bash
   git clone https://github.com/codebymitch/TitanBot.git
   cd TitanBot
   ```

2. **配置环境变量：**
   ```bash
   cp .env.example .env
   ```
   至少设置 `DISCORD_TOKEN`、`CLIENT_ID` 和 `GUILD_ID`。Docker Compose 还会读取 `POSTGRES_USER`、`POSTGRES_PASSWORD` 和 `POSTGRES_DB`，这些值来自 `.env`（默认值：`titanbot` / `password` / `titanbot`）。

3. **构建并启动容器：**
   ```bash
   docker compose up -d --build
   ```

4. **检查状态：**
   ```bash
   docker compose ps
   curl http://localhost:3000/health
   ```

这会启动机器人和 PostgreSQL。Compose 文件会为内置数据库设置 `POSTGRES_SSL=false` 和 `AUTO_MIGRATE=true`。音乐功能默认使用 `lavalink/nodes.json` 中的公共 Lavalink v4 节点。

### 音乐

音乐功能通过 [Lavalink v4](https://github.com/lavalink-devs/Lavalink) 和 [Riffy](https://github.com/riffy-rb/riffy) 实现，其方式与 [Musicify](https://github.com/codebymitch/Musicify) 类似。

1. 默认情况下，机器人会从 [`lavalink/nodes.json`](lavalink/nodes.json) 加载多个公共 v4 SSL 节点（来源为 [lavalink.darrennathanael.com](https://lavalink.darrennathanael.com/SSL/Lavalink-SSL/)）。编辑该文件即可添加或移除节点。
2. 若要自行托管 Lavalink，请运行 `docker compose --profile local-lavalink up -d`，并在 `.env` 中设置单节点环境变量：
   ```env
   LAVALINK_HOST=lavalink
   LAVALINK_PORT=2333
   LAVALINK_PASSWORD=youshallnotpass
   LAVALINK_SECURE=false
   ```
   删除 `lavalink/nodes.json` 或将其重命名，让机器人回退使用这些环境变量。
3. 可使用 `LAVALINK_NODES`（JSON 数组）直接覆盖节点，或通过 `LAVALINK_NODES_FILE` 指向另一个文件。
4. 在语音频道中使用 `/play <song>`，或使用 `/join` 连接但不播放。前缀快捷命令包括：`join`、`np`、`leave`、`pause`、`resume`、`skip`、`stop`、`volume <0-100>` 或 `music <subcommand>`。使用 `/nowplaying` 和 `/queue` 查看状态；使用 `/music` 控制循环、随机播放、跳转播放位置以及其他功能。

### 使用 GitHub Container Registry

每次推送到 main 分支时，机器人都会自动发布到 GitHub Container Registry。

```bash
docker pull ghcr.io/codebymitch/titanbot:main
```

<a name="manual-installation-steps"></a>
## 手动安装步骤

### 前提条件
- Node.js 20.10.0 或更高版本
- PostgreSQL 服务器（推荐），或使用内存存储作为后备方案
- 已正确配置意图的 Discord 机器人应用

1. **克隆仓库**
   ```bash
   git clone https://github.com/codebymitch/TitanBot.git
   cd TitanBot
   ```

2. **安装依赖项**
   ```bash
   npm install
   ```

3. **配置环境变量**
   ```bash
   cp .env.example .env
   ```
   根据你的配置编辑 `.env`（仅以下变量必须配置，其余变量保留默认值）：
   ```env
   # Discord Bot Configuration
   DISCORD_TOKEN=your_discord_bot_token_here
   CLIENT_ID=your_discord_client_id_here
   GUILD_ID=your_discord_guild_id_here

   # PostgreSQL Configuration (Primary Database)
   POSTGRES_URL=postgresql://postgres:yourpassword@localhost:5432/titanbot
   POSTGRES_HOST=localhost
   POSTGRES_PORT=5432
   POSTGRES_DB=titanbot
   POSTGRES_USER=postgres
   POSTGRES_PASSWORD=yourpassword
   ```

   生产环境注意事项：
   - `NODE_ENV=production`
   - 设置 `LOG_LEVEL=warn` 以保持生产环境控制台简洁（仅显示严重问题和启动状态）
   - 如需更详细的运行日志，请设置 `LOG_LEVEL=info`
   - 如果所选的 `PORT` 已被占用，TitanBot 会自动尝试后续端口

   环境选项参考：
   - `NODE_ENV`：`development`、`production`、`test`（任何非 `production` 值都会被视为非生产环境）
   - `LOG_LEVEL`：`error`、`warn`、`info`、`http`、`verbose`、`debug`、`silly`
   - 此机器人接受的 `LOG_LEVEL` 别名：`warns`、`warning`、`warnings` → `warn`

   推荐的生产环境 `.env`（简易模式与默认模式）：
   ```env
   NODE_ENV=production
   LOG_LEVEL=warn
   WEB_HOST=0.0.0.0
   PORT=3000
   PORT_RETRY_ATTEMPTS=5
   ```
   这样既会显示清晰的启动及在线状态消息，又能为非技术运维人员保持简洁的日志。
   如果端口 `3000` 正忙，机器人会自动尝试后续可用端口（最多尝试 `PORT_RETRY_ATTEMPTS` 次）。

### 多个服务器

斜杠命令会在启动时（通过 `CLIENT_ID`）进行**全局**注册，因此机器人能在其受邀加入的每个服务器中运行。`GUILD_ID` 仍保留在教程的 `.env` 中以用于设置步骤，但命令注册不会使用它。

注意：
- 全局斜杠命令在首次部署时最长可能需要约一小时才能完成传播
- 每个服务器的数据都**相互隔离**：配置、经济系统、工单、等级、仪表板、警告等（所有键都以 `guild:{guildId}:...` 为作用域）
- 如果计划邀请机器人加入其他服务器，请在 [Discord Developer Portal](https://discord.com/developers/applications) 中确保机器人未被限制为仅能加入一个公会
- 在 [Discord Developer Portal](https://discord.com/developers/applications) 中生成 OAuth2 邀请 URL（OAuth2 → URL Generator，作用域：`bot` 和 `applications.commands`）

4. **设置 PostgreSQL 数据库**（可选但推荐）
   ```bash
   # Create database and user
   createdb titanbot
   createuser titanbot
   psql -c "ALTER USER titanbot PASSWORD 'yourpassword';"
   psql -c "GRANT ALL PRIVILEGES ON DATABASE titanbot TO titanbot;"
   ```

5. **验证数据库设置**
   ```bash
   npm run migrate:check
   ```

6. **启动机器人**
   ```bash
   npm start
   ```

> **数据库迁移说明：** 架构表和旧版键迁移会在启动时
> **自动运行**，因此像 **Railway** 这样的托管平台无需手动执行
> 迁移步骤，只需部署或重启即可。要禁用自动迁移，请设置
> `AUTO_MIGRATE=false`。你仍然可以在本地使用
> `node scripts/migrate-keys.js --dry-run`（预览）或 `node scripts/migrate-keys.js`
> 手动执行键迁移。
<a name="bot-intents"></a>

## 必需的机器人意图
TitanBot 需要以下 Discord 意图：
- **Guilds**
- **Guild Messages**
- **Message Content**
- **Guild Members**
- **Guild Message Reactions**
- **Guild Voice States**
- **Direct Messages**
- **Bot**
- **Applications.commands**

### 必需权限
- **查看频道**
- **发送消息**
- **嵌入链接**
- **附加文件**
- **读取消息历史**
- **管理消息**
- **管理频道**
- **管理身份组**
- **踢出成员**
- **管理消息**
- **封禁成员**
- **管理成员**
- **连接**

## 许可证

TitanBot 基于 MIT 许可证发布。详情请参阅 [LICENSE](LICENSE)。

## 致谢

感谢你为 Discord 服务器选择 TitanBot！我们会根据社区反馈不断改进并添加新功能。

*最后更新：2026 年 5 月*
