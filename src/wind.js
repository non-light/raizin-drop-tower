import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { CONFIG } from './config.js'

/**
 * 風イベント。
 *
 * 予兆 → 徐々に強く → しばらく吹く → 徐々に弱く、の順で必ず進む。
 * 予兆の間はまだ力が加わらないので、「今は叩かない」「かまわず叩く」を
 * プレイヤーが選べる。風だけでは倒れない強さにしてある。
 */
export class Wind {
  constructor(scene) {
    this.phase = 'off' // off / telegraph / rampUp / hold / rampDown
    this.timer = 0
    this.holdTime = 0
    this.dir = -1 // -1 = 左へ吹く / +1 = 右へ吹く
    this.accel = 0
    this.strength = 0 // 0〜1。見た目と力の両方に使う
    this.label = ''
    this.turnsSinceWind = 0
    this.turns = 0

    this.streaks = makeStreaks(scene)
  }

  get blowing() {
    return this.phase === 'rampUp' || this.phase === 'hold' || this.phase === 'rampDown'
  }

  get warning() {
    return this.phase === 'telegraph'
  }

  get idle() {
    return this.phase === 'off'
  }

  /** ターンが終わって操作できる状態になったときに呼ぶ。条件を満たせば風が始まる。 */
  maybeStart() {
    const W = CONFIG.wind
    this.turns++
    this.turnsSinceWind++
    if (!W.enabled || this.phase !== 'off') return false
    if (this.turns <= W.firstIdleTurns) return false
    if (this.turnsSinceWind < W.minTurnsBetween) return false
    if (Math.random() > W.chancePerTurn) return false

    const strong = Math.random() < W.strongChance
    this.dir = Math.random() < 0.5 ? -1 : 1
    this.accel = strong ? W.strongAccel : W.breezeAccel
    this.label = strong ? 'STRONG WIND' : 'BREEZE'
    this.phase = 'telegraph'
    this.timer = 0
    this.holdTime = W.holdMin + Math.random() * (W.holdMax - W.holdMin)
    this.turnsSinceWind = 0
    return true
  }

  update(dt) {
    const W = CONFIG.wind
    if (this.phase === 'off') {
      this.strength = 0
    } else {
      this.timer += dt
      if (this.phase === 'telegraph') {
        this.strength = 0
        if (this.timer >= W.telegraph) this.next('rampUp')
      } else if (this.phase === 'rampUp') {
        this.strength = Math.min(1, this.timer / W.rampUp)
        if (this.timer >= W.rampUp) this.next('hold')
      } else if (this.phase === 'hold') {
        this.strength = 1
        if (this.timer >= this.holdTime) this.next('rampDown')
      } else if (this.phase === 'rampDown') {
        this.strength = Math.max(0, 1 - this.timer / W.rampDown)
        if (this.timer >= W.rampDown) this.next('off')
      }
    }
    this.updateStreaks(dt)
  }

  next(phase) {
    this.phase = phase
    this.timer = 0
  }

  stop() {
    this.phase = 'off'
    this.timer = 0
    this.strength = 0
    this.turnsSinceWind = 0
    this.turns = 0
    this.updateStreaks(0)
  }

  /**
   * 塔と雷神に風を当てる。物理のサブステップごとに呼ばれる。
   * 高い段ほど強く受けるので、塔全体が平行移動するのではなく「しなる」。
   */
  applyTo(bodies, raizinBody) {
    if (!this.blowing || this.strength <= 0) return
    const W = CONFIG.wind
    const a = this.accel * this.strength * this.dir

    for (const { body, height } of bodies) {
      const gain = 1 + W.heightGain * height
      FORCE.set(a * body.mass * gain, 0, 0)
      body.applyForce(FORCE)
      body.wakeUp()
    }

    if (raizinBody) {
      FORCE.set(a * raizinBody.mass * W.raizinExposure, 0, 0)
      AT.set(0, W.raizinLever, 0)
      raizinBody.applyForce(FORCE, AT)
      raizinBody.wakeUp()
    }
  }

  updateStreaks(dt) {
    const s = this.streaks
    const visible = this.strength > 0.02
    s.line.visible = visible
    if (!visible) return

    s.line.material.opacity = 0.10 + 0.32 * this.strength
    const speed = (6 + 22 * this.strength) * this.dir
    const pos = s.geometry.attributes.position
    const arr = pos.array
    for (let i = 0; i < arr.length; i += 6) {
      arr[i] += speed * dt
      arr[i + 3] += speed * dt
      if (speed < 0 ? arr[i + 3] < -s.range : arr[i] > s.range) {
        const x = speed < 0 ? s.range : -s.range
        arr[i] = x
        arr[i + 3] = x + s.len[i / 6] * Math.sign(speed)
      }
    }
    pos.needsUpdate = true
  }
}

const FORCE = new CANNON.Vec3()
const AT = new CANNON.Vec3()

/** 空気の流れを示す短い線。派手にしない。 */
function makeStreaks(scene) {
  const n = CONFIG.wind.streaks
  const range = 17
  const positions = new Float32Array(n * 6)
  const len = []
  for (let i = 0; i < n; i++) {
    const x = (Math.random() * 2 - 1) * range
    const y = 0.3 + Math.random() * 8.5
    const z = (Math.random() * 2 - 1) * 9
    const l = 0.7 + Math.random() * 1.8
    len.push(l)
    positions.set([x, y, z, x + l, y, z], i * 6)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const line = new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({ color: 0xbcd6ff, transparent: true, opacity: 0 })
  )
  line.visible = false
  line.frustumCulled = false
  scene.add(line)
  return { line, geometry, range, len }
}
