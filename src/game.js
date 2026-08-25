import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { CONFIG } from './config.js'
import { createScene, applyStage } from './scene.js'
import { STAGES, getStage, buildScenery } from './stages.js'
import { OrbitCam } from './orbitcam.js'
import { createWorld } from './physics.js'
import { buildTower, syncMesh, tiltDegrees } from './tower.js'
import { Hammer } from './hammer.js'
import { Wind } from './wind.js'
import { Props } from './props.js'
import { Sfx } from './sfx.js'
import { Bonus } from './bonus.js'
import { Lightning } from './finale.js'
import { Missions } from './missions.js'
import { Achievements } from './achievements.js'
import { pickTitle } from './titles.js'
import { Triggers } from './triggers.js'
import { Hazards } from './hazards.js'
import { UI } from './ui.js'

const HOVER_EMISSIVE = new THREE.Color(0x3a2205)
const SELECT_EMISSIVE = new THREE.Color(0x7a4a08)
const NO_EMISSIVE = new THREE.Color(0x000000)

const JUDGE = {
  weak: { kind: 'weak', text: 'WEAK' },
  good: { kind: 'good', text: 'GOOD' },
  perfect: { kind: 'perfect', text: 'PERFECT!' },
  over: { kind: 'danger', text: 'DANGER!' },
  golden: { kind: 'golden', text: 'GOLDEN PERFECT!' },
  goldWeak: { kind: 'goldfail', text: 'TOO WEAK' },
  goldOver: { kind: 'goldfail', text: 'TOO STRONG' },
}

// 雷神のひとこと。キャラクターを感じられる程度に短く。
const LINES = {
  weak: ['よわい…', 'とどかん', 'もうひと押し'],
  good: ['ぬけた！', 'まずまず', 'おしい…'],
  perfect: ['いいぞ！', 'スコーン！', 'その調子'],
  over: ['あぶない！', 'つよすぎ！', 'うおおっ'],
  combo: ['いいぞ！', '♪', 'のってきた'],
  hop: ['さいこう！', 'まだいける！'],
  wind: ['ふんばる…', 'かぜが…'],
  golden: ['ぬおおっ！', 'これは…！'],
  mission: ['やった！', 'いいね！'],
  // クリアしたときの一言。達成ぐあいで少しだけ変える。
  clear: ['やった！', 'よし！', '成功！', 'いい一撃！'],
  clearMissions: ['完璧！', '全部できた！', 'やるね！'],
  clearGolden: ['金ぴか！', 'すごい！', '黄金だ！'],
}

// 妨害が始まったときのひとこと
const HAZARD_LINES = {
  darkcloud: ['見えなくても……いける？', 'くもった…'],
  onechance: ['いっぱつ。'],
  moving: ['まと が うごく…'],
  blackout: ['まっくら！'],
  feint: ['ゆさぶってくるぞ'],
  any: ['なにか くる'],
}

const pick = (list) => list[Math.floor(Math.random() * list.length)]
const lerp = (a, b, t) => a + (b - a) * t

/**
 * ブロックが物理的に何かへ触れはじめる距離。
 * 見た目は円柱だが当たり判定は箱なので、対角では半径の√2倍まで届く。
 * トリガーはこの距離に合わせておかないと、物理では当たって弾かれているのに
 * イベントだけ鳴らない、ということが起きる。
 */
function blockReach() {
  const B = CONFIG.block
  const base = B.shape === 'box' ? B.radius * B.shapeScale * Math.SQRT2 : B.radius
  return base + CONFIG.triggers.blockRadiusPad
}

const STAGE_KEY = 'raizin-drop-tower/stage'
const loadStage = () => {
  try {
    return localStorage.getItem(STAGE_KEY) || 'shrine'
  } catch {
    return 'shrine'
  }
}
const saveStage = (id) => {
  try {
    localStorage.setItem(STAGE_KEY, id)
  } catch {
    // 保存できなくても遊べなくはしない
  }
}

export class Game {
  constructor(canvas, sprites) {
    const sceneCtx = createScene(canvas)
    this.sceneCtx = sceneCtx
    this.renderer = sceneCtx.renderer
    this.scene = sceneCtx.scene
    this.canvas = canvas
    this.sprites = sprites
    this.keepTextures = new Set(Object.values(sprites))

    this.orbit = new OrbitCam(canvas)
    this.camera = this.orbit.camera

    this.cfg = CONFIG
    this.ui = new UI()
    this.sfx = new Sfx()
    this.hammer = new Hammer(this.scene)
    this.wind = new Wind(this.scene)
    this.lightning = new Lightning(this.scene)
    this.triggers = new Triggers(this.scene)
    this.hazards = new Hazards()
    this.prevMissionIds = []
    // 実績はプレイをまたいで残る
    this.achievements = new Achievements()
    this.raycaster = new THREE.Raycaster()
    this.pointer = new THREE.Vector2()
    this.clock = new THREE.Clock()
    this.time = 0
    this.drag = null

    // 使い回す作業用の入れもの
    this.dir = new THREE.Vector3()
    this.tmpVec = new THREE.Vector3()
    this.hitPoint = new THREE.Vector3()
    this.aimPoint = new THREE.Vector3()
    this.impulse = new CANNON.Vec3()
    this.offset = new CANNON.Vec3()

    this.timeScale = 1
    this.finale = null
    this.stage = getStage(loadStage())

    this.applyStageLook()
    this.reset()
    this.bindInput()

    addEventListener('resize', () => this.resize())
    // 埋め込みなどで、window のリサイズを伴わずに大きさが変わることがある
    if (window.ResizeObserver) new ResizeObserver(() => this.resize()).observe(canvas)
    this.resize()
  }

