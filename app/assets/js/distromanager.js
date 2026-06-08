const { DistributionAPI } = require('helios-core/common')

const ConfigManager = require('./configmanager')

// Old WesterosCraft url.
// exports.REMOTE_DISTRO_URL = 'http://mc.westeroscraft.com/WesterosCraftLauncher/distribution.json'
exports.REMOTE_DISTRO_URL = 'https://hachimitsuki.github.io/hachicrauncher-distro/distribution.json'

const api = new DistributionAPI(
    ConfigManager.getLauncherDirectory(),
    null, // Injected forcefully by the preloader.
    null, // Injected forcefully by the preloader.
    exports.REMOTE_DISTRO_URL,
    false
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