import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { CONFIG } from './config.js'
import { createScene } from './scene.js'
import { OrbitCam } from './orbitcam.js'
import { createWorld } from './physics.js'
import { buildTower, syncMesh, tiltDegrees } from './tower.js'
import { Hammer } from './hammer.js'
import { Wind } from './wind.js'
import { Props } from './props.js'
import { Sfx } from './sfx.js'
import { UI } from './ui.js'

const HOVER_EMISSIVE = new THREE.Color(0x3a2205)
const SELECT_EMISSIVE = new THREE.Color(0x7a4a08)
const NO_EMISSIVE = new THREE.Color(0x000000)

const JUDGE = {
  weak: { kind: 'weak', text: 'WEAK' },
  good: { kind: 'perfect', text: 'PERFECT!' },
  over: { kind: 'danger', text: 'DANGER!' },
}

// 雷神のひとこと。キャラクターを感じられる程度に短く。
const LINES = {
  weak: ['よわい…', 'とどかん', 'もうひと押し'],
  perfect: ['いいぞ！', 'スコーン！', 'その調子'],
  danger: ['あぶない！', 'つよすぎ！', 'うおおっ'],
  combo: ['いいぞ！', '♪', 'のってきた'],
  hop: ['さいこう！', 'まだいける！'],
  wind: ['ふんばる…', 'かぜが…'],
}

const pick = (list) => list[Math.floor(Math.random() * list.length)]

export class Game {
  constructor(canvas, sprites) {
    const { renderer, scene } = createScene(canvas)
    this.renderer = renderer
    this.scene = scene
    this.canvas = canvas
    this.sprites = sprites
    this.keepTextures = new Set(Object.values(sprites))

    this.orbit = new OrbitCam(canvas)
    this.camera = this.orbit.camera

    this.cfg = CONFIG
    this.ui = new UI()
    this.sfx = new Sfx()
    this.hammer = new Hammer(scene)
    this.wind = new Wind(scene)
    this.raycaster = new THREE.Raycaster()
    this.pointer = new THREE.Vector2()
    this.clock = new THREE.Clock()
    this.time = 0
    this.drag = null

    // 使い回す作業用の入れもの
    this.dir = new THREE.Vector3()
    this.tmpVec = new THREE.Vector3()
    this.impulse = new CANNON.Vec3()
    this.offset = new CANNON.Vec3()

    this.reset()
    this.bindInput()

    addEventListener('resize', () => this.resize())
    this.resize()
  }

  resize() {
    const [w, h] = this.orbit.resize()
    this.renderer.setSize(w, h, false)
  }

  // ---------------------------------------------------------------- setup

  reset() {
    if (this.world) {
      this.props?.dispose()
      for (const p of this.pieces) {
        this.world.removeBody(p.body)
        this.scene.remove(p.mesh)
        this.disposeTree(p.mesh)
      }
      this.raizin?.view.dispose()
    }

    const { world, mats } = createWorld()
    this.world = world
    this.mats = mats
    world.addEventListener('preStep', () => this.preStep())

    const { blocks, raizin } = buildTower({
      scene: this.scene,
      world,
      mats,
      sprites: this.sprites,
    })
    this.blocks = blocks
    this.raizin = raizin
    this.pieces = [...blocks, raizin]

    this.props = new Props({ scene: this.scene, world, mats, sfx: this.sfx })
    this.wind.stop()

    this.state = 'idle' // idle / charging / swinging / settling / over
    this.selected = null
    this.hovered = null
    this.power = 0
    this.powerDir = 1
    this.strayCount = 0
    this.settleTimer = 0
    this.quietTimer = 0
    this.combo = 0

    this.hammer.reset()
    this.aimHammer(blocks[0])
    this.hammer.snapToAim()

    this.ui.hideResult()
    this.ui.setRemain(this.remaining)
    this.ui.setPower(0, false)
    this.ui.setPhase('ブロックを長押し')
    this.ui.setBlockType(null, null)
    this.ui.setWind(null)

    for (const p of this.pieces) syncMesh(p)
  }

  disposeTree(root) {
    root.traverse((o) => {
      o.geometry?.dispose?.()
      const list = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []
      for (const m of new Set(list)) {
        // 雷神の画像はゲーム全体で使い回すので捨てない
        if (m.map && !this.keepTextures.has(m.map)) m.map.dispose()
        m.dispose?.()
      }
    })
  }

  get remaining() {
    return this.blocks.filter((b) => b.state === 'tower').length
  }

