/**
 * ハチクランチャーの受付口（Cloudflare Worker "hachicrauncher-api"）とのやり取り。
 *
 * 本人確認は、Minecraft の鯖に入るときと同じしくみを使う:
 *   1. 受付口から使い捨ての合言葉（nonce）をもらう
 *   2. その合言葉を serverId にして Mojang の join を呼ぶ（アクセストークンを使うのはここだけ）
 *   3. 名前と合言葉を受付口に送ると、受付口が Mojang の hasJoined で持ち主かを確かめる
 * アクセストークンは Mojang 以外には送らない。
 *
 * 画面（レンダラー）の fetch は CORS で止まるので、通信は got（Node 側）で行う。
 */
const got               = require('got')
const { LoggerUtil }    = require('helios-core')
const ConfigManager     = require('./configmanager')

const logger = LoggerUtil.getLogger('HachiApi')

exports.API_BASE = 'https://hachicrauncher-api.REPLACE_SUBDOMAIN.workers.dev'

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
 * 受付口に、本人確認つきで送る。payload に name と nonce を足して POST し、返ってきた JSON を返す。
 * 失敗したら Error を投げる（err.step にどこで失敗したか、err.status に HTTP の番号、err.body に受付口の答え）。
 *
 * @param {string} path 受付口の入口（例: '/v1/status'・'/v1/apply'・'/v1/report'）
 * @param {Object} payload 送る中身（name と nonce はここで足す）
 * @returns {Promise<Object>}
 */
exports.post = async function(path, payload = {}){
    const account = ConfigManager.getSelectedAccount()
    if(account == null || account.accessToken == null || account.uuid == null){
        throw makeError('account', 0)
    }

    const challenge = await got.get(exports.API_BASE + '/v1/challenge', {
        timeout: TIMEOUT_MS, throwHttpErrors: false, responseType: 'json', retry: 0
    })
    if(challenge.statusCode !== 200 || challenge.body == null || typeof challenge.body.nonce !== 'string'){
        throw makeError('challenge', challenge.statusCode, challenge.body)
    }
    const nonce = challenge.body.nonce

    const join = await got.post('https://sessionserver.mojang.com/session/minecraft/join', {
        json: {
            accessToken: account.accessToken,
            selectedProfile: account.uuid.replace(/-/g, ''),
            serverId: nonce
        },
        timeout: TIMEOUT_MS, throwHttpErrors: false, retry: 0
    })
    if(join.statusCode !== 204){
        throw makeError('join', join.statusCode)
    }

    const res = await got.post(exports.API_BASE + path, {
        json: { ...payload, name: account.displayName, nonce },
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
