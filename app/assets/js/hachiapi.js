/**
 * ハチクランチャーの受付口（Cloudflare Worker "hachicrauncher-api"）とのやり取り。
 *
 * 送るのは Minecraft の名前だけ。ログインの鍵（アクセストークン）はどこにも送らない。
 * 本人確認はしない（受付口から Mojang の確認を呼ぶと断られるため・2026-11-04 判断シート v2）。
 * 他人の名前で知らせが来ても、はちみつきが Discord で ✅ を押さなければ何も起きず、
 * 鯖に入るときの本物のアカウントの確認は、鯖そのものが今までどおり行う。
 *
 * 画面（レンダラー）の fetch は CORS で止まるので、通信は got（Node 側）で行う。
 */
const got               = require('got')
const { LoggerUtil }    = require('helios-core')
const ConfigManager     = require('./configmanager')

const logger = LoggerUtil.getLogger('HachiApi')

// 受付口のアドレス。配布一覧（distribution.json）の鯖の項目に "hachiApi" があればそちらを使う
// （アドレスを変えたくなっても、ランチャーの更新なしで配布一覧の 1 行で変えられるように）。
exports.DEFAULT_API_BASE = 'https://hachicrauncher.hachimitsuki.com'

const TIMEOUT_MS = 8000

/**
 * Whether this server asks the launcher to check the whitelist before launch
 * (distribution.json の鯖の項目に "hachiWhitelist": true)。
 *
 * @param {Object} server The distribution server object.
 * @returns {boolean}
 */
exports.isWhitelistEnabled = function(server){
    return server != null && server.rawServer != null && server.rawServer.hachiWhitelist === true
}

/**
 * この鯖で使う受付口のアドレス（末尾の / は付けない）。
 *
 * @param {Object} server The distribution server object.
 * @returns {string}
 */
exports.apiBase = function(server){
    const raw = server != null && server.rawServer != null ? server.rawServer.hachiApi : null
    if(typeof raw === 'string' && /^https:\/\/[A-Za-z0-9.-]+(\/[A-Za-z0-9._~/-]*)?$/.test(raw)){
        return raw.replace(/\/+$/, '')
    }
    return exports.DEFAULT_API_BASE
}

/**
 * 受付口に送る。payload に今選んでいるアカウントの Minecraft の名前（name）を足して POST し、返ってきた JSON を返す。
 * 失敗したら Error を投げる（err.step にどこで失敗したか、err.status に HTTP の番号、err.body に受付口の答え）。
 *
 * @param {Object} server The distribution server object（受付口のアドレスを決めるため）
 * @param {string} path 受付口の入口（例: '/v1/status'・'/v1/report'）
 * @param {Object} payload 送る中身（name はここで足す）
 * @returns {Promise<Object>}
 */
exports.post = async function(server, path, payload = {}){
    const account = ConfigManager.getSelectedAccount()
    if(account == null || typeof account.displayName !== 'string'){
        throw makeError('account', 0)
    }
    const res = await got.post(exports.apiBase(server) + path, {
        json: { ...payload, name: account.displayName },
        timeout: TIMEOUT_MS, throwHttpErrors: false, responseType: 'json', retry: 0
    })
    if(res.statusCode < 200 || res.statusCode >= 300){
        throw makeError(path, res.statusCode, res.body)
    }
    return res.body
}

function makeError(step, status, body){
    const err = new Error(`HachiApi ${step} failed (${status})`)
    err.step = step
    err.status = status
    err.body = body
    logger.warn(err.message)
    return err
}
