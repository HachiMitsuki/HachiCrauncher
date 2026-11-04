const { DistributionAPI } = require('helios-core/common')

const ConfigManager = require('./configmanager')

// Old WesterosCraft url.
// exports.REMOTE_DISTRO_URL = 'http://mc.westeroscraft.com/WesterosCraftLauncher/distribution.json'
exports.REMOTE_DISTRO_URL = 'https://hachimitsuki.github.io/hachicrauncher-distro/distribution.json'

// 試しの版を手元で動かすときだけ、公開の配布一覧の代わりにランチャーのフォルダの
// distribution_dev.json を読む（環境変数 HACHICRAUNCHER_DEV_DISTRO=1）。友だちの PC では設定しない。
// ランチャーのフォルダは %APPDATA%\HachiCrauncher（config.json がある所）。ゲームのデータの
// %APPDATA%\.helioslauncher ではない（ここに置くと読み込みの画面から進まなくなる・2026-11-04）。
const DEV_DISTRO = process.env.HACHICRAUNCHER_DEV_DISTRO === '1'

const api = new DistributionAPI(
    ConfigManager.getLauncherDirectory(),
    null, // Injected forcefully by the preloader.
    null, // Injected forcefully by the preloader.
    exports.REMOTE_DISTRO_URL,
    DEV_DISTRO
)

// プレイ押下時(dlAsync -> refreshDistributionOrFallback -> pullRemote)に
// 常に「pushされた最新」を取得するため、配信インデックスの取得URLに毎回ユニークな
// クエリを付けて GitHub Pages の CDN キャッシュをバイパスする。
// （MOD実体のURLは固定なので影響なし。distribution.json だけ確実に最新化される）
const _pullRemote = api.pullRemote.bind(api)
api.pullRemote = function () {
    const sep = exports.REMOTE_DISTRO_URL.includes('?') ? '&' : '?'
    this.remoteUrl = exports.REMOTE_DISTRO_URL + sep + '_=' + Date.now()
    return _pullRemote()
}

exports.DistroAPI = api