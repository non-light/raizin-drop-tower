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
    this.result = document.getElementById('result')
    this.resultTitle = document.getElementById('result-title')
    this.resultSub = document.getElementById('result-sub')
    this.retry = document.getElementById('retry')

    const lo = CONFIG.hit.weakMax * 100
    const hi = CONFIG.hit.goodMax * 100
    this.zone.style.left = `${lo}%`
    this.zone.style.width = `${hi - lo}%`
    this.markLo.style.left = `${lo}%`
    this.markHi.style.left = `${hi}%`
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
