/**
 * Player-added ("drop-in") mods for HachiCrauncher servers.
 *
 * A server whose distribution entry carries `hachiUserMods` lets players keep
 * the mods they add to mods/ themselves. Before each launch:
 *   - jars this launcher distributed before but no longer lists are deleted
 *     (old versions after an update),
 *   - jars that declare the same mod id as a distributed mod are moved to
 *     `外したMOD/` (two copies of one mod stop the game from starting),
 *   - everything else is kept. Kept jars that match the `suspicious` rules are
 *     reported to the host through the HachiCrauncher API (`/v1/report`, see
 *     hachiapi.js), which posts them to the host's Discord channel.
 * A server without `hachiUserMods` keeps the v1.0.9 behaviour: every jar that
 * is not in the distribution is deleted.
 *
 * hachiUserMods = {
 *   distributedModIds: ['create', ...],              // ids found in the distributed jars
 *   checked: [{ modId, name, note, url }],           // mods the host has tried on this server
 *   suspicious: [{ label, level, modIds, keywords, except }],
 *   report: true                                     // report suspicious mods to the host (absent/false = off)
 * }
 * Up to v1.1.1 the distribution carried a Discord webhook URL (`reportWebhook`)
 * and the launcher posted to it directly. Anyone reading the public distribution
 * could take that URL, so since v1.1.2 the launcher only talks to the API and the
 * Discord credentials stay on the API side. `reportWebhook` is ignored.
 */
const AdmZip          = require('adm-zip')
const crypto          = require('crypto')
const fs              = require('fs-extra')
const { LoggerUtil }  = require('helios-core')
const { Type }        = require('helios-distribution-types')
const path            = require('path')

const HachiApi        = require('./hachiapi')

const logger = LoggerUtil.getLogger('UserMods')

const MARKER_FILE = '.hachicrauncher-mods.json'
const REMOVED_DIR = '外したMOD'
const REPORT_KIND = 'suspicious-mods'
const REPORT_MAX_MODS = 10
const REPORT_MAX_JSON = 3800 // the API refuses payloads over 4000 characters

exports.REMOVED_DIR = REMOVED_DIR

function readMarker(gameDir){
    try { return JSON.parse(fs.readFileSync(path.join(gameDir, MARKER_FILE), 'utf8')) } catch(e) { return {} }
}

function writeMarker(gameDir, marker){
    fs.writeFileSync(path.join(gameDir, MARKER_FILE), JSON.stringify(marker), 'utf8')
}

const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * File names under mods/ that the distribution declares for this server.
 *
 * @param {Object} server The distribution server object.
 * @returns {Set.<string>}
 */
exports.getDistributedModFiles = function(server){
    const files = new Set()
    for(const mdl of server.modules){
        const raw = mdl.rawModule || {}
        const p = (raw.artifact && raw.artifact.path) || ''
        if(raw.type === Type.File && p.startsWith('mods/')) files.add(p.slice(5))
    }
    return files
}

/**
 * Mod ids declared in the [[mods]] sections of a jar's NeoForge (or Forge)
 * metadata. Dependency entries are skipped.
 *
 * @param {string} file Path to the jar.
 * @returns {Array.<string> | null} The ids, or null when the jar carries no such
 * metadata (Fabric mods, libraries, broken files).
 */
exports.readJarModIds = function(file){
    let text
    try {
        const zip = new AdmZip(file)
        const entry = zip.getEntry('META-INF/neoforge.mods.toml') || zip.getEntry('META-INF/mods.toml')
        if(entry == null) return null
        text = zip.readAsText(entry, 'utf8')
    } catch(err) {
        logger.warn(`Could not read ${path.basename(file)}: ${err.message}`)
        return null
    }
    const ids = []
    let section = ''
    let inMultiline = null
    for(const line of text.split(/\r?\n/)){
        if(inMultiline){
            if(line.includes(inMultiline)) inMultiline = null
            continue
        }
        const t = line.trim()
        const header = /^\[\[?\s*([^\]]+?)\s*\]\]?/.exec(t)
        if(header){
            section = header[1]
            continue
        }
        const id = /^modId\s*=\s*["']([^"']+)["']/.exec(t)
        if(id && section === 'mods') ids.push(id[1])
        for(const q of ["'''", '"""']){
            if((t.split(q).length - 1) % 2 === 1){
                inMultiline = q
                break
            }
        }
    }
    return ids.length > 0 ? ids : null
}

/**
 * Check a jar against the suspicious-mod rules. A rule matches when one of the
 * jar's mod ids is listed in it, or when the file name or a mod id contains one
 * of its keywords (ignoring case and punctuation) and none of its `except` words.
 *
 * @param {string} fileName The jar's file name.
 * @param {Array.<string> | null} ids The jar's mod ids.
 * @param {Array.<Object>} rules The `suspicious` rules from the distribution.
 * @returns {Array.<{label: string, level: string}>} The matching rules.
 */
exports.matchSuspicious = function(fileName, ids, rules){
    const hay = [fileName, ...(ids || [])].map(norm)
    const hits = []
    for(const rule of rules || []){
        const byId = (ids || []).some(id => (rule.modIds || []).includes(id))
        const byWord = (rule.keywords || []).some(k => {
            const nk = norm(k)
            return nk.length > 0 && hay.some(h => h.includes(nk) && !(rule.except || []).some(e => h.includes(norm(e))))
        })
        if(byId || byWord) hits.push({ label: rule.label, level: rule.level })
    }
    return hits
}

