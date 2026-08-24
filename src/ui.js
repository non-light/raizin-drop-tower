import { CONFIG } from './config.js'

export class UI {
  constructor() {
    this.gaugeWrap = document.getElementById('gauge-wrap')
    this.fill = document.getElementById('gauge-fill')
    this.pct = document.getElementById('gauge-pct')
    this.zone = document.getElementById('gauge-zone-good')
    this.markLo = document.getElementById('gauge-mark-lo')
    this.markHi = document.getElementById('gauge-mark-hi')
    this.remain = document.getElementById('remain')
    this.phase = document.getElementById('phase')
    this.blockType = document.getElementById('blocktype')
    this.judge = document.getElementById('judge')
    this.combo = document.getElementById('combo')
    this.comboText = document.getElementById('combo-text')
    this.bubble = document.getElementById('bubble')
    this.bubbleText = document.getElementById('bubble-text')
    this.wind = document.getElementById('wind-banner')
    this.windArrow = document.getElementById('wind-arrow')
    this.windKind = document.getElementById('wind-kind')
    this.result = document.getElementById('result')
    this.resultTitle = document.getElementById('result-title')
    this.resultSub = document.getElementById('result-sub')
    this.retry = document.getElementById('retry')

    this.bubbleUntil = 0
    this.setZone(CONFIG.blockTypes.normal)
  }

  /** ゲージの緑帯を、いま狙っているブロックの種類に合わせる。 */
  setZone(type) {
    const lo = type.weakMax * 100
    const hi = type.goodMax * 100
    this.zone.style.left = `${lo}%`
    this.zone.style.width = `${hi - lo}%`
    this.markLo.style.left = `${lo}%`
    this.markHi.style.left = `${hi}%`
  }

  setBlockType(type, key) {
    this.blockType.textContent = type ? type.label : '—'
    this.blockType.className = 'chip type-chip' + (key ? ' ' + key : '')
  }

  setPower(p, charging) {
    this.fill.style.width = `${p * 100}%`
    this.pct.textContent = `${Math.round(p * 100)}%`
    this.gaugeWrap.classList.toggle('charging', charging)
  }

  setRemain(n) {
    this.remain.textContent = `のこり ${n}`
  }

  setPhase(text) {
    this.phase.textContent = text
  }

  /** WEAK / PERFECT / DANGER。CSS のアニメーションを鳴らし直すため、一度クラスを外す。 */
  showJudge(kind, text) {
    this.judge.className = ''
    void this.judge.offsetWidth
    this.judge.textContent = text
    this.judge.className = 'show ' + kind
  }

  showCombo(count) {
    if (count < 1) return
    this.comboText.textContent = count === 1 ? 'PERFECT!' : `${count} COMBO`
    // コンボが伸びるほど少しだけ大きく。伸びすぎないよう頭打ちにする。
    this.combo.style.fontSize = `${20 + Math.min(count, 8) * 3.4}px`
    this.combo.className = ''
    void this.combo.offsetWidth
    this.combo.className = 'show'
  }

  /** 雷神のひとこと。画面に投影した位置へ吹き出しを置く。 */
  say(text, seconds, now) {
    this.bubbleText.textContent = text
    this.bubble.classList.add('show')
    this.bubbleUntil = now + seconds
  }

  updateBubble(screen, now) {
    if (now > this.bubbleUntil) {
      this.bubble.classList.remove('show')
      return
    }
    if (!screen) return
    this.bubble.style.left = `${screen.x}px`
    this.bubble.style.top = `${screen.y}px`
  }

  setWind(state) {
    if (!state) {
      this.wind.className = ''
      return
    }
    this.windArrow.textContent = state.arrow
    this.windKind.textContent = state.label
    this.wind.className =
      'show' + (state.warning ? ' warn' : '') + (state.label === 'STRONG WIND' ? ' strong' : '')
  }

  showResult(title, sub, cleared) {
    this.resultTitle.textContent = title
    this.resultTitle.classList.toggle('clear', cleared)
    this.resultSub.textContent = sub
    this.result.classList.add('show')
  }

  hideResult() {
    this.result.classList.remove('show')
  }
}
