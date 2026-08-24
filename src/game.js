import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { CONFIG } from './config.js'
import { createScene } from './scene.js'
import { OrbitCam } from './orbitcam.js'
import { createWorld } from './physics.js'
import { buildTower, syncMesh, tiltDegrees } from './tower.js'
import { Hammer } from './hammer.js'
import { UI } from './ui.js'

const HOVER_EMISSIVE = new THREE.Color(0x3a2205)
const SELECT_EMISSIVE = new THREE.Color(0x7a4a08)
const NO_EMISSIVE = new THREE.Color(0x000000)

// ハンマーが振られる向き。ブロックはこの方向へ飛ぶ（CONFIG.hammer.dir で左右を変えられる）
const HIT_DIR = CONFIG.hammer.dir

/** 「強すぎ」の踏み越え具合を 0〜1 で返す。少し超えただけでも効くよう曲げてある。 */
function overhitExcess(power) {
  const H = CONFIG.hit
  const raw = (power - H.goodMax) / (1 - H.goodMax)
  return Math.pow(Math.max(0, Math.min(1, raw)), H.overhitCurve)
}

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
    this.hammer = new Hammer(scene)
    this.raycaster = new THREE.Raycaster()
    this.pointer = new THREE.Vector2()
    this.clock = new THREE.Clock()
    this.time = 0
    this.drag = null

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
    // 抜けている最中のブロックは、サブステップごとに横向きの速度を維持する
    world.addEventListener('preStep', () => this.keepSliding())

    const { blocks, raizin } = buildTower({
      scene: this.scene,
      world,
      mats,
      sprites: this.sprites,
    })
    this.blocks = blocks
    this.raizin = raizin
    this.pieces = [...blocks, raizin]

    this.state = 'idle' // idle / charging / swinging / settling / over
    this.selected = null
    this.hovered = null
    this.power = 0
    this.powerDir = 1
    this.strayCount = 0
    this.settleTimer = 0
    this.quietTimer = 0

    this.hammer.reset()
    this.hammer.aimAt(blocks[0].body.position.y)
    this.hammer.snapToAim()

    this.ui.hideResult()
    this.ui.setRemain(this.remaining)
    this.ui.setPower(0, false)
    this.ui.setPhase('ブロックを長押し')

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

  /** 抜けている最中のブロックが、上の段に当たって減速しないようにする。 */
  keepSliding() {
    for (const b of this.blocks) {
      if (!b.slideUntil || this.time > b.slideUntil) continue
      const v = b.body.velocity
      if (Math.sign(v.x) !== Math.sign(b.slideVx) || Math.abs(v.x) < Math.abs(b.slideVx)) {
        v.x = b.slideVx
        b.body.wakeUp()
      }
    }
  }

  get remaining() {
    return this.blocks.filter((b) => b.state === 'tower').length
  }

  // ------------------------------------------------------------- 入力

  bindInput() {
    const toPointer = (e) => {
      this.pointer.x = (e.clientX / Math.max(1, innerWidth)) * 2 - 1
      this.pointer.y = -(e.clientY / Math.max(1, innerHeight)) * 2 + 1
    }

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault())

    this.canvas.addEventListener('pointerdown', (e) => {
      toPointer(e)

      // 右ドラッグはいつでもカメラ。左ドラッグは「ブロックを掴んでいないとき」だけカメラ。
      // こうしておくと、叩く操作と視点操作がぶつからない。
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
      this.hammer.swing(() => this.applyHit(target, power))
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
      if (e.key === 'r' || e.key === 'R') this.reset()
      if (e.key === 'c' || e.key === 'C') this.orbit.reset()
    })
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
    }
  }

  select(piece) {
    this.selected = piece
    this.hammer.aimAt(piece.body.position.y)
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

  applyHit(piece, power) {
    if (!piece || piece.state !== 'tower') {
      this.state = 'settling'
      return
    }

    const H = CONFIG.hit
    const speed = H.speedMin + (H.speedMax - H.speedMin) * power
    const band = power < H.weakMax ? 'weak' : power <= H.goodMax ? 'good' : 'over'

    for (const p of this.pieces) p.body.wakeUp()

    const body = piece.body
    piece.wasHit = true

    // ここが「スコーン！」の肝。叩いた瞬間だけ摩擦を消したうえで、
    // 一定時間は横向きの速度が落ちないよう保証する。
    // こうしないと、落ちてきた上の段の角に引っかかって途中で止まってしまう。
    // 弱すぎるときはこの時間がごく短いので、少し動いただけで荷重に負けて止まる。
    body.material = this.mats.slip
    piece.slideVx = HIT_DIR * speed
    piece.slideUntil = this.time + (band === 'weak' ? H.weakSlideTime : H.slideTime)

    const impulse = new CANNON.Vec3(HIT_DIR * speed * body.mass, 0, 0)
    let offset = new CANNON.Vec3(0, 0, 0)

    if (band === 'over') {
      impulse.y = speed * body.mass * H.overhitLift
      // 重心より下を叩いて暴れさせる
      offset = new CANNON.Vec3(0, -CONFIG.block.height * 0.34, 0)
      const excess = overhitExcess(power)
      body.angularVelocity.z -= HIT_DIR * H.overhitTorque * excess * (0.6 + Math.random() * 0.8)
    }

    body.applyImpulse(impulse, offset)

    // 上に乗っているもの（ブロック＋雷神）への影響。下から順に並べる。
    const above = [
      ...this.blocks.filter((b) => b.state === 'tower' && b.index > piece.index),
      this.raizin,
    ]
    const excess = band === 'over' ? overhitExcess(power) : 0

    for (let k = 0; k < above.length; k++) {
      const a = above[k]
      const m = a.body.mass
      // 叩いた段から遠いほど衝撃は弱まる。これがないと、10段の細長い塔では
      // 一番上まで同じ強さで揺すられて、まともな一撃でも崩れてしまう。
      const atten = 1 / (1 + H.shockFalloff * k)
      const shake = HIT_DIR * H.shakeAbove * excess * m * atten * (0.55 + Math.random() * 0.9)
      const jitter = H.jitter * (0.4 + power) * m * atten
      // 重心より上を押すことで、まっすぐ飛ばずに「傾く／ぐらつく」動きになる。
      // てこの長さは背の高さなり。ブロックに雷神と同じ高さで加えると簡単に崩れてしまう。
      const lever = a.kind === 'raizin' ? H.shakeHeight : CONFIG.block.height * 0.3
      a.body.applyImpulse(
        new CANNON.Vec3(
          shake + (Math.random() - 0.5) * jitter,
          0,
          (Math.random() - 0.5) * jitter * 0.8
        ),
        new CANNON.Vec3(0, lever * (0.3 + Math.random() * 0.7), 0)
      )
    }

    this.state = 'settling'
    this.settleTimer = 0
    this.quietTimer = 0
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

    this.hammer.update(dt)

    this.world.step(CONFIG.physics.fixedStep, dt, CONFIG.physics.maxSubSteps)

    // 抜けの保証が切れたら、ふつうの木材に戻して自然に減速させる
    for (const b of this.blocks) {
      if (b.slideUntil && this.time > b.slideUntil) {
        b.body.material = this.mats.block
        b.slideUntil = 0
      }
    }

    this.updatePieceStates()

    for (const p of this.pieces) syncMesh(p)

    // 塔が低くなっても、だるま落とし全体が画面の中心に来るようにする
    const top = this.raizin.mesh.position.y + this.raizin.view.mesh.position.y + CONFIG.raizin.height
    this.orbit.follow(top, dt)

    this.raizin.view.update(this.camera, this.raizin.mesh)

    if (this.state === 'settling') this.updateSettling(dt)

    this.renderer.render(this.scene, this.camera)
  }

  updatePieceStates() {
    const R = CONFIG.rules
    for (const b of this.blocks) {
      if (b.state !== 'tower') {
        // 遠くへ行ったものは片付ける
        if (!b.despawned) {
          const pos = b.body.position
          if (Math.abs(pos.x) > R.despawnDistance || pos.y < -12) {
            b.despawned = true
            b.mesh.visible = false
            this.world.removeBody(b.body)
          }
        }
        continue
      }
      const pos = b.body.position
      if (
        Math.abs(pos.x) > R.clearOutDistance ||
        Math.abs(pos.z) > R.clearOutDistance ||
        pos.y < -1
      ) {
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
    const fail = this.checkFailure()
    this.clearHighlights()
    this.ui.setRemain(this.remaining)
    this.ui.setPower(0, false)

    if (fail) {
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
  }

  /** ゲームオーバーなら理由の文字列、そうでなければ null。 */
  checkFailure() {
    const R = CONFIG.raizin
    const body = this.raizin.body
    const tilt = tiltDegrees(body)
    const bottom = body.position.y + (R.comDrop - R.height / 2)

    if (tilt > R.fallTiltDeg) return '雷神が倒れた'
    if (Math.abs(body.position.x) > R.slideLimit || Math.abs(body.position.z) > R.slideLimit)
      return '雷神が落ちた'
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