/**
 * Bring the instance's mods/ folder in line with the distribution before launch.
 *
 * @param {string} gameDir The server's instance directory.
 * @param {Object} server The distribution server object.
 * @returns {{deleted: Array.<string>, moved: Array.<{file: string, ids: Array.<string>}>,
 * kept: Array.<{file: string, ids: Array.<string> | null, suspicious: Array.<Object>}>}}
 */
exports.syncModsFolder = function(gameDir, server){
    const report = { deleted: [], moved: [], kept: [] }
    const modsDir = path.join(gameDir, 'mods')
    if(!fs.existsSync(modsDir)) return report
    const expected = exports.getDistributedModFiles(server)
    if(expected.size === 0) return report // safety: never wipe everything

    const cfg = server.rawServer.hachiUserMods
    const marker = readMarker(gameDir)
    const shippedBefore = new Set(marker.distributed || [])
    const distributedIds = new Set((cfg && cfg.distributedModIds) || [])

    for(const f of fs.readdirSync(modsDir)){
        if(!f.toLowerCase().endsWith('.jar') || expected.has(f)) continue
        const full = path.join(modsDir, f)
        if(cfg == null || shippedBefore.has(f)){
            fs.removeSync(full)
            report.deleted.push(f)
            logger.info('Removed mod no longer in distribution: ' + f)
            continue
        }
        const ids = exports.readJarModIds(full)
        if(ids != null && ids.some(id => distributedIds.has(id))){
            fs.moveSync(full, path.join(gameDir, REMOVED_DIR, f), { overwrite: true })
            report.moved.push({ file: f, ids })
            logger.info(`Moved ${f} to ${REMOVED_DIR}/ (same mod as a distributed one)`)
            continue
        }
        const suspicious = exports.matchSuspicious(f, ids, cfg.suspicious)
        report.kept.push({ file: f, ids, suspicious })
        logger.info(`Keeping player mod ${f} (ids: ${ids ? ids.join(',') : 'none'})${suspicious.length ? ' [suspicious]' : ''}`)
    }

    if(cfg != null){
        marker.distributed = [...new Set([...shippedBefore, ...expected])]
        writeMarker(gameDir, marker)
    }
    return report
}

/**
 * Whether this server wants suspicious mods reported to the host.
 *
 * @param {Object | undefined} cfg The server's `hachiUserMods` entry.
 * @returns {boolean}
 */
exports.isReportEnabled = function(cfg){
    return cfg != null && cfg.report === true
}

// Cap the length of a value that came from the player's PC. The API removes
// Discord formatting and mentions before posting.
const cap = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max)

/**
 * Build the `/v1/report` payload for a player's suspicious mods. The JSON is
 * kept under the API's size limit by dropping mods from the end; `total` still
 * tells how many there were.
 *
 * @param {string} launcherVersion The launcher's version.
 * @param {Array.<{file: string, modIds: Array.<string>, reasons: Array.<{label: string, level: string}>}>} mods
 * @returns {{launcher: string, total: number, mods: Array.<Object>}}
 */
exports.buildReportPayload = function(launcherVersion, mods){
    const list = mods.slice(0, REPORT_MAX_MODS).map(m => ({
        file: cap(m.file, 100),
        modIds: m.modIds.slice(0, 5).map(i => cap(i, 40)),
        reasons: m.reasons.slice(0, 5).map(r => ({ level: cap(r.level, 10), label: cap(r.label, 60) }))
    }))
    const payload = { launcher: cap(launcherVersion, 20), total: mods.length, mods: list }
    while(payload.mods.length > 1 && JSON.stringify(payload).length > REPORT_MAX_JSON){
        payload.mods.pop()
    }
    return payload
}

/**
 * Tell the host which suspicious mods this player has, through the
 * HachiCrauncher API. Sent only when that list changed since the last report
 * the API delivered to Discord, so a player is not reported on every launch.
 * Never throws and never blocks the launch.
 *
 * @param {string} gameDir The server's instance directory.
 * @param {Object} server The distribution server object.
 * @param {Object} report The result of syncModsFolder.
 * @param {string} playerName The Minecraft name of the selected account.
 * @param {string} launcherVersion The launcher's version.
 */
exports.reportSuspicious = async function(gameDir, server, report, playerName, launcherVersion){
    try {
        const cfg = server.rawServer.hachiUserMods
        if(!exports.isReportEnabled(cfg)) return
        const mods = report.kept
            .filter(k => k.suspicious.length > 0)
            .map(k => ({ file: k.file, modIds: k.ids || [], reasons: k.suspicious }))
        const marker = readMarker(gameDir)
        if(mods.length === 0){
            if(marker.reportedHash != null){
                delete marker.reportedHash
                writeMarker(gameDir, marker)
            }
            return
        }
        const hash = crypto.createHash('md5').update(JSON.stringify([playerName, mods])).digest('hex')
        if(marker.reportedHash === hash) return

        // HachiApi.post sends the selected account's name and throws on HTTP errors
        // (429 = reported too recently; the next launch tries again).
        const res = await HachiApi.post(server, '/v1/report', {
            kind: REPORT_KIND,
            payload: exports.buildReportPayload(launcherVersion, mods)
        })
        if(res == null || res.delivered !== true){
            logger.warn('The API took the report but could not post it to Discord; will try again next launch')
            return
        }
        marker.reportedHash = hash
        writeMarker(gameDir, marker)
        logger.info(`Reported ${mods.length} suspicious mod(s) to the host`)
    } catch(err) {
        logger.warn('Failed to report suspicious mods:', err.message)
    }
}
