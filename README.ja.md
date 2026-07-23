# TitanBot - 究極の Discord Bot

[English](README.md) · [简体中文](README.zh-CN.md) · **日本語**

**TitanBot** は、包括的なモデレーションツール、魅力的な経済システム、ユーティリティ機能などを通じてサーバー体験を向上させる、強力で多機能な Discord Bot です。最新の Discord.js v14 と PostgreSQL を使用して構築され、優れたパフォーマンスとデータの永続性を実現しています。

[![サポートサーバー](https://img.shields.io/badge/-Support%20Server-%235865F2?logo=discord&logoColor=white&style=flat-square&logoWidth=20)](https://discord.gg/8kJBYhTGW9)
[![Discord.js](https://img.shields.io/npm/v/discord.js?style=flat-square&labelColor=%23202225&color=%23202225&logo=npm&logoColor=white&logoWidth=20)](https://www.npmjs.com/package/discord.js)
![PostgreSQL](https://img.shields.io/badge/-PostgreSQL-%23336791?logo=postgresql&logoColor=white&style=flat-square&logoWidth=20)

## 目次

- [機能概要](#features-overview)
- [クイックセットアップ](#quick-setup)
- [手動インストール手順](#manual-installation-steps)
- [サポートサーバー](https://discord.gg/QnWNz2dKCE)
- [必要な Bot インテント](#bot-intents)
- [コントリビューション](CONTRIBUTING.md)

<a name="features-overview"></a>
## 機能概要

TitanBot は Discord サーバーの管理とコミュニティ交流に必要なツール一式を提供します。

<table>
<tr>
<td width="50%" valign="top">

### モデレーションと管理
- **一括操作** - ユーザーを一括で BAN またはキック
- **ユーザーノート** - 詳細なモデレーション記録を保存
- **ケース管理** - すべてのモデレーション操作を表示、追跡

### 経済システム
- **ショップとインベントリ** - アイテムを購入、管理
- **ギャンブル** - リスクを負って報酬を獲得
- **支払いシステム** - ユーザー間で送金

### お楽しみ機能
- **ランダムな豆知識** - 新しい知識を発見
- **指名手配ポスター** - 楽しい指名手配画像を作成
- **テキスト反転** - 任意のテキストを逆順に変換

### 高度なチケットシステム
- **担当と優先度** - スタッフによるチケット管理
- **チケット制限** - スパムを防止
- **記録システム** - チケット履歴を保存

### サーバー統計
- **メンバーカウンター** - メンバー数をリアルタイムで表示するチャンネル
- **ボイスカウンター** - ボイス統計を追跡
- **動的更新** - チャンネルをリアルタイムで更新

### リアクションロール
- **ロール割り当て** - ユーザー自身で割り当てられるロール
- **絵文字選択** - リアクション方式のシステム
- **複数ロール対応** - 複数のロールを選択可能

</td>
<td width="50%" valign="top">

### レベルと XP システム
- **XP 追跡** - メッセージに応じて XP を自動加算
- **レベルロール** - レベルに応じてロールを自動割り当て
- **カスタム設定** - レベルシステムをカスタマイズ

### プレゼント企画とイベント
- **複数の当選者** - 複数人が当選するプレゼント企画に対応
- **自動抽選** - 当選者を自動選出
- **再抽選システム** - 必要に応じて新しい当選者を選出

### 誕生日システム
- **誕生日の追跡** - 誕生日を見逃しません
- **自動お祝い通知** - 誕生日を自動でお祝い
- **タイムゾーン対応** - 世界中で正確に追跡

### ユーティリティツール
- **報告システム** - 問題をスタッフへ報告
- **Todo リスト** - 個人タスクを管理
- **最初のメッセージ** - チャンネルの最初のメッセージへ移動

### ウェルカムシステム
- **ウェルカムメッセージ** - 新規メンバーを歓迎
- **自動ロール** - 参加時にロールを割り当て
- **カスタム埋め込み** - メッセージをカスタマイズ

### 音楽
- **24 時間 365 日モード** - 音楽を常時再生
- **インタラクティブなボタンシステム** - ボタンで音楽を操作
- **すべてのプラットフォームに対応** - Spotify、Deezer、YouTube、Apple Music に対応

</td>
</tr>
</table>

<a name="quick-setup"></a>
## クイックセットアップ（非開発者向け）

### 動画チュートリアル
詳しい手順を確認するには、包括的なセットアップ動画をご覧ください。
[**TitanBot セットアップチュートリアル**](https://www.youtube.com/@TouchDisc)

## Docker デプロイ（推奨）

TitanBot は簡単にデプロイできるよう完全にコンテナ化されています。

1. **リポジトリをクローンします。**
   ```bash
   git clone https://github.com/codebymitch/TitanBot.git
   cd TitanBot
   ```

2. **環境変数を設定します。**
   ```bash
   cp .env.example .env
   ```
   最低限 `DISCORD_TOKEN`、`CLIENT_ID`、`GUILD_ID` を設定してください。Docker Compose は `POSTGRES_USER`、`POSTGRES_PASSWORD`、`POSTGRES_DB` も `.env` から読み込みます（デフォルト：`titanbot` / `password` / `titanbot`）。

3. **コンテナをビルドして起動します。**
   ```bash
   docker compose up -d --build
   ```

4. **状態を確認します。**
   ```bash
   docker compose ps
   curl http://localhost:3000/health
   ```

これにより Bot と PostgreSQL が起動します。Compose ファイルは同梱データベースに `POSTGRES_SSL=false` と `AUTO_MIGRATE=true` を設定します。音楽機能はデフォルトで `lavalink/nodes.json` に記載された公開 Lavalink v4 ノードを使用します。

### 音楽

音楽機能は [Lavalink v4](https://github.com/lavalink-devs/Lavalink) を [Riffy](https://github.com/riffy-rb/riffy) 経由で使用し、その仕組みは [Musicify](https://github.com/codebymitch/Musicify) と同様です。

1. デフォルトでは、Bot は [`lavalink/nodes.json`](lavalink/nodes.json) から複数の公開 v4 SSL ノードを読み込みます（提供元：[lavalink.darrennathanael.com](https://lavalink.darrennathanael.com/SSL/Lavalink-SSL/)）。ノードを追加または削除するには、このファイルを編集してください。
2. 代わりに Lavalink をセルフホストする場合は、`docker compose --profile local-lavalink up -d` を実行し、`.env` に単一ノード用の環境変数を設定します。
   ```env
   LAVALINK_HOST=lavalink
   LAVALINK_PORT=2333
   LAVALINK_PASSWORD=youshallnotpass
   LAVALINK_SECURE=false
   ```
   Bot がこれらの環境変数へフォールバックするように、`lavalink/nodes.json` を削除するか名前を変更してください。
3. `LAVALINK_NODES`（JSON 配列）でノードを直接上書きするか、`LAVALINK_NODES_FILE` で別のファイルを指定できます。
4. ボイスチャンネルから `/play <song>` を使用するか、再生せずに接続する場合は `/join` を使用します。プレフィックスのショートカットは、`join`、`np`、`leave`、`pause`、`resume`、`skip`、`stop`、`volume <0-100>`、`music <subcommand>` です。状態の確認には `/nowplaying` と `/queue`、ループ、シャッフル、シークなどの操作には `/music` を使用してください。

### GitHub Container Registry の使用

main ブランチへプッシュされるたびに、Bot が GitHub Container Registry へ自動公開されます。

```bash
docker pull ghcr.io/codebymitch/titanbot:main
```

<a name="manual-installation-steps"></a>
## 手動インストール手順

### 前提条件
- Node.js 20.10.0 以降
- PostgreSQL サーバー（推奨）、またはフォールバック用のインメモリストレージ
- 適切なインテントを設定した Discord Bot アプリケーション

1. **リポジトリをクローン**
   ```bash
   git clone https://github.com/codebymitch/TitanBot.git
   cd TitanBot
   ```

2. **依存関係をインストール**
   ```bash
   npm install
   ```

3. **環境変数を設定**
   ```bash
   cp .env.example .env
   ```
   構成に合わせて `.env` を編集してください（設定が必要なのは次の変数のみで、残りの変数はデフォルト値のままにします）。
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

   本番環境での注意事項：
   - `NODE_ENV=production`
   - 本番コンソールを見やすく保つには `LOG_LEVEL=warn`（重大な問題と起動状態のみ）を設定
   - より詳しい運用ログが必要な場合は `LOG_LEVEL=info` を設定
   - 選択した `PORT` がすでに使用中の場合、TitanBot は自動的に次のポートを試行

   環境オプションのリファレンス：
   - `NODE_ENV`：`development`、`production`、`test`（`production` 以外の値は非本番環境として扱われます）
   - `LOG_LEVEL`：`error`、`warn`、`info`、`http`、`verbose`、`debug`、`silly`
   - この Bot で使用できる `LOG_LEVEL` の別名：`warns`、`warning`、`warnings` → `warn`

   推奨する本番用 `.env`（簡単モードおよびデフォルトモード）：
   ```env
   NODE_ENV=production
   LOG_LEVEL=warn
   WEB_HOST=0.0.0.0
   PORT=3000
   PORT_RETRY_ATTEMPTS=5
   ```
   非技術系の運用担当者にも扱いやすいシンプルなログを保ちながら、起動状態やオンライン状態を明確に表示できます。
   ポート `3000` が使用中の場合、Bot は次に利用できるポートを自動的に試行します（最大 `PORT_RETRY_ATTEMPTS` 回）。

### 複数のサーバー

スラッシュコマンドは起動時に（`CLIENT_ID` を使用して）**グローバル**登録されるため、Bot は招待されたすべてのサーバーで動作します。`GUILD_ID` はセットアップ手順のためチュートリアル用 `.env` に残されていますが、コマンド登録には使用されません。

注意：
- グローバルスラッシュコマンドは、初回デプロイ時に反映まで最大 1 時間ほどかかる場合があります
- 各サーバーのデータ（設定、経済、チケット、レベル、ダッシュボード、警告など）は**分離**されています（すべてのキーは `guild:{guildId}:...` のスコープになります）
- 他のサーバーへ招待する場合は、[Discord Developer Portal](https://discord.com/developers/applications) で Bot が単一のギルドに制限されていないことを確認してください
- [Discord Developer Portal](https://discord.com/developers/applications) から OAuth2 招待 URL を生成してください（OAuth2 → URL Generator、スコープ：`bot` と `applications.commands`）

4. **PostgreSQL データベースをセットアップ**（任意、推奨）
   ```bash
   # Create database and user
   createdb titanbot
   createuser titanbot
   psql -c "ALTER USER titanbot PASSWORD 'yourpassword';"
   psql -c "GRANT ALL PRIVILEGES ON DATABASE titanbot TO titanbot;"
   ```

5. **データベースのセットアップを確認**
   ```bash
   npm run migrate:check
   ```

6. **Bot を起動**
   ```bash
   npm start
   ```

> **データベース移行に関する注意：** スキーマテーブルと従来のキーの移行は
> 起動時に**自動実行**されるため、**Railway** などのマネージドホスティングでは
> 手動の移行手順は不要です。デプロイまたは再起動するだけです。自動移行を無効にするには
> `AUTO_MIGRATE=false` を設定します。ローカルでは引き続き
> `node scripts/migrate-keys.js --dry-run`（プレビュー）または `node scripts/migrate-keys.js`
> を使用して手動でキーを移行できます。
<a name="bot-intents"></a>

## 必要な Bot インテント
TitanBot には次の Discord インテントが必要です。
- **Guilds**
- **Guild Messages**
- **Message Content**
- **Guild Members**
- **Guild Message Reactions**
- **Guild Voice States**
- **Direct Messages**
- **Bot**
- **Applications.commands**

### 必要な権限
- **チャンネルを表示**
- **メッセージを送信**
- **リンクを埋め込む**
- **ファイルを添付**
- **メッセージ履歴を読む**
- **メッセージを管理**
- **チャンネルを管理**
- **ロールを管理**
- **メンバーをキック**
- **メッセージを管理**
- **メンバーを BAN**
- **メンバーをモデレート**
- **接続**

## ライセンス

TitanBot は MIT License の下で公開されています。詳しくは [LICENSE](LICENSE) をご覧ください。

## 謝辞

Discord サーバーに TitanBot をお選びいただき、ありがとうございます。コミュニティからのフィードバックをもとに、継続的な改善と新機能の追加に取り組んでいます。

*最終更新：2026 年 5 月*