  /**
   * 画面サイズを測り直す。
   * innerWidth だけを見ていると、レイアウトが決まる前に呼ばれたときに
   * 小さいまま固定されてしまうので、キャンバスの実寸を優先して読む。
   */
  /** 選んだステージの色・光・飾りを反映する。飾りは選んだぶんだけ作る。 */
  applyStageLook() {
    applyStage(this.sceneCtx, this.stage)
    this.scenery?.traverse((o) => {
      o.geometry?.dispose?.()
      const list = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []
      for (const m of new Set(list)) m.dispose?.()
    })
    if (this.scenery) this.scene.remove(this.scenery)
    this.scenery = buildScenery(this.scene, this.stage)
    this.sfx.setAmbience(this.stage.ambience)
  }

  /** ステージ選択から呼ばれる。RANDOM ならここで抽選する。 */
  startStage(id) {
    const chosen = id === 'random' ? STAGES[Math.floor(Math.random() * STAGES.length)] : getStage(id)
    saveStage(id) // RANDOM を選んだことも覚えておく
    this.stage = chosen
    this.applyStageLook()
    this.reset()
    this.ui.hideStageSelect()
    this.ui.showStageBanner(chosen, STAGES.indexOf(chosen))
    this.sfx.resume()
  }

  openStageSelect(canCancel = true) {
    this.ui.renderStages(loadStage(), (id) => this.startStage(id), canCancel)
  }

  resize() {
    const w = Math.max(1, this.canvas.clientWidth || innerWidth || 1)
    const h = Math.max(1, this.canvas.clientHeight || innerHeight || 1)
    if (w === this.viewW && h === this.viewH) return
    this.viewW = w
    this.viewH = h
    this.orbit.resize(w, h)
    this.renderer.setSize(w, h, false)
  }

  // ---------------------------------------------------------------- setup

  reset() {
    if (this.world) {
      this.props?.dispose()
      this.bonus?.dispose()
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

    const theme = this.stage.theme
    this.props = new Props({ scene: this.scene, world, mats, sfx: this.sfx, theme })
    this.bonus = new Bonus({
      scene: this.scene,
      world,
      mats,
      sfx: this.sfx,
      theme,
      onDoorOpen: () => this.onDoorOpen(),
      onGoldReady: () => this.onGoldReady(),
    })
    // 当たり検出用のトリガーを組み直す。物理の衝突とは別に持っていて、
    // 速いブロックが1フレームで通り抜けても取りこぼさない。
    this.triggers.dispose()
    this.triggers = new Triggers(this.scene)
    this.props.registerTriggers(this.triggers)
    this.bonus.registerTriggers(this.triggers)
    this.triggers.setDebug(CONFIG.debug.showColliders)

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
    this.comboGuard = 0
    this.timeScale = 1
    this.finale = null
    this.cleared = false
    this.bonusPhase = null
    this.bonusTimer = 0
    this.victoryHops = null
    this.hammer.pivot.visible = true

    this.missions = new Missions(this.prevMissionIds)
    this.prevMissionIds = this.missions.ids

    this.hammer.reset()
    this.aimHammer(blocks[0])
    this.hammer.snapToAim()

    this.ui.hideResult()
    this.ui.setRemain(this.remaining)
    this.ui.setPower(0, false)
    this.ui.setPhase('ブロックを長押し')
    this.ui.setBlockType(null, null)
    this.ui.setWind(null)
    this.ui.setGuard(0)
    this.ui.hideFinaleTitle()
    this.ui.exitAfterglow()
    this.ui.toggleAchPanel(false)
    this.ui.renderMissions(this.missions)
    this.ui.setMuted(this.sfx.muted)

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
      const r = this.canvas.getBoundingClientRect()
      this.pointer.x = ((e.clientX - r.left) / Math.max(1, r.width)) * 2 - 1
      this.pointer.y = -((e.clientY - r.top) / Math.max(1, r.height)) * 2 + 1
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
          this.startHazards(this.hovered)
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
      this.releaseCharge()
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
    this.ui.stageBtn?.addEventListener('click', (e) => {
      e.stopPropagation()
      this.openStageSelect()
    })
    // 飛び先は config で変えられるようにしておく
    if (this.ui.hubLink) this.ui.hubLink.href = CONFIG.hubUrl
    this.ui.openAch.addEventListener('click', (e) => {
      e.stopPropagation()
      this.ui.renderAchievements(this.achievements)
      this.ui.toggleAchPanel(true)
    })
    this.ui.closeAch.addEventListener('click', (e) => {
      e.stopPropagation()
      this.ui.toggleAchPanel(false)
    })
    this.ui.closeStage.addEventListener('click', (e) => {
      e.stopPropagation()
      this.ui.hideStageSelect()
    })
    this.ui.toResult.addEventListener('click', (e) => {
      e.stopPropagation()
      this.showFinalResult()
    })

    const toggleSound = () => {
      this.sfx.resume()
      this.ui.setMuted(this.sfx.toggleMute())
    }
    this.ui.soundBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      toggleSound()
    })

    addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase()
      // 余韻タイムが始まってからだけ受け付ける。演出中の誤入力では飛ばない。
      if ((e.key === 'Enter' || e.key === ' ') && this.state === 'afterglow') {
        e.preventDefault()
        this.showFinalResult()
        return
      }
      if (k === 'r') this.reset()
      if (k === 'c') this.orbit.reset()
      if (k === 'm') toggleSound()
      if (k === 'd') {
        CONFIG.debug.showColliders = !CONFIG.debug.showColliders
        CONFIG.debug.logTriggers = CONFIG.debug.showColliders
        this.triggers.setDebug(CONFIG.debug.showColliders)
        this.setColliderDebug(CONFIG.debug.showColliders)
      }
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
  /**
   * ブロック中心から、その向きの表面までの距離。
   * 円柱なので、どの向きから叩いても半径そのままで済む。
   */
  surfaceDistance(dir, piece) {
    return piece?.kind === 'gold' ? CONFIG.bonus.gold.radius : CONFIG.block.radius
  }

  aimHammer(piece) {
    if (!piece) return
    const dir = this.hitDirection(piece)
    this.tmpVec.set(piece.body.position.x, piece.body.position.y, piece.body.position.z)
    this.hammer.aim(this.tmpVec, dir, this.surfaceDistance(dir, piece))
  }

  // ------------------------------------------------------------- 選択まわり

  /** いま叩けるもの。塔のブロックと、出ていれば金のブロック。 */
  /**
   * いま叩けるもの。
   * ボーナスチャレンジ中は金のコマだけ。誤って塔を叩いてしまわないようにしている。
   * （カメラはこの間も自由に回せる）
   */
  hittable() {
    if (this.bonus?.goldState === 'ready') return [this.bonus.gold]
    return this.blocks.filter((b) => b.state === 'tower')
  }

  updateHover() {
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const targets = this.hittable()
    const meshes = targets.map((b) => b.mesh)
    const hit = this.raycaster.intersectObjects(meshes, false)[0]
    const piece = hit ? targets.find((b) => b.mesh === hit.object) : null
    // どこを叩いたかで回り方が変わるので、当たった点を覚えておく
    if (hit) this.hitPoint.copy(hit.point)

    if (piece !== this.hovered) {
      this.hovered = piece
      this.canvas.style.cursor = piece ? 'pointer' : 'grab'
      this.refreshHighlights()
      const shown = this.selected || piece
      this.ui.setBlockType(shown?.type ?? null, shown?.typeKey ?? null)
      if (shown) this.ui.setZone(this.bandOf(shown))
    }
  }

  select(piece) {
    this.selected = piece
    this.aimPoint.copy(this.hitPoint)
    this.ui.setBlockType(piece.type, piece.typeKey)
    this.ui.setZone(this.bandOf(piece))
    this.refreshHighlights()
  }

