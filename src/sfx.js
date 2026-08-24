import { CONFIG } from './config.js'

/**
 * 効果音。音声ファイルは持たず、その場で合成している。
 * ブラウザの制限で、最初のクリックまで音は出せない（resume で立ち上げる）。
 */
export class Sfx {
  constructor() {
    this.ctx = null
    this.muted = false
    this.last = {}
  }

  resume() {
    if (!CONFIG.audio.enabled || this.ctx) return
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    this.ctx = new AC()
    this.master = this.ctx.createGain()
    this.master.gain.value = CONFIG.audio.volume
    this.master.connect(this.ctx.destination)
  }

  /** 同じ音が短時間に重なりすぎないようにする。 */
  ready(kind, gap = 0.06) {
    if (!this.ctx || this.muted) return false
    const now = this.ctx.currentTime
    if (this.last[kind] && now - this.last[kind] < gap) return false
    this.last[kind] = now
    return true
  }

  toggleMute() {
    this.muted = !this.muted
    return this.muted
  }

  /** 鐘。カーン！ 倍音を少しずらして長く伸ばす。 */
  bell(power = 1) {
    if (!this.ready('bell', 0.12)) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.9 * power, t + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 2.6)
    gain.connect(this.master)

    for (const [ratio, level] of [[1, 1], [2.76, 0.5], [5.4, 0.25], [8.9, 0.12]]) {
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.value = 523 * ratio
      const g = ctx.createGain()
      g.gain.value = level
      o.connect(g).connect(gain)
      o.start(t)
      o.stop(t + 2.6)
    }
  }

  /** 空き缶。ガラガラ。短い金属質のノイズ。 */
  can(power = 1) {
    if (!this.ready('can', 0.03)) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const len = 0.12
    const buf = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length)
    const src = ctx.createBufferSource()
    src.buffer = buf

    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 1800 + Math.random() * 1600
    bp.Q.value = 3

    const gain = ctx.createGain()
    gain.gain.value = 0.5 * power
    src.connect(bp).connect(gain).connect(this.master)
    src.start(t)
  }

  /** 木箱。ゴトッ。低くて短い。 */
  thud(power = 1) {
    if (!this.ready('thud', 0.05)) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const o = ctx.createOscillator()
    o.type = 'triangle'
    o.frequency.setValueAtTime(190, t)
    o.frequency.exponentialRampToValueAtTime(52, t + 0.16)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.8 * power, t + 0.006)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.24)
    o.connect(gain).connect(this.master)
    o.start(t)
    o.stop(t + 0.25)
  }

  /** コンボが伸びたときの短い上昇音。 */
  combo(step = 1) {
    if (!this.ready('combo', 0.05)) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const o = ctx.createOscillator()
    o.type = 'square'
    const base = 620 * Math.pow(1.12, Math.min(step, 8))
    o.frequency.setValueAtTime(base, t)
    o.frequency.exponentialRampToValueAtTime(base * 1.5, t + 0.09)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.22, t + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2)
    o.connect(gain).connect(this.master)
    o.start(t)
    o.stop(t + 0.21)
  }
}
