<p align="center"><img src="./app/assets/images/SealCircle.png" width="140" height="140" alt="HachiCrauncher"></p>

<h1 align="center">HachiCrauncher</h1>

<p align="center">🍯 友達と同じMODで遊ぶための、マルチサーバー対応マインクラフトランチャー</p>

<p align="center">
  <a href="https://github.com/HachiMitsuki/HachiCrauncher/releases/latest"><img src="https://img.shields.io/github/v/release/HachiMitsuki/HachiCrauncher?style=for-the-badge&label=最新版" alt="release"></a>
  <a href="https://github.com/HachiMitsuki/HachiCrauncher/releases"><img src="https://img.shields.io/github/downloads/HachiMitsuki/HachiCrauncher/total?style=for-the-badge&label=DL数" alt="downloads"></a>
  <img src="https://img.shields.io/badge/license-MIT-green?style=for-the-badge" alt="license">
</p>

---

サーバーを選ぶだけで、必要な **MOD・NeoForge/Forge/Fabric・Java** を全部自動で用意してマインクラフトを起動するランチャー。MODの手動インストールは不要。**全員が同じMOD構成で同じサーバーに入れます。**

## 📥 インストール（プレイヤー向け）

1. **[最新版をダウンロード](https://github.com/HachiMitsuki/HachiCrauncher/releases/latest)** → `Assets` 内の `HachiCrauncher-setup-x.x.x.exe` を実行
2. 「Windows によって PC が保護されました」が出たら **「詳細情報」→「実行」**（ウイルスではありません）
3. 自分の Microsoft アカウント（Java版所持）でログイン
4. サーバーを選んで **「プレイ」** → MODが自動DLされてそのまま参加

> 一度インストールすれば、以降はランチャーが **自動でアップデート** します。配るのはダウンロードリンク1つでOK。

## ✨ 特徴

- 🔒 **複数アカウント管理** — Microsoft（OAuth 2.0）ログイン対応。複数アカウントを登録して切り替え
- 📂 **MOD自動同期** — サーバーを選ぶだけで必要なMODを自動DL・検証。壊れたファイルは自動で再取得
- ☕ **Java自動セットアップ** — 適切なバージョンのJavaを自動インストール。事前準備不要
- 🧩 **NeoForge / Forge / Fabric 対応** — モダンなMODローダーに対応
- 🖥️ **マルチサーバー** — サーバーごとのプロファイルを切り替え。プレイヤー数も表示
- 🔄 **自動アップデート** — ランチャー自身がワンクリックで最新化

## 🎮 対応サーバー

| サーバー | バージョン | MODローダー |
| --- | --- | --- |
| `hachi-neoforge-1.21.1` | Minecraft 1.21.1 | NeoForge 21.1.x |

MOD構成は [hachicrauncher-distro](https://github.com/HachiMitsuki/hachicrauncher-distro) リポジトリで管理し、GitHub Pages から自動配信しています。

## 🛠️ 開発 / ビルド

**必要環境:** [Node.js](https://nodejs.org/) v22

```bash
git clone https://github.com/HachiMitsuki/HachiCrauncher.git
cd HachiCrauncher
npm install
npm start          # 開発起動
```

**インストーラをビルド:**

| プラットフォーム | コマンド |
| --- | --- |
| Windows x64 | `npm run dist:win` |
| macOS | `npm run dist:mac` |
| Linux x64 | `npm run dist:linux` |

- Microsoft ログイン用の Azure アプリ設定 → [`docs/HachiCrauncher-MicrosoftAuth.md`](./docs/HachiCrauncher-MicrosoftAuth.md)
- 配信用 `distribution.json` の作り方 → [`docs/distro.md`](./docs/distro.md)
- 開発者コンソールは `Ctrl + Shift + I`（コンソールに不明なコードを貼り付けないこと）

## 🙏 クレジット

HachiCrauncher は **[HeliosLauncher](https://github.com/dscalzi/HeliosLauncher)**（MIT License, © Daniel "dscalzi" Scalzi / Aventium Softworks）をベースにした派生プロジェクトです。素晴らしいランチャーを公開してくれた原作者に感謝します。

## 📄 ライセンス

[MIT License](./LICENSE.txt) — ベースである HeliosLauncher のライセンスを継承しています。