  refreshHighlights() {
    const all = [...this.blocks]
    if (this.bonus?.gold) all.push(this.bonus.gold)
    for (const b of all) {
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
    this.sfx.playHammerHit(power)
    this.hitInStrongWind = this.wind.blowing && this.wind.label === 'STRONG WIND'
    if (piece.kind === 'gold') return this.applyGoldHit(piece, power, dir)

    const H = CONFIG.hit
    const type = piece.type
    // 「ちょうどいい」の位置はブロックの種類ごとに違い、段が進むほど狭くなる。
    // GOOD と PERFECT は同じように抜けるので、クリアに PERFECT は要らない。
    // 一発勝負で間に合わなかったときは、弱い打撃として扱う
    const judge = this.oneChanceMissed ? 'weak' : this.judgeOf(power, piece)
    this.oneChanceMissed = false
    const band = judge === 'perfect' ? 'good' : judge
    // 斜めへ抜けるときは移動距離が伸びるので、抜けきるまでの時間が
    // どの向きでも同じになるように速度を上げる。
    const reach = 1 / Math.max(Math.abs(dir.x), Math.abs(dir.z))
    const speed =
      (H.speedMin + (H.speedMax - H.speedMin) * power) *
      type.speedScale *
      Math.pow(reach, H.diagonalBoost)

    this.hitInStrongWind = this.wind.blowing && this.wind.label === 'STRONG WIND'
    for (const p of this.pieces) p.body.wakeUp()

    const body = piece.body
    piece.wasHit = true
    this.lastTypeKey = piece.typeKey

    // ここが「スコーン！」の肝。叩いた瞬間だけ摩擦を消したうえで、
    // 一定時間は叩いた向きの速度が落ちないよう保証する。
    // こうしないと、落ちてきた上の段の角に引っかかって途中で止まってしまう。
    // 弱すぎるときはこの時間がごく短いので、少し動いただけで荷重に負けて止まる。
    body.material = this.mats.slip
    piece.slideDir = { x: dir.x, z: dir.z }
    piece.slideSpeed = speed
    piece.slideUntil = this.time + (band === 'weak' ? H.weakSlideTime : H.slideTime)

    this.impulse.set(dir.x * speed * body.mass, 0, dir.z * speed * body.mass)
    // 中心をとらえれば まっすぐ、外せば その分だけ回りながら抜ける。
    this.offset.set(0, 0, 0)
    const lateral = this.lateralOffset(piece, dir)
    if (lateral) {
      this.offset.x = -dir.z * lateral
      this.offset.z = dir.x * lateral
    }

    if (band === 'over') {
      this.impulse.y = speed * body.mass * H.overhitLift
      // 重心より下を叩いて暴れさせる
      this.offset.y = -CONFIG.block.height * 0.34
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

    this.lastBand = judge
    this.lastGold = false
    this.state = 'settling'
    this.settleTimer = 0
    this.quietTimer = 0

    if (band === 'weak') this.sfx.playWeak()
    else if (band === 'over') this.sfx.playDanger()
    else this.sfx.playBlockSlide(power, this.remaining === 1 ? 1.5 : 1)

    // 最後の1段をきれいに抜いたときだけ、特別なクリア演出へ入る
    if (band === 'good' && this.remaining === 1) this.startFinale()
  }

  /**
   * 金のブロック。塔とは別物なので、上に乗っているものへの影響はない。
   * 失敗してもゲームオーバーにはならず、転がったら台座へ戻ってくる。
   */
  applyGoldHit(piece, power, dir) {
    const H = CONFIG.hit
    const type = piece.type
    const band = this.judgeOf(power, piece) === 'weak' ? 'weak'
      : power > type.goodMax ? 'over' : 'good'
    const speed = (H.speedMin + (H.speedMax - H.speedMin) * power) * type.speedScale
    const body = piece.body
    body.wakeUp()

    this.impulse.set(dir.x * speed * body.mass, 0, dir.z * speed * body.mass)
    this.offset.set(0, 0, 0)
    if (band === 'over') {
      this.impulse.y = speed * body.mass * H.overhitLift
      this.offset.set(0, -CONFIG.bonus.gold.height * 0.34, 0)
      body.angularVelocity.x += dir.z * H.overhitTorque
      body.angularVelocity.z += -dir.x * H.overhitTorque
    }
    body.applyImpulse(this.impulse, this.offset)

    if (band === 'weak') this.sfx.playWeak()
    else if (band === 'over') this.sfx.playDanger()
    else this.sfx.playBlockSlide(power, 1.3)

    this.lastGold = true
    this.resolveBonus(band)
    this.state = 'settling'
    this.settleTimer = 0
    this.quietTimer = 0
  }

  /**
   * 叩いた点が、ブロックの中心からどれだけ横にずれていたか。
   * この量だけ力の作用点をずらすので、外して叩くと回りながら抜ける。
   */
  lateralOffset(piece, dir) {
    const k = CONFIG.hit.offCenterSpin
    if (!k) return 0
    const p = piece.body.position
    const dx = this.aimPoint.x - p.x
    const dz = this.aimPoint.z - p.z
    if (dx === 0 && dz === 0) return 0
    // 叩く向きに直交する成分だけを取り出す
    const lateral = -dz * dir.x + dx * dir.z
    const limit = CONFIG.block.radius * 0.8
    return Math.max(-limit, Math.min(limit, lateral)) * k
  }

  /** 溜めを離してハンマーを振る。一発勝負で時間切れになったときもここへ来る。 */
  releaseCharge() {
    if (this.state !== 'charging') return
    this.state = 'swinging'
    this.ui.setPhase('—')
    // 離した瞬間に、雲の裏だったかを覚えておく（実績「見えておる」用）
    this.releasedBlind = this.hazards.hiddenAt(this.power) || this.hazards.blackout
    this.releasedFast = this.hazards.rateFactor() !== 1
    this.releasedDark = this.hazards.live('darkcloud')
    const power = this.power
    const target = this.selected
    // 離した瞬間の向きで確定させる。振っている最中に向きは変わらない。
    const dir = this.hitDirection(target).clone()
    this.ui.setHazards({ cloud: null, blackout: false, label: '' })
    this.hammer.swing(() => this.applyHit(target, power, dir))
  }

  /** 溜めはじめに、今回の妨害を決める。金のコマには妨害を出さない。 */
  startHazards(piece) {
    this.hazards.clear()
    this.ui.setHazards({ cloud: null, blackout: false, label: '' })
    if (piece.kind === 'gold') return
    const removed = CONFIG.block.count - this.remaining
    this.hazards.roll(removed, this.difficulty().t)
    if (this.hazards.active.length) {
      this.say(pick(HAZARD_LINES[this.hazards.active[0]] || HAZARD_LINES.any), 1.6)
    }
  }

  /** 溜めている間、妨害の見た目と効果を進める。 */
  updateHazards(dt) {
    const h = this.hazards
    if (!h.active.length) return
    h.update(dt)
    if (h.consumeFlash()) {
      this.ui.flashGauge()
      this.sfx.playCombo(2)
    }
    this.ui.setHazards({
      cloud: h.cloudRange(),
      blackout: h.blackout,
      label: h.label,
      warning: h.announcing,
    })
  }

  /**
   * いまの難易度。段を抜くほど 0 → 1 へ進み、
   * カーソルが速くなり、判定の帯が狭くなる。
   */
  difficulty() {
    const D = CONFIG.hit.difficulty
    const total = Math.max(1, CONFIG.block.count - 1)
    const t = Math.min(1, (CONFIG.block.count - this.remaining) / total)
    return {
      t,
      cycle: lerp(D.chargeCycle.start, D.chargeCycle.end, t),
      bandScale: lerp(D.bandScale.start, D.bandScale.end, t),
      perfectRatio: lerp(D.perfectRatio.start, D.perfectRatio.end, t),
      wobble: lerp(D.wobble.start, D.wobble.end, t),
    }
  }

  /**
   * そのコマの判定帯。
   *   lo〜hi   … ここに入れば抜ける（GOOD）
   *   pLo〜pHi … その中心の芯。ここだけが PERFECT
   * 金のコマはボーナスなので難易度カーブの対象外。帯ぜんぶが成功。
   */
  bandOf(piece) {
    const type = piece.type
    if (piece.kind === 'gold') {
      return { lo: type.weakMax, hi: type.goodMax, pLo: type.weakMax, pHi: type.goodMax }
    }
    const d = this.difficulty()
    const center = (type.weakMax + type.goodMax) / 2
    const half = ((type.goodMax - type.weakMax) / 2) * d.bandScale
    const pHalf = half * d.perfectRatio
    // 移動ゾーンのときは PERFECT の芯だけがゆっくり左右する。
    // GOOD の範囲は動かさないので、抜けること自体は変わらない。
    const shift = this.hazards ? this.hazards.zoneOffset() : 0
    const pc = Math.min(center + half - pHalf, Math.max(center - half + pHalf, center + shift))
    return { lo: center - half, hi: center + half, pLo: pc - pHalf, pHi: pc + pHalf }
  }

  /** WEAK / GOOD / PERFECT / DANGER のどれか。 */
  judgeOf(power, piece) {
    const b = this.bandOf(piece)
    if (power < b.lo) return 'weak'
    if (power > b.hi) return 'over'
    return power >= b.pLo && power <= b.pHi ? 'perfect' : 'good'
  }

  /** 「強すぎ」の踏み越え具合を 0〜1 で返す。少し超えただけでも効くよう曲げてある。 */
  overhitExcess(power, type) {
    const H = CONFIG.hit
    const raw = (power - type.goodMax) / Math.max(0.01, 1 - type.goodMax)
    return Math.pow(Math.max(0, Math.min(1, raw)), H.overhitCurve)
  }

  // ------------------------------------------------------------- 毎フレーム

  update(realDt) {
    // 演出の進行は実時間で。スローモーション中でも尺は変わらない。
    this.updateFinale(realDt)
    this.lightning.update(realDt)

    const dt = realDt * this.timeScale
    this.time += dt

    if (this.state === 'charging') {
      const d = this.difficulty()
      this.updateHazards(dt)
      // 完全な一定往復だとリズムだけで取れてしまうので、
      // 終盤ほど、見て反応できる程度のゆらぎを混ぜる。
      const wob = 1 + d.wobble * Math.sin(this.time * CONFIG.hit.difficulty.wobbleSpeed)
      const rate = (1 / d.cycle) * wob * this.hazards.rateFactor()
      this.power += this.powerDir * rate * dt
      if (this.power >= 1) {
        this.power = 1
        this.powerDir = -1
      } else if (this.power <= 0) {
        this.power = 0
        this.powerDir = 1
      }
      this.ui.setPower(this.power, true)
      if (this.selected) this.ui.setZone(this.bandOf(this.selected))
      // 一発勝負。1往復のうちに離さなければ、弱い打撃として決着する。
      if (this.hazards.expired(this.difficulty().cycle)) {
        this.oneChanceMissed = true
        this.releaseCharge()
      }
    } else if (this.state === 'idle') {
      this.ui.setPower(0, false)
    }

    // 待機中のハンマーはカメラ側に付いてくる。振っている間は固定される。
    //
    // 狙いを更新するのは「これから叩ける」状態のときだけ。
    // 叩いたあとも狙い続けると、いま吹っ飛んでいったコマをハンマーが
    // 追いかけて、そのまま画面の外まで飛んでいってしまう。
    if (!this.hammer.busy && (this.state === 'idle' || this.state === 'charging')) {
      const target = this.selected?.state === 'tower' ? this.selected : this.lowestBlock()
      this.aimHammer(target)
    }
    this.hammer.update(dt)

    this.updateVictoryHops(realDt)
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
    this.updateTriggers()
    this.props.update(dt)
    this.bonus.update(dt)
    this.updateBonus(realDt)
    this.updateBonusTag()
    this.updateMissions()
    this.sfx.setWind(this.wind.strength, this.wind.label === 'STRONG WIND')

    for (const p of this.pieces) syncMesh(p)

    // 塔が低くなっても、だるま落とし全体が画面の中心に来るようにする
    const top = this.raizin.mesh.position.y + this.raizin.view.baseY + CONFIG.raizin.height
    this.orbit.follow(top, dt)

    this.raizin.view.update(this.camera, this.raizin.mesh, dt)
    this.ui.updateBubble(this.raizinScreenPos(), this.time)

    if (this.state === 'settling') this.updateSettling(dt)

    this.renderer.render(this.scene, this.camera)
  }

  /** 開発用。物理の当たり判定を線で出す。D キーで切り替え。 */
  setColliderDebug(on) {
    if (!on) {
      if (this.colliderDebug) {
        this.scene.remove(this.colliderDebug)
        this.colliderDebug = null
      }
      return
    }
    const group = new THREE.Group()
    const mat = new THREE.LineBasicMaterial({ color: 0xff9d3d })
    for (const body of this.world.bodies) {
      for (let i = 0; i < body.shapes.length; i++) {
        const shape = body.shapes[i]
        let geo = null
        if (shape.halfExtents) {
          const h = shape.halfExtents
          geo = new THREE.BoxGeometry(h.x * 2, h.y * 2, h.z * 2)
        } else if (shape.radiusTop !== undefined) {
          geo = new THREE.CylinderGeometry(shape.radiusTop, shape.radiusBottom, shape.height, 12)
        }
        if (!geo) continue
        const line = new THREE.LineSegments(new THREE.EdgesGeometry(geo), mat)
        const off = body.shapeOffsets[i]
        line.position.set(body.position.x + off.x, body.position.y + off.y, body.position.z + off.z)
        line.quaternion.copy(body.quaternion)
        group.add(line)
      }
    }
    this.scene.add(group)
    this.colliderDebug = group
  }

  /** 勝利リアクション。時間をおいて2回、ぴょこんと跳ねる。見た目だけ。 */
  updateVictoryHops(dt) {
    if (!this.victoryHops) return
    this.hopTimer = (this.hopTimer || 0) + dt
    while (this.victoryHops.length && this.hopTimer >= this.victoryHops[0]) {
      this.victoryHops.shift()
      this.raizin.view.bounce(0.55)
    }
    if (!this.victoryHops.length) {
      this.victoryHops = null
      this.hopTimer = 0
    }
  }

  lowestBlock() {
    return this.blocks.find((b) => b.state === 'tower') || null
  }

  /**
   * 雷神の頭の上を画面座標へ。吹き出しは3D空間に置かず、
   * ここで求めた位置に 2D の HTML を重ねている。
   *
   * 頭上の点は雷神のローカル座標ではなく、ワールドの真上で取る。
   * ローカルで取ると、雷神が傾いたときに吹き出しまで一緒に回り込んで、
   * 本体の裏へ隠れてしまう。
   * カメラを360度どこへ回しても、つねに手前に、読める向きで出る。
   */
  raizinScreenPos() {
    const p = this.raizin.mesh.position
    const top = this.raizin.view.baseY + CONFIG.raizin.height + 0.35
    this.tmpVec.set(p.x, p.y + top, p.z).project(this.camera)
    if (this.tmpVec.z > 1) return null // カメラの後ろにある

    const r = this.canvas.getBoundingClientRect()
    const x = r.left + (this.tmpVec.x * 0.5 + 0.5) * r.width
    const y = r.top + (-this.tmpVec.y * 0.5 + 0.5) * r.height
    // 画面外へはみ出さないように寄せる
    const mx = 110
    return {
      x: Math.min(Math.max(x, r.left + mx), r.right - mx),
      y: Math.min(Math.max(y, r.top + 56), r.bottom - 70),
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

  /**
   * 飛んでいるブロックを、前フレームからの線分としてトリガーに通す。
   * どれだけ速くても、どの向きから来ても抜けない。
   */
  updateTriggers() {
    const r = blockReach()
    const hh = CONFIG.triggers.blockHalfHeight
    const movers = []
    for (const b of this.blocks) {
      if (b.despawned) continue
      movers.push({ body: b.body, radius: r, halfHeight: hh })
    }
    if (this.bonus.gold) movers.push({ body: this.bonus.gold.body, radius: r, halfHeight: hh })
    this.triggers.update(this.time, movers)
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
            this.triggers.forget(b.body)
          }
        }
        continue
      }
      const pos = b.body.position
      if (Math.hypot(pos.x, pos.z) > R.clearOutFactor * CONFIG.block.radius * 2 || pos.y < -1) {
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

    this.ui.renderMissions(this.missions)

    if (fail) {
      this.combo = 0
      this.state = 'over'
      this.ui.setPhase('—')
      this.showResultPanel('GAME OVER', fail, false)
      return
    }

    if (this.remaining === 0) {
      // 最後の1段を「ちょうどいい」で抜いたときは startFinale 側で処理される。
      // ここへ来るのは、強すぎて飛んでいった場合など。演出はないが余韻タイムは同じ。
      this.ui.setPhase('—')
      this.enterAfterglow('CLEAR！')
      return
    }

    this.state = 'idle'
    this.ui.setPhase('ブロックを長押し')
    this.updateHover()

    if (this.wind.maybeStart()) this.say(pick(LINES.wind), 1.6)
  }

  /** WEAK / PERFECT / DANGER（金なら GOLDEN PERFECT）の表示と、コンボの更新。 */
  showJudgement(band, failed) {
    const gold = this.lastGold
    const golden = gold && band === 'good'
    const j = JUDGE[golden ? 'golden' : band]
    this.ui.showJudge(j.kind, j.text)

    if (band === 'good' && !failed) {
      // GOOD。抜けてはいるので失敗ではないが、コンボはここで途切れる。
      // COMBO GUARD を持っていれば1回だけ守られる。
      this.afterMiss('good')
      this.lastBand = null
      this.lastGold = false
      return
    }

    if (band === 'perfect' && !failed) {
      this.combo++
      this.ui.showCombo(this.combo)
      this.sfx.playCombo(this.combo)
      const st = this.missions.stats
      st.maxCombo = Math.max(st.maxCombo, this.combo)
      if (this.hitInStrongWind) st.windPerfects++
      if (this.releasedDark) st.darkPerfects++
      if (this.releasedBlind) st.blindPerfects++
      if (this.releasedFast) st.fastPerfects++
      if (golden) {
        st.goldenPerfects++
        // ごほうびは「次の1回だけコンボが切れない」。増えすぎないよう1で頭打ち。
        this.comboGuard = 1
        this.ui.setGuard(this.comboGuard)
        this.sfx.playGoldenPerfect()
        this.raizin.view.bounce(1)
        this.say(pick(LINES.golden), 1.6)
      } else {
        st.perfects++
        if (st.perfectByType[this.lastTypeKey] !== undefined) st.perfectByType[this.lastTypeKey]++
        this.sfx.playPerfect()
        this.onCombo(this.combo)
      }
    } else if (band === 'weak' || band === 'over') {
      if (band === 'weak') this.missions.stats.weaks++
      else this.missions.stats.dangers++
      this.afterMiss(band)
    }
    this.lastBand = null
    this.lastGold = false
  }

  /** PERFECT 以外のあと。ガードがあれば1回だけコンボを守る。 */
  afterMiss(band) {
    if (this.comboGuard > 0) {
      // GOLDEN PERFECT のごほうび。1回だけコンボが切れない。
      this.comboGuard--
      this.ui.useGuard()
      this.say('セーフ！', 1.2)
      return
    }
    // PERFECT 以外はコンボ終了。分かりやすさを優先して例外は作らない。
    this.combo = 0
    this.say(pick(LINES[band] || LINES.good), 1.3)
  }

  onDoorOpen() {
    this.missions.stats.doorOpened = 1
  }

  /** 金のコマが台座に乗った。ここから1回きりの挑戦。 */
  onGoldReady() {
    this.bonusPhase = 'ready'
    this.say('お、なんだあれ！', 2.2)
    this.sfx.playCombo(4)
  }

  /**
   * 金のコマの画面位置。案内をそこへ貼る。
   * 画面の外なら端に寄せて、矢印で方向を示す（カメラは勝手に動かさない）。
   */
  goldScreenPos() {
    const gold = this.bonus?.gold
    if (!gold) return null
    const p = gold.body.position
    this.tmpVec.set(p.x, p.y + CONFIG.bonus.gold.height + 0.5, p.z).project(this.camera)
    const r = this.canvas.getBoundingClientRect()
    const behind = this.tmpVec.z > 1
    let nx = this.tmpVec.x
    let ny = this.tmpVec.y
    if (behind) {
      nx = -nx
      ny = -ny
    }
    const inView = !behind && Math.abs(nx) <= 0.94 && Math.abs(ny) <= 0.9
    const m = 74
    let x = r.left + (nx * 0.5 + 0.5) * r.width
    let y = r.top + (-ny * 0.5 + 0.5) * r.height
    if (inView) return { x, y, offscreen: false }
    // 画面の端へ寄せて、中心から見た方向を矢印に
    x = Math.min(Math.max(x, r.left + m), r.right - m)
    y = Math.min(Math.max(y, r.top + m), r.bottom - m)
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    return { x, y, offscreen: true, angle: Math.atan2(y - cy, x - cx) }
  }

  updateBonusTag() {
    const b = this.bonus
    if (!b || !this.bonusPhase) {
      this.ui.setBonusTag(null)
      return
    }
    const at = this.goldScreenPos()
    if (this.bonusPhase === 'ready') {
      this.ui.setBonusTag(at, 'BONUS CHANCE!', 'GOLD BLOCK をクリックして叩け！')
    } else {
      this.ui.setBonusTag(at, this.bonusResultText, '')
    }
  }

  /** ボーナスの決着。失敗してもゲームには一切ひびかない。 */
  resolveBonus(band) {
    const success = band === 'good'
    this.bonus.resolveGold(success)
    this.bonusPhase = 'result'
    this.bonusTimer = 0

    const st = this.missions.stats
    if (success) {
      st.goldenPerfects++
      this.comboGuard = 1
      this.ui.setGuard(this.comboGuard)
      this.ui.showJudge(JUDGE.golden.kind, JUDGE.golden.text)
      this.bonusResultText = 'COMBO GUARD ×1 GET!'
      this.sfx.playGoldenPerfect()
      this.raizin.view.bounce(1.1)
      this.say(pick(LINES.golden), 1.8)
    } else {
      const j = band === 'weak' ? JUDGE.goldWeak : JUDGE.goldOver
      this.ui.showJudge(j.kind, j.text)
      this.bonusResultText = 'CHALLENGE FAILED'
      this.sfx.playWeak()
      this.say('むむ…', 1.4)
    }
    // 判定は出したので、通常の判定処理には渡さない
    this.lastBand = null
    this.lastGold = false
  }

  /** 結果を少し見せてから、通常のだるま落としへ戻す。 */
  updateBonus(dt) {
    if (this.bonusPhase !== 'result') return
    this.bonusTimer += dt
    if (this.bonusTimer >= CONFIG.bonus.gold.resultHold) {
      this.bonusPhase = null
      this.ui.setBonusTag(null)
    }
  }

  /** 隠し実績。初めて解除したときだけ、画面の端に小さく出す。操作は止めない。 */
  checkAchievements() {
    const fresh = this.achievements.check(this.missions.stats)
    for (const a of fresh) {
      this.ui.showAchievement(a)
      this.sfx.playMissionComplete()
    }
  }

  /** 背景ギミックの成果をミッションへ反映し、達成したものを知らせる。 */
  updateMissions() {
    const st = this.missions.stats
    st.bellHits = this.props.bellHits
    st.cansToppled = this.props.cansToppled
    st.crateHits = this.props.crateHits
    st.missionsDone = this.missions.completed
    st.missionsTotal = this.missions.list.length
    this.checkAchievements()
    const done = this.missions.check()
    if (!done.length) return
    this.ui.renderMissions(this.missions)
    for (const m of done) this.ui.flashMission(m.id)
    this.sfx.playMissionComplete()
    if (this.missions.allDone) {
      this.ui.showMissionToast('ALL MISSIONS COMPLETE!')
      this.raizin.view.bounce(1.2)
      this.say('ぜんぶ やった！', 2.0)
    } else {
      this.ui.showMissionToast('MISSION COMPLETE!')
      this.raizin.view.bounce(0.5)
      this.say(pick(LINES.mission), 1.4)
    }
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

  // ------------------------------------------------- 最後の1段のクリア演出

  /**
   *   スロー → スコーン → 着地 → 0.5秒の間 → 雷 → RAIZIN CLEAR! → ミッション結果
   * の順に進む。ゲームオーバーのときはここを通らない。
   */
  startFinale() {
    this.showJudgement('good', null)
    this.ui.renderMissions(this.missions)
    this.timeScale = CONFIG.finale.slowScale
    this.finale = { phase: 'slow', t: 0 }
    this.state = 'finale'
    this.orbit.bob(CONFIG.finale.shake)
  }

  clearTitle() {
    if (this.missions.stats.goldenPerfects > 0) return 'GOLDEN CLEAR!'
    if (this.missions.allDone) return 'PERFECT CLEAR!'
    return 'RAIZIN CLEAR!'
  }

  /** 実時間で進む。スローモーション中でも演出の尺は変わらない。 */
  updateFinale(dt) {
    if (!this.finale) return
    const F = CONFIG.finale
    const f = this.finale
    f.t += dt

    if (f.phase === 'slow') {
      if (f.t >= F.slowTime) {
        this.timeScale = 1
        f.phase = 'land'
        f.t = 0
      }
    } else if (f.phase === 'land') {
      const b = this.raizin.body
      const bottom = b.position.y + (CONFIG.raizin.comDrop - CONFIG.raizin.height / 2)
      if ((b.velocity.length() < 0.7 && bottom < 0.4) || f.t > 3) {
        this.sfx.playLand()
        f.phase = 'pause'
        f.t = 0
      }
    } else if (f.phase === 'pause') {
      if (f.t >= F.pause) {
        const fail = this.checkFailure()
        if (fail) {
          // 着地に失敗した場合は演出を打ち切る。失敗にクリア演出は使わない。
          this.finale = null
          this.state = 'over'
          this.showResultPanel('GAME OVER', fail, false)
          return
        }
        const g = this.raizin.mesh.position
        this.tmpVec.set(g.x, g.y, g.z)
        this.lightning.strike(this.tmpVec, F.thunderTime)
        this.ui.showFlash()
        this.sfx.playThunder()
        f.phase = 'thunder'
        f.t = 0
      }
    } else if (f.phase === 'thunder') {
      if (f.t >= F.thunderTime + F.titleDelay) {
        this.ui.showFinaleTitle(this.clearTitle())
        this.sfx.playClear()
        f.phase = 'title'
        f.t = 0
      }
    } else if (f.phase === 'title') {
      // RAIZIN CLEAR! を大きく見せたら、あとはプレイヤーの好きなだけ眺められる時間にする
      if (f.t >= F.titleHold) {
        this.finale = null
        this.enterAfterglow(this.clearTitle())
      }
    }
  }

  /**
   * クリア後の余韻タイム。
   * 結果画面へは自動で移らない。カメラだけは自由に回せて、
   * 飛んだブロックも倒れた缶も開いた扉もそのまま残る。
   */
  enterAfterglow(title) {
    this.cleared = true // これ以降はゲームオーバー判定をしない
    const st = this.missions.stats
    st.cleared = true
    st.missionsDone = this.missions.completed
    st.missionsTotal = this.missions.list.length
    this.checkAchievements()
    this.state = 'afterglow'
    this.clearedTitle = title
    this.clearHighlights()
    this.hammer.pivot.visible = false
    this.ui.showFinaleTitle(title)
    this.ui.enterAfterglow()
    this.ui.renderMissions(this.missions)
    this.say(pick(this.clearLines()), CONFIG.finale.lineSeconds)
    // 軽い勝利リアクション。見た目だけなので、これで転ぶことはない。
    this.raizin.view.bounce(1.1)
    this.victoryHops = [0.45, 0.9]
  }

  clearLines() {
    if (this.missions.stats.goldenPerfects > 0) return LINES.clearGolden
    if (this.missions.allDone) return LINES.clearMissions
    return LINES.clear
  }

  /** RESULT ボタン、または Enter / Space で結果画面へ。 */
  showFinalResult() {
    if (this.state !== 'afterglow') return
    this.state = 'over'
    this.showResultPanel(this.clearedTitle, '雷神は最後まで倒れなかった', true)
  }

  /** 結果画面。内訳・称号・ミッション結果をまとめて出す。 */
  showResultPanel(title, sub, cleared) {
    const st = this.missions.stats
    st.missionsDone = this.missions.completed
    st.missionsTotal = this.missions.list.length
    this.ui.renderResultStats(st, pickTitle(st))
    this.ui.renderMissionResult(this.missions)
    this.ui.showResult(title, sub, cleared)
  }

  /** ゲームオーバーなら理由の文字列、そうでなければ null。 */
  checkFailure() {
    // クリアが確定したあとは、物理の微振動で倒れてもゲームオーバーにしない
    if (this.cleared) return null
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
