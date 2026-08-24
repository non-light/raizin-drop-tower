import { CONFIG } from './config.js'

/**
 * タイミングバーの妨害モード。
 *
 * 狙いは「速くして反応を削る」ことではなく、
 * 見て・覚えて・予測すれば取れる難しさを足すこと。
 * そのため、
 *   - 必ず予告を先に出す（announce 秒）
 *   - カーソルの速さは、予兆なしには変えない
 *   - 同時に起きるのは最大2種類
 * を守っている。
 *
 * 1回の溜めごとに roll() で内容を決め、離すまで同じ内容が続く。
 */

const ALL = ['darkcloud', 'onechance', 'moving', 'blackout', 'feint']

const LABEL = {
  darkcloud: 'DARK CLOUD',
  onechance: 'ONE CHANCE',
  moving: 'MOVING ZONE',
  blackout: 'BLACKOUT',
  feint: 'FEINT',
}

const lerp = (a, b, t) => a + (b - a) * t

export class Hazards {
  constructor() {
    this.clear()
  }

  clear() {
    this.active = []
    this.t = 0
    this.progress = 0
    this.cloud = null
    this.blackUntil = -1
    this.nextBlack = 0
    this.feintUntil = -1
    this.feintFactor = 1
    this.nextFeint = 0
    this.flashPending = false
    this.expiredFlag = false
  }

  /** そのとき解禁されているモード。 */
  availableAt(removed) {
    const U = CONFIG.hit.hazards.unlock
    return ALL.filter((id) => removed >= U[id])
  }

  /**
   * 溜めはじめに呼ぶ。今回の妨害を決める。
   * @param removed 抜いた段の数
   * @param progress 0〜1 の進みぐあい
   */
  roll(removed, progress) {
    this.clear()
    this.progress = progress
    const H = CONFIG.hit.hazards
    if (!H.enabled) return

    const pool = this.availableAt(removed)
    if (!pool.length) return
    if (Math.random() > lerp(H.chance.start, H.chance.end, progress)) return

    const first = pool[Math.floor(Math.random() * pool.length)]
    this.active = [first]

    // 終盤だけ2種同時。3種以上は出さない。
    if (removed >= H.doubleFrom && Math.random() < 0.35) {
      const rest = pool.filter((id) => id !== first && combinable(first, id))
      if (rest.length) this.active.push(rest[Math.floor(Math.random() * rest.length)])
    }

    if (this.has('darkcloud')) {
      // 雲の位置は毎回変わるが、バーの端まで覆いはしない
      const w = lerp(H.darkcloud.width.start, H.darkcloud.width.end, progress)
      const lo = 0.08 + Math.random() * (1 - w - 0.16)
      this.cloud = [lo, lo + w]
    }
    this.nextBlack = H.announce + H.blackout.interval * 0.6
    this.nextFeint = H.announce + H.feint.interval * 0.6
  }

  /** その妨害が今回あるか（予告中もふくむ）。 */
  has(id) {
    return this.active.includes(id)
  }

  /** 予告が終わって、実際に効いているか。 */
  live(id) {
    return this.has(id) && this.t >= CONFIG.hit.hazards.announce
  }

  get announcing() {
    return this.active.length > 0 && this.t < CONFIG.hit.hazards.announce
  }

  get label() {
    return this.active.map((id) => LABEL[id]).join(' + ')
  }

  update(dt) {
    if (!this.active.length) return
    const H = CONFIG.hit.hazards
    this.t += dt

    if (this.live('blackout') && this.t > this.nextBlack) {
      const d = lerp(H.blackout.duration.start, H.blackout.duration.end, this.progress)
      this.blackUntil = this.t + d
      this.nextBlack = this.t + d + H.blackout.interval
    }

    if (this.live('feint') && this.t > this.nextFeint) {
      // 予兆を先に出してから速さを変える
      if (this.feintUntil < this.t && !this.flashPending && this.t > this.nextFeint) {
        this.flashPending = true
        this.feintStart = this.t + H.feint.telegraph
        this.feintUntil = this.feintStart + 0.75
        this.feintFactor = Math.random() < 0.5 ? H.feint.slow : H.feint.fast
        this.nextFeint = this.feintUntil + H.feint.interval
      }
    }
  }

  /** 予兆を鳴らすタイミングで1回だけ true を返す。 */
  consumeFlash() {
    if (!this.flashPending) return false
    this.flashPending = false
    return true
  }

  /** カーソルの速さの倍率。予兆のあとだけ変わる。 */
  rateFactor() {
    if (!this.live('feint')) return 1
    if (this.t < this.feintStart || this.t > this.feintUntil) return 1
    return this.feintFactor
  }

  /** PERFECT の芯のずれ。カーソルよりずっとゆっくり動く。 */
  zoneOffset() {
    if (!this.live('moving')) return 0
    const M = CONFIG.hit.hazards.moving
    return Math.sin((this.t - CONFIG.hit.hazards.announce) * M.speed) * M.range
  }

  /** 雲がかかっている範囲。null なら雲なし。 */
  cloudRange() {
    return this.live('darkcloud') ? this.cloud : null
  }

  /** その位置が雲に隠れているか。 */
  hiddenAt(power) {
    const c = this.cloudRange()
    return !!c && power >= c[0] && power <= c[1]
  }

  get blackout() {
    return this.live('blackout') && this.t < this.blackUntil
  }

  /** 一発勝負。1往復を過ぎたか。 */
  expired(cycle) {
    if (!this.live('onechance')) return false
    // 予告のぶんは猶予に入れない
    return this.t - CONFIG.hit.hazards.announce > cycle * 2
  }
}

/** 見えないうえに読めない、という重なりだけ避ける。 */
function combinable(a, b) {
  const bad = [
    ['darkcloud', 'blackout'], // 両方とも「見えない」。重ねると運任せになる
    ['onechance', 'blackout'],
  ]
  return !bad.some(([x, y]) => (a === x && b === y) || (a === y && b === x))
}