  // ------------------------------------------------------- 物理サブステップ

  preStep() {
    this.keepSliding()
    if (this.wind.blowing) {
      const bodies = this.blocks
        .filter((b) => b.state === 'tower')
        .map((b) => ({ body: b.body, height: b.body.position.y / 6 }))
      this.wind.applyTo(bodies, this.raizin.body)
    }
  }

  /**
   * 抜けている最中のブロックが、上の段に当たって減速しないようにする。
   * 叩いた向きの成分だけを保証し、横方向のブレはそのまま残す。
   */
  keepSliding() {
    for (const b of this.blocks) {
      if (!b.slideUntil || this.time > b.slideUntil) continue
      const v = b.body.velocity
      const along = v.x * b.slideDir.x + v.z * b.slideDir.z
      if (along < b.slideSpeed) {
        const add = b.slideSpeed - along
        v.x += add * b.slideDir.x
        v.z += add * b.slideDir.z
        b.body.wakeUp()
      }
    }
  }

  // ------------------------------------------------------------- 入力

  bindInput() {
    const toPointer = (e) => {
      this.pointer.x = (e.clientX / Math.max(1, innerWidth)) * 2 - 1
      this.pointer.y = -(e.clientY / Math.max(1, innerHeight)) * 2 + 1
    }

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault())

    this.canvas.addEventListener('pointerdown', (e) => {
      this.sfx.resume()
      toPointer(e)

      // 右ドラッグはいつでもカメラ。左ドラッグは「ブロックを掴んでいないとき」だけカメラ。
      // こうしておくと、視点を回しただけで叩いてしまうことがない。
      if (e.button === 0 && this.state === 'idle') {
        this.updateHover()
        if (this.hovered) {
          this.select(this.hovered)
          this.state = 'charging'
          this.power = 0
          this.powerDir = 1
          this.ui.setPhase('離すと叩く')
          return
        }
      }
      if (e.button !== 0 && e.button !== 2) return
      this.drag = { x: e.clientX, y: e.clientY }
      this.canvas.setPointerCapture?.(e.pointerId)
    })

    addEventListener('pointermove', (e) => {
      toPointer(e)
      if (this.drag) {
        this.orbit.rotate(e.clientX - this.drag.x, e.clientY - this.drag.y)
        this.drag.x = e.clientX
        this.drag.y = e.clientY
        return
      }
      if (this.state === 'idle') this.updateHover()
    })

    addEventListener('pointerup', (e) => {
      if (this.drag) {
        this.drag = null
        this.canvas.releasePointerCapture?.(e.pointerId)
        if (this.state === 'idle') this.updateHover()
        return
      }
      if (this.state !== 'charging') return
      this.state = 'swinging'
      this.ui.setPhase('—')
      const power = this.power
      const target = this.selected
      // 離した瞬間の向きで確定させる。振っている最中に向きは変わらない。
      const dir = this.hitDirection(target).clone()
      this.hammer.swing(() => this.applyHit(target, power, dir))
    })

