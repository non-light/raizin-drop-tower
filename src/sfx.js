import { CONFIG } from './config.js'

/**
 * 効果音。いまは音声ファイルを持たず、その場で合成している（仮SE）。
 *
 * 差し替えかた:
 *   下の SOURCES が音の一覧。各エントリに file を書けば、そちらが優先で再生される。
 *     perfect: { file: '/sfx/perfect.wav', synth: (c) => {...} }
 *   合成側の処理には触らなくてよい。呼び出し側（game.js など）は
 *   playPerfect() のような名前しか知らないので、ここだけで完結する。
 */

const rand = (center, spread) => center * (1 + (Math.random() * 2 - 1) * spread)

/** 短い減衰エンベロープ。ほとんどの音がこれを使う。 */
function env(c, { attack = 0.005, decay = 0.2, peak = 0.6 }) {
  const g = c.ctx.createGain()
  const t = c.now
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay)
  g.connect(c.out)
  return g
}

function tone(c, { type = 'sine', freq, to, dur, peak = 0.5, attack = 0.005, delay = 0 }) {
  const o = c.ctx.createOscillator()
  const t = c.now + delay
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur)
  const g = c.ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(c.out)
  o.start(t)
  o.stop(t + dur + 0.02)
  return o
}

function noise(c, { dur = 0.12, freq = 2000, q = 2, peak = 0.5, type = 'bandpass', delay = 0 }) {
  const src = c.ctx.createBufferSource()
  src.buffer = c.noiseBuffer
  src.playbackRate.value = rand(1, 0.25)
  const f = c.ctx.createBiquadFilter()
  f.type = type
  f.frequency.value = freq
  f.Q.value = q
  const t = c.now + delay
  const g = c.ctx.createGain()
  g.gain.setValueAtTime(peak, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(f).connect(g).connect(c.out)
  src.start(t)
  src.stop(t + dur + 0.02)
  return src
}

const SOURCES = {
  // ハンマーがブロック表面に当たった瞬間。強いほど低く・大きく。
  hammerHit: {
    file: null,
    gap: 0.04,
    synth: (c, { power = 0.5 } = {}) => {
      const low = 1 - power * 0.45
      tone(c, { type: 'triangle', freq: rand(430 * low, 0.06), to: 120 * low, dur: 0.11, peak: 0.35 + power * 0.35 })
      noise(c, { dur: 0.05, freq: rand(2600, 0.15), q: 1.2, peak: 0.3 + power * 0.3 })
    },
  },

  // ブロックが横へ抜けていく「スコーン！」
  blockSlide: {
    file: null,
    gap: 0.05,
    synth: (c, { power = 0.5, bright = 1 } = {}) => {
      const f0 = rand(320, 0.08) * (0.85 + power * 0.5)
      tone(c, { type: 'sine', freq: f0, to: f0 * (2.6 * bright), dur: 0.24, peak: 0.34 * bright })
      noise(c, { dur: 0.2, freq: rand(1500, 0.2), q: 0.8, peak: 0.16 * bright })
    },
  },

  // 弱すぎ。コツッ。
  weak: {
    file: null,
    gap: 0.05,
    synth: (c) => {
      tone(c, { type: 'sine', freq: rand(240, 0.08), to: 150, dur: 0.07, peak: 0.28 })
    },
  },

  // 強すぎ。ドン！
  danger: {
    file: null,
    gap: 0.05,
    synth: (c) => {
      tone(c, { type: 'triangle', freq: rand(140, 0.06), to: 42, dur: 0.34, peak: 0.75 })
      noise(c, { dur: 0.22, freq: 380, q: 0.7, peak: 0.35, type: 'lowpass' })
    },
  },

  // PERFECT。キン！
  perfect: {
    file: null,
    gap: 0.05,
    synth: (c) => {
      const f = rand(1180, 0.03)
      tone(c, { type: 'sine', freq: f, dur: 0.4, peak: 0.34 })
      tone(c, { type: 'sine', freq: f * 1.5, dur: 0.3, peak: 0.2, delay: 0.02 })
      tone(c, { type: 'sine', freq: f * 2.02, dur: 0.22, peak: 0.12, delay: 0.04 })
    },
  },

  // コンボが伸びたときの短い上昇音。段が上がるほど高くなる。
  combo: {
    file: null,
    gap: 0.04,
    synth: (c, { step = 1 } = {}) => {
      const base = 620 * Math.pow(1.12, Math.min(step, 8))
      tone(c, { type: 'square', freq: base, to: base * 1.5, dur: 0.19, peak: 0.2 })
    },
  },

  // GOLDEN PERFECT。通常より豪華に、少しだけ長く。
  goldenPerfect: {
    file: null,
    gap: 0.2,
    synth: (c) => {
      const root = 880
      const steps = [0, 4, 7, 12, 16]
      steps.forEach((semi, i) => {
        tone(c, {
          type: 'triangle',
          freq: root * Math.pow(2, semi / 12),
          dur: 0.5 - i * 0.05,
          peak: 0.3,
          delay: i * 0.045,
        })
      })
      noise(c, { dur: 0.5, freq: 6200, q: 1.5, peak: 0.1, delay: 0.05 })
    },
  },

  // 鐘。カーン！ 倍音を少しずらして長く伸ばす。
  bell: {
    file: null,
    gap: 0.12,
    synth: (c, { power = 1 } = {}) => {
      const g = env(c, { attack: 0.008, decay: 2.6, peak: 0.85 * power })
      for (const [ratio, level] of [[1, 1], [2.76, 0.5], [5.4, 0.25], [8.9, 0.12]]) {
        const o = c.ctx.createOscillator()
        o.type = 'sine'
        o.frequency.value = rand(523, 0.02) * ratio
        const lg = c.ctx.createGain()
        lg.gain.value = level
        o.connect(lg).connect(g)
        o.start(c.now)
        o.stop(c.now + 2.7)
      }
    },
  },

  // 空き缶。ガラガラ。
  canCrash: {
    file: null,
    gap: 0.03,
    synth: (c, { power = 1 } = {}) => {
      noise(c, { dur: rand(0.12, 0.3), freq: rand(2400, 0.3), q: 3, peak: 0.45 * power })
    },
  },

  // 木箱。ゴトッ。
  crate: {
    file: null,
    gap: 0.05,
    synth: (c, { power = 1 } = {}) => {
      tone(c, { type: 'triangle', freq: rand(190, 0.1), to: 52, dur: 0.24, peak: 0.7 * power })
    },
  },

  // 鍵。カチャッ。
  keyUnlock: {
    file: null,
    gap: 0.3,
    synth: (c) => {
      noise(c, { dur: 0.05, freq: 3800, q: 6, peak: 0.5 })
      noise(c, { dur: 0.06, freq: 2600, q: 5, peak: 0.45, delay: 0.07 })
      tone(c, { type: 'square', freq: 1500, to: 900, dur: 0.08, peak: 0.16, delay: 0.07 })
    },
  },

  // 扉がひらく。低いきしみ。
  door: {
    file: null,
    gap: 0.4,
    synth: (c) => {
      tone(c, { type: 'sawtooth', freq: 120, to: 76, dur: 0.9, peak: 0.14 })
      noise(c, { dur: 0.9, freq: 500, q: 1.2, peak: 0.08 })
    },
  },

  // 雷神の着地。ストン！
  land: {
    file: null,
    gap: 0.1,
    synth: (c) => {
      tone(c, { type: 'sine', freq: 170, to: 44, dur: 0.3, peak: 0.8 })
      noise(c, { dur: 0.14, freq: 300, q: 0.7, peak: 0.3, type: 'lowpass' })
    },
  },

  // 雷。バリバリッ。
  thunder: {
    file: null,
    gap: 0.2,
    synth: (c) => {
      noise(c, { dur: 0.5, freq: 3000, q: 0.5, peak: 0.55, type: 'highpass' })
      noise(c, { dur: 0.9, freq: 200, q: 0.5, peak: 0.5, type: 'lowpass', delay: 0.04 })
      tone(c, { type: 'sawtooth', freq: 90, to: 38, dur: 0.7, peak: 0.35, delay: 0.03 })
    },
  },

  // ミッション達成。短い成功音。
  missionComplete: {
    file: null,
    gap: 0.15,
    synth: (c) => {
      ;[784, 988, 1319].forEach((f, i) =>
        tone(c, { type: 'triangle', freq: f, dur: 0.22, peak: 0.26, delay: i * 0.07 })
      )
    },
  },

  // クリアのファンファーレ。2〜3秒に収める。
  clear: {
    file: null,
    gap: 1.0,
    synth: (c) => {
      const seq = [
        [523, 0.0, 0.16],
        [659, 0.14, 0.16],
        [784, 0.28, 0.16],
        [1047, 0.44, 0.5],
        [1319, 0.5, 0.7],
      ]
      for (const [f, d, len] of seq) {
        tone(c, { type: 'triangle', freq: f, dur: len, peak: 0.3, delay: d })
        tone(c, { type: 'sine', freq: f * 2, dur: len * 0.7, peak: 0.12, delay: d })
      }
    },
  },
}

export class Sfx {
  constructor() {
    this.ctx = null
    this.muted = false
    this.last = {}
    this.buffers = {}
  }

  /** ブラウザの制限で、最初のクリックまで音は出せない。 */
  resume() {
    if (!CONFIG.audio.enabled || this.ctx) return
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    this.ctx = new AC()
    this.master = this.ctx.createGain()
    this.master.gain.value = this.muted ? 0 : CONFIG.audio.volume
    this.master.connect(this.ctx.destination)

    // ノイズ系で使い回す 1 秒ぶんのホワイトノイズ
    const len = this.ctx.sampleRate
    this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const d = this.noiseBuffer.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1

    this.initWind()
  }

  setVolume(v) {
    CONFIG.audio.volume = v
    if (this.master && !this.muted) this.master.gain.value = v
  }

  toggleMute() {
    this.muted = !this.muted
    if (this.master) this.master.gain.value = this.muted ? 0 : CONFIG.audio.volume
    return this.muted
  }

  /** 同じ音が短時間に重なりすぎないようにする。 */
  ready(name, gap) {
    if (!this.ctx || this.muted) return false
    const now = this.ctx.currentTime
    if (this.last[name] && now - this.last[name] < gap) return false
    this.last[name] = now
    return true
  }

  play(name, opts) {
    const src = SOURCES[name]
    if (!src || !this.ready(name, src.gap ?? 0.05)) return
    const c = { ctx: this.ctx, out: this.master, now: this.ctx.currentTime, noiseBuffer: this.noiseBuffer }
    if (src.file) {
      this.playFile(src.file, opts)
      return
    }
    src.synth(c, opts)
  }

  /** 将来、音声ファイルへ差し替えたときに使う。 */
  playFile(url, { power = 1 } = {}) {
    const buf = this.buffers[url]
    if (!buf) {
      if (this.buffers[url] === null) return
      this.buffers[url] = null
      fetch(url)
        .then((r) => r.arrayBuffer())
        .then((a) => this.ctx.decodeAudioData(a))
        .then((b) => {
          this.buffers[url] = b
        })
        .catch(() => {})
      return
    }
    const s = this.ctx.createBufferSource()
    s.buffer = buf
    s.playbackRate.value = rand(1, 0.05)
    const g = this.ctx.createGain()
    g.gain.value = rand(power, 0.08)
    s.connect(g).connect(this.master)
    s.start()
  }

  // ---- 風。止めずに鳴らし続け、音量だけを動かす ----
  initWind() {
    const src = this.ctx.createBufferSource()
    src.buffer = this.noiseBuffer
    src.loop = true
    const f = this.ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.value = 420
    f.Q.value = 0.6
    const g = this.ctx.createGain()
    g.gain.value = 0
    src.connect(f).connect(g).connect(this.master)
    src.start()
    this.windGain = g
    this.windFilter = f
  }

  /** 毎フレーム呼ぶ。strength 0〜1。0 になれば自然に消える。 */
  setWind(strength, strong) {
    if (!this.windGain) return
    const target = strength * (strong ? 0.34 : 0.16)
    const t = this.ctx.currentTime
    this.windGain.gain.setTargetAtTime(target, t, 0.25)
    this.windFilter.frequency.setTargetAtTime(360 + strength * 340, t, 0.3)
  }

  // ---- 呼び出し口。ゲーム側はこの名前しか知らない ----
  playHammerHit(power) { this.play('hammerHit', { power }) }
  playBlockSlide(power, bright) { this.play('blockSlide', { power, bright }) }
  playWeak() { this.play('weak') }
  playDanger() { this.play('danger') }
  playPerfect() { this.play('perfect') }
  playCombo(step) { this.play('combo', { step }) }
  playGoldenPerfect() { this.play('goldenPerfect') }
  playBell(power) { this.play('bell', { power }) }
  playCanCrash(power) { this.play('canCrash', { power }) }
  playCrate(power) { this.play('crate', { power }) }
  playKeyUnlock() { this.play('keyUnlock') }
  playDoor() { this.play('door') }
  playLand() { this.play('land') }
  playThunder() { this.play('thunder') }
  playMissionComplete() { this.play('missionComplete') }
  playClear() { this.play('clear') }
}