    this.canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault()
        this.orbit.zoom(e.deltaY)
      },
      { passive: false }
    )

    this.ui.retry.addEventListener('click', () => this.reset())
    addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase()
      if (k === 'r') this.reset()
      if (k === 'c') this.orbit.reset()
      if (k === 'm') this.sfx.toggleMute()
    })
  }

  // ------------------------------------------------------------- 狙い

  /**
   * 叩く向き＝カメラからブロックへ向かう水平方向。
   * ハンマーはこの手前（カメラ側）に待機し、ブロックはこの向きへ抜けていく。
   */
  hitDirection(piece) {
    const p = piece ? piece.body.position : { x: 0, y: 0, z: 0 }
    this.dir.set(p.x - this.camera.position.x, 0, p.z - this.camera.position.z)
    if (this.dir.lengthSq() < 1e-6) this.dir.set(0, 0, -1)
    this.dir.normalize()
    // 真正面から振ると、ハンマーがカメラとブロックのちょうど間に来て
    // 塔に突き刺さったように見える。少し横へ回してから振り込む。
    const a = CONFIG.hammer.sideOffset
    if (a) {
      const c = Math.cos(a)
      const s = Math.sin(a)
      const x = this.dir.x * c - this.dir.z * s
      const z = this.dir.x * s + this.dir.z * c
      this.dir.set(x, 0, z)
    }
    return this.dir
  }

  /** ブロック中心から、その向きの表面までの距離。ハンマーを表面で止めるのに使う。 */
  surfaceDistance(dir) {
    const hx = CONFIG.block.width / 2
    const hz = CONFIG.block.depth / 2
    return Math.min(hx / Math.max(1e-4, Math.abs(dir.x)), hz / Math.max(1e-4, Math.abs(dir.z)))
  }

  aimHammer(piece) {
    if (!piece) return
    const dir = this.hitDirection(piece)
    this.tmpVec.set(piece.body.position.x, piece.body.position.y, piece.body.position.z)
    this.hammer.aim(this.tmpVec, dir, this.surfaceDistance(dir))
  }

  // ------------------------------------------------------------- 選択まわり

  updateHover() {
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const meshes = this.blocks.filter((b) => b.state === 'tower').map((b) => b.mesh)
    const hit = this.raycaster.intersectObjects(meshes, false)[0]
    const piece = hit ? this.blocks.find((b) => b.mesh === hit.object) : null

    if (piece !== this.hovered) {
      this.hovered = piece
      this.canvas.style.cursor = piece ? 'pointer' : 'grab'
      this.refreshHighlights()
      const shown = this.selected || piece
      this.ui.setBlockType(shown?.type ?? null, shown?.typeKey ?? null)
      if (shown) this.ui.setZone(shown.type)
    }
  }

  select(piece) {
    this.selected = piece
    this.ui.setBlockType(piece.type, piece.typeKey)
    this.ui.setZone(piece.type)
    this.refreshHighlights()
  }

  refreshHighlights() {
    for (const b of this.blocks) {
      const c =
        b === this.selected ? SELECT_EMISSIVE : b === this.hovered ? HOVER_EMISSIVE : NO_EMISSIVE
      b.sideMat.emissive.copy(c)
      b.capMat.emissive.copy(c)
    }
  }

  clearHighlights() {
    this.hovered = null
    this.selected = null
    this.refreshHighlights()
  }

  // ------------------------------------------------------------- 叩く処理

  applyHit(piece, power, dir) {
    if (!piece || piece.state !== 'tower') {
      this.state = 'settling'
      return
    }

    const H = CONFIG.hit
    const type = piece.type
    // 「ちょうどいい」の位置はブロックの種類ごとに違う
    const band = power < type.weakMax ? 'weak' : power <= type.goodMax ? 'good' : 'over'
    // 斜めへ抜けるときは移動距離が伸びるので、抜けきるまでの時間が
    // どの向きでも同じになるように速度を上げる。
    const reach = 1 / Math.max(Math.abs(dir.x), Math.abs(dir.z))
    const speed =
      (H.speedMin + (H.speedMax - H.speedMin) * power) *
      type.speedScale *
      Math.pow(reach, H.diagonalBoost)

    for (const p of this.pieces) p.body.wakeUp()

    const body = piece.body
    piece.wasHit = true

    // ここが「スコーン！」の肝。叩いた瞬間だけ摩擦を消したうえで、
    // 一定時間は叩いた向きの速度が落ちないよう保証する。
    // こうしないと、落ちてきた上の段の角に引っかかって途中で止まってしまう。
    // 弱すぎるときはこの時間がごく短いので、少し動いただけで荷重に負けて止まる。
    body.material = this.mats.slip
    piece.slideDir = { x: dir.x, z: dir.z }
    piece.slideSpeed = speed
    piece.slideUntil = this.time + (band === 'weak' ? H.weakSlideTime : H.slideTime)

    this.impulse.set(dir.x * speed * body.mass, 0, dir.z * speed * body.mass)
    this.offset.set(0, 0, 0)

    if (band === 'over') {
      this.impulse.y = speed * body.mass * H.overhitLift
      // 重心より下を叩いて暴れさせる
      this.offset.set(0, -CONFIG.block.height * 0.34, 0)
      const excess = this.overhitExcess(power, type)
      // 進行方向に対して横倒しになる向きへ回す
      const spin = H.overhitTorque * excess * (0.6 + Math.random() * 0.8)
      body.angularVelocity.x += dir.z * spin
      body.angularVelocity.z += -dir.x * spin
    }

    body.applyImpulse(this.impulse, this.offset)

    // 上に乗っているもの（ブロック＋雷神）への影響。下から順に並べる。
    const above = [
      ...this.blocks.filter((b) => b.state === 'tower' && b.index > piece.index),
      this.raizin,
    ]
    const excess = band === 'over' ? this.overhitExcess(power, type) : 0

    for (let k = 0; k < above.length; k++) {
      const a = above[k]
      const m = a.body.mass
      // 叩いた段から遠いほど衝撃は弱まる。これがないと、細長い塔では
      // 一番上まで同じ強さで揺すられて、まともな一撃でも崩れてしまう。
      const atten = 1 / (1 + H.shockFalloff * k)
      const shake = H.shakeAbove * excess * m * atten * (0.55 + Math.random() * 0.9)
      const jitter = H.jitter * (0.4 + power) * m * atten
      // 重心より上を押すことで、まっすぐ飛ばずに「傾く／ぐらつく」動きになる。
      // てこの長さは背の高さなり。ブロックに雷神と同じ高さで加えると簡単に崩れてしまう。
      const lever = a.kind === 'raizin' ? H.shakeHeight : CONFIG.block.height * 0.3
      this.impulse.set(
        dir.x * shake + (Math.random() - 0.5) * jitter,
        0,
        dir.z * shake + (Math.random() - 0.5) * jitter
      )
      this.offset.set(0, lever * (0.3 + Math.random() * 0.7), 0)
      a.body.applyImpulse(this.impulse, this.offset)
    }

    this.lastBand = band
    this.state = 'settling'
    this.settleTimer = 0
    this.quietTimer = 0
  }

  /** 「強すぎ」の踏み越え具合を 0〜1 で返す。少し超えただけでも効くよう曲げてある。 */
  overhitExcess(power, type) {
    const H = CONFIG.hit
    const raw = (power - type.goodMax) / Math.max(0.01, 1 - type.goodMax)
    return Math.pow(Math.max(0, Math.min(1, raw)), H.overhitCurve)
  }

  // ------------------------------------------------------------- 毎フレーム

  update(dt) {
    this.time += dt

    if (this.state === 'charging') {
      const rate = 1 / CONFIG.hit.chargeCycle
      this.power += this.powerDir * rate * dt
      if (this.power >= 1) {
        this.power = 1
        this.powerDir = -1
      } else if (this.power <= 0) {
        this.power = 0
        this.powerDir = 1
      }
      this.ui.setPower(this.power, true)
    } else if (this.state === 'idle') {
      this.ui.setPower(0, false)
    }

    // 待機中のハンマーはカメラ側に付いてくる。振っている間は固定される。
    if (!this.hammer.busy) {
      this.aimHammer(this.selected || this.lowestBlock())
    }
    this.hammer.update(dt)

    this.orbit.updateBob(dt)
    this.wind.update(dt)
    this.updateWindUI()

    this.world.step(CONFIG.physics.fixedStep, dt, CONFIG.physics.maxSubSteps)

    // 抜けの保証が切れたら、ふつうの木材に戻して自然に減速させる
    for (const b of this.blocks) {
      if (b.slideUntil && this.time > b.slideUntil) {
        b.body.material = b.baseMaterial
        b.slideUntil = 0
      }
    }

    this.updatePieceStates()
    this.props.update(dt)

    for (const p of this.pieces) syncMesh(p)

    // 塔が低くなっても、だるま落とし全体が画面の中心に来るようにする
    const top = this.raizin.mesh.position.y + this.raizin.view.baseY + CONFIG.raizin.height
    this.orbit.follow(top, dt)

    this.raizin.view.update(this.camera, this.raizin.mesh, dt)
    this.ui.updateBubble(this.raizinScreenPos(), this.time)

    if (this.state === 'settling') this.updateSettling(dt)

    this.renderer.render(this.scene, this.camera)
  }

  lowestBlock() {
    return this.blocks.find((b) => b.state === 'tower') || null
  }

  /** 雷神の頭の上を画面座標へ。吹き出しを置くのに使う。 */
  raizinScreenPos() {
    const g = this.raizin.mesh
    this.tmpVec.set(0, this.raizin.view.baseY + CONFIG.raizin.height + 0.25, 0)
    g.localToWorld(this.tmpVec).project(this.camera)
    if (this.tmpVec.z > 1) return null
    return {
      x: (this.tmpVec.x * 0.5 + 0.5) * innerWidth,
      y: (-this.tmpVec.y * 0.5 + 0.5) * innerHeight,
    }
  }

  updateWindUI() {
    if (this.wind.idle) {
      this.ui.setWind(null)
      return
    }
    // 風がどちらへ吹いているかは、いま見ている向きによって左右が変わる。
    // 画面上の見えかたに合わせて矢印を出す。
    const right = this.tmpVec.set(1, 0, 0).applyQuaternion(this.camera.quaternion)
    const arrow = this.wind.dir * right.x >= 0 ? '→' : '←'
    this.ui.setWind({ arrow, label: this.wind.label, warning: this.wind.warning })
  }

  updatePieceStates() {
    const R = CONFIG.rules
    for (const b of this.blocks) {
      if (b.state !== 'tower') {
        // 遠くへ行ったものは片付ける
        if (!b.despawned) {
          const pos = b.body.position
          if (Math.hypot(pos.x, pos.z) > R.despawnDistance || pos.y < -12) {
            b.despawned = true
            b.mesh.visible = false
            this.world.removeBody(b.body)
          }
        }
        continue
      }
      const pos = b.body.position
      if (Math.hypot(pos.x, pos.z) > R.clearOutFactor * CONFIG.block.width || pos.y < -1) {
        b.state = 'out'
        if (!b.wasHit) this.strayCount++
        this.ui.setRemain(this.remaining)
      }
    }
  }

  updateSettling(dt) {
    const R = CONFIG.rules
    this.settleTimer += dt

    const watched = [...this.blocks.filter((b) => b.state === 'tower'), this.raizin]
    const moving = watched.some(
      (p) =>
        p.body.velocity.length() > R.settleSpeed ||
        p.body.angularVelocity.length() > R.settleSpeed * 2
    )

    this.quietTimer = moving ? 0 : this.quietTimer + dt

    if (this.quietTimer >= R.settleHold || this.settleTimer >= R.settleTimeout) {
      this.finishTurn()
    }
  }

  finishTurn() {
    const band = this.lastBand
    const fail = this.checkFailure()
    this.clearHighlights()
    this.ui.setRemain(this.remaining)
    this.ui.setPower(0, false)
    this.ui.setBlockType(null, null)

    if (band) this.showJudgement(band, fail)

    if (fail) {
      this.combo = 0
      this.state = 'over'
      this.ui.setPhase('—')
      this.ui.showResult('GAME OVER', fail, false)
      return
    }

    if (this.remaining === 0) {
      this.state = 'over'
      this.ui.setPhase('—')
      this.ui.showResult('CLEAR！', '雷神は最後まで倒れなかった', true)
      return
    }

    this.state = 'idle'
    this.ui.setPhase('ブロックを長押し')
    this.updateHover()

    if (this.wind.maybeStart()) this.say(pick(LINES.wind), 1.6)
  }

  /** WEAK / PERFECT / DANGER の表示と、PERFECT コンボの更新。 */
  showJudgement(band, failed) {
    const j = JUDGE[band]
    this.ui.showJudge(j.kind, j.text)

    if (band === 'good' && !failed) {
      this.combo++
      this.ui.showCombo(this.combo)
      this.sfx.combo(this.combo)
      this.onCombo(this.combo)
    } else {
      // PERFECT 以外はコンボ終了。分かりやすさを優先して例外は作らない。
      this.combo = 0
      this.say(pick(band === 'weak' ? LINES.weak : LINES.danger), 1.3)
    }
    this.lastBand = null
  }

  onCombo(count) {
    const C = CONFIG.combo
    if (count >= C.bounceFrom) this.orbit.bob(C.cameraBob)
    if (count >= C.hopFrom) {
      this.raizin.view.bounce(1)
      this.say(pick(LINES.hop), 1.5)
    } else if (count >= C.cheerFrom) {
      this.raizin.view.bounce(0.45)
      this.say(pick(LINES.combo), 1.3)
    } else {
      this.say(pick(LINES.perfect), 1.1)
    }
  }

  say(text, seconds) {
    this.ui.say(text, seconds, this.time)
  }

  /** ゲームオーバーなら理由の文字列、そうでなければ null。 */
  checkFailure() {
    const R = CONFIG.raizin
    const body = this.raizin.body
    const tilt = tiltDegrees(body)
    const bottom = body.position.y + (R.comDrop - R.height / 2)

    if (tilt > R.fallTiltDeg) return '雷神が倒れた'
    if (Math.hypot(body.position.x, body.position.z) > R.slideLimit) return '雷神が落ちた'
    if (bottom < 0.2 && this.remaining > 0) return '雷神が地面まで落ちた'
    if (this.strayCount >= CONFIG.rules.strayLimit) return '塔が崩れた'
    return null
  }

  start() {
    const loop = () => {
      requestAnimationFrame(loop)
      const dt = Math.min(this.clock.getDelta(), 0.05)
      this.update(dt)
    }
    loop()
  }
}
