import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { CONFIG } from './config.js'
import { makeWoodSideTexture, makeWoodCapTexture } from './textures.js'
import { placeStatic } from './physics.js'
import { blockShape } from './tower.js'

/**
 * 隠しボーナス。
 *
 *   飛ばしたブロックが鍵に当たる → カチャッ → 扉がゆっくり開く → 金のブロックが出る
 *
 * クリアには一切関係しない。鍵に当てなくてもクリアできるし、
 * 金のブロックを出したまま放っておいてもクリアできる。
 * UI に「鍵を狙え」とは書かない。見つけたときに気づく作りにしてある。
 */
const DOOR_FRAME = { wood: 0x6b5540, locker: 0x60697a, hatch: 0x4e545e, cabinet: 0x3a2b58 }
const DOOR_PANEL = { wood: [122, 86, 52], locker: [104, 114, 128], hatch: [92, 98, 108], cabinet: [96, 70, 150] }

/** 金のブロックの当たり判定。通常ブロックと同じ考えかたで作る。 */
function goldShape(r, h) {
  if (CONFIG.block.shape === 'cylinder') {
    return new CANNON.Cylinder(r, r, h, CONFIG.block.shapeSegments)
  }
  const half = r * CONFIG.block.shapeScale
  return new CANNON.Box(new CANNON.Vec3(half, h / 2, half))
}

export class Bonus {
  constructor({ scene, world, mats, sfx, theme, onDoorOpen, onGoldReady }) {
    this.theme = theme
    this.scene = scene
    this.world = world
    this.mats = mats
    this.sfx = sfx
    this.onDoorOpen = onDoorOpen
    this.onGoldReady = onGoldReady

    this.unlocked = false // 1ゲームに1回だけ
    this.phase = 'locked' // locked / opening / open
    this.timer = 0
    this.gold = null
    // none → entering（扉から出てくる）→ ready（叩ける）→ resolved（1回きりで終了）
    this.goldState = 'none'
    this.goldTimer = 0
    this.objects = []
    this.bodies = []

    if (!CONFIG.bonus.enabled) return
    this.buildKey()
    this.buildDoor()
  }

  add(mesh, body) {
    if (mesh) {
      this.scene.add(mesh)
      this.objects.push(mesh)
    }
    if (body) {
      this.world.addBody(body)
      this.bodies.push(body)
    }
  }

  // ---------------------------------------------------------------- 鍵
  buildKey() {
    const [x, y, z] = this.theme.key.at
    const group = new THREE.Group()
    group.position.set(x, y, z)

    const gold = new THREE.MeshStandardMaterial({
      color: 0xd9b451,
      roughness: 0.25,
      metalness: 0.95,
      emissive: 0x2a1d00,
    })

    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.86, 12), gold)
    shaft.rotation.z = Math.PI / 2
    group.add(shaft)
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.06, 10, 20), gold)
    bow.position.x = -0.55
    bow.rotation.y = Math.PI / 2
    group.add(bow)
    for (const [ox, h] of [[0.3, 0.2], [0.42, 0.14]]) {
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.08, h, 0.08), gold)
      tooth.position.set(ox, -h / 2 - 0.04, 0)
      group.add(tooth)
    }
    group.traverse((o) => (o.castShadow = true))

    // 支柱。鍵が宙に浮いて見えないように。
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.09, y, 10),
      new THREE.MeshStandardMaterial({ color: 0x4a4237, roughness: 0.9 })
    )
    post.position.set(x, y / 2, z)
    post.castShadow = true
    this.add(post, null)
    this.add(group, null)

    const body = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: new CANNON.Box(new CANNON.Vec3(0.55, 0.34, 0.3)),
      material: this.mats.ground,
    })
    // 鍵は薄いので、物理では止めない（静的ボディに当てると急停止して不自然）。
    // 当たりの検出はトリガー側で確実に行い、当たった手応えは
    // 鍵が勢いよく回ることと、ブロックを少しだけ逸らすことで見せる。
    body.collisionResponse = false
    placeStatic(body, x, y, z)
    this.add(null, body)
    this.key = { group, gold, spin: 0, t: 0, center: [x, y, z] }
  }

  /** 当たり検出をトリガー側へ登録する。鍵は1ゲームに1回だけ。 */
  registerTriggers(triggers) {
    if (!this.key) return
    triggers.add({
      id: 'key',
      center: this.key.center,
      radius: CONFIG.triggers.key.radius,
      halfHeight: CONFIG.triggers.key.halfHeight,
      once: true,
      onHit: (body) => this.unlock(body),
    })
  }

  unlock(body) {
    if (this.unlocked) return
    this.unlocked = true
    this.phase = 'opening'
    this.timer = 0
    this.key.spin = 14
    this.sfx.playKeyUnlock()
    // かすめた手応え。強く跳ね返さず、少しだけ逸らして持ち上げる。
    if (body) {
      const v = body.velocity
      v.y += 1.6
      body.angularVelocity.y += 3
    }
  }

  // ---------------------------------------------------------------- 扉
  buildDoor() {
    const D = CONFIG.bonus.door
    const [x, , z] = this.theme.door.at
    const group = new THREE.Group()
    group.position.set(x, 0, z)
    // 塔のほうを向かせる
    group.rotation.y = Math.atan2(-x, -z)

    const style = this.theme.door.style
    const frameColor = DOOR_FRAME[style] ?? 0x565f74
    const stone = new THREE.MeshStandardMaterial({
      color: frameColor,
      roughness: style === 'wood' ? 0.95 : 0.45,
      metalness: style === 'wood' ? 0 : 0.6,
    })
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(D.width + 0.5, D.height + 0.4, 0.4),
      stone
    )
    frame.position.y = (D.height + 0.4) / 2
    frame.castShadow = true
    frame.receiveShadow = true
    group.add(frame)

    // 中の闇。扉が開くとここが見える。
    const cave = new THREE.Mesh(
      new THREE.BoxGeometry(D.width, D.height, 0.5),
      new THREE.MeshBasicMaterial({ color: 0x0a0d16 })
    )
    cave.position.set(0, D.height / 2, -0.15)
    group.add(cave)

    // 扉。端を軸にして開く。
    const hinge = new THREE.Group()
    hinge.position.set(-D.width / 2, 0, 0.16)
    group.add(hinge)
    const panelTint = DOOR_PANEL[style] ?? [122, 86, 52]
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(D.width, D.height, 0.12),
      new THREE.MeshStandardMaterial({
        map: makeWoodSideTexture(91, panelTint, false),
        roughness: style === 'wood' ? 0.85 : 0.4,
        metalness: style === 'wood' ? 0 : 0.55,
        emissive: style === 'cabinet' ? 0x2a1040 : 0x000000,
      })
    )
    panel.position.set(D.width / 2, D.height / 2, 0)
    panel.castShadow = true
    hinge.add(panel)

    this.add(group, null)
    this.door = { hinge, angle: 0 }
  }

  // ---------------------------------------------------------------- 金のブロック
  spawnGold() {
    const G = CONFIG.bonus.gold
    const [x, , z] = this.theme.gold.at
    const r = G.radius
    const h = G.height

    const side = new THREE.MeshStandardMaterial({
      map: makeWoodSideTexture(5, [232, 190, 84]),
      roughness: 0.22,
      metalness: 0.9,
      emissive: 0x1a1200,
    })
    const cap = new THREE.MeshStandardMaterial({
      map: makeWoodCapTexture(5, [212, 172, 74]),
      roughness: 0.22,
      metalness: 0.9,
      emissive: 0x1a1200,
    })
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, h, CONFIG.block.segments),
      [side, cap, cap]
    )
    mesh.castShadow = true
    mesh.receiveShadow = true
    this.scene.add(mesh)

    const body = new CANNON.Body({
      mass: G.type.mass,
      shape: goldShape(r, h),
      material: this.mats.block,
      linearDamping: 0.06,
      angularDamping: 0.2,
    })
    // 扉の中から出てきて、台座へ乗る。いきなり現れないようにする。
    const [dx, , dz] = this.theme.door.at
    body.position.set(dx, G.standTop + 0.35, dz)
    body.type = CANNON.Body.KINEMATIC
    body.mass = 0
    body.updateMassProperties()
    const t = G.entryTime
    body.velocity.set((x - dx) / t, 0, (z - dz) / t)
    body.angularVelocity.set(0, 5.5, 0)
    body.isBlock = true
    body.allowSleep = true
    body.sleepSpeedLimit = 0.12
    body.sleepTimeLimit = 0.5
    this.world.addBody(body)

    // 台座
    const stand = new THREE.Mesh(
      new THREE.CylinderGeometry(0.95, 1.1, 0.3, 20),
      new THREE.MeshStandardMaterial({ color: 0x5c5342, roughness: 0.9 })
    )
    stand.position.set(x, 0.15, z)
    stand.receiveShadow = true
    this.standMesh = stand
    this.standGlow = new THREE.PointLight(0xffcf5a, 0, 5)
    this.standGlow.position.set(x, G.standTop, z)
    this.scene.add(this.standGlow)
    this.objects.push(this.standGlow)
    const standBody = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: new CANNON.Cylinder(0.95, 1.1, 0.3, 12),
      material: this.mats.ground,
    })
    placeStatic(standBody, x, 0.15, z)
    this.add(stand, standBody)

    this.gold = {
      kind: 'gold',
      typeKey: 'gold',
      type: CONFIG.bonus.gold.type,
      mesh,
      body,
      sideMat: side,
      capMat: cap,
      highlightMats: [side, cap],
      state: 'tower', // ゲーム側の当たり判定と同じ扱いにしておく
      home: new THREE.Vector3(x, G.standTop, z),
    }
    this.goldState = 'entering'
    this.goldTimer = 0
    this.objects.push(mesh)
    this.bodies.push(body)
  }

  /**
   * ボーナスチャレンジの決着。1ゲームに1回きりなので、
   * 成功でも失敗でも、ここで叩ける状態を終わらせる。
   */
  resolveGold(success) {
    if (this.goldState !== 'ready') return
    this.goldState = 'resolved'
    this.goldTimer = 0
    const g = this.gold
    if (!g) return
    g.state = 'out' // もう叩けない
    if (success) {
      // 台座には金色の光だけ残す
      this.standGlow.intensity = 2.6
    } else {
      // くすませて、終わったことを見せる
      for (const m of g.highlightMats) {
        m.emissive.setScalar(0)
        m.color.setHex(0x6d5f3a)
        m.metalness = 0.4
      }
    }
  }

  update(dt) {
    const D = CONFIG.bonus.door

    // 鍵はゆっくり回って、少し上下する。派手にはしない。
    if (this.key) {
      this.key.t += dt
      this.key.group.rotation.y += (0.45 + this.key.spin) * dt
      this.key.spin *= Math.pow(0.02, dt)
      this.key.group.position.y = this.theme.key.at[1] + Math.sin(this.key.t * 1.6) * 0.06
      if (!this.unlocked) {
        this.key.gold.emissive.setScalar(0.10 + Math.sin(this.key.t * 2.2) * 0.06)
      } else {
        this.key.gold.emissive.setScalar(0.02)
      }
    }

    if (this.phase === 'opening') {
      this.timer += dt
      if (this.timer > D.openDelay) {
        const k = Math.min(1, (this.timer - D.openDelay) / D.openTime)
        if (this.door.angle === 0) this.sfx.playDoor()
        this.door.angle = -1.95 * (1 - Math.pow(1 - k, 3))
        this.door.hinge.rotation.y = this.door.angle
        if (k >= 1) {
          this.phase = 'open'
          this.spawnGold()
          this.onDoorOpen?.()
        }
      }
    }

    if (this.gold) {
      this.gold.mesh.position.copy(this.gold.body.position)
      this.gold.mesh.quaternion.copy(this.gold.body.quaternion)
      this.updateGoldEntry(dt)
    }
    if (this.standGlow && this.standGlow.intensity > 0 && this.goldState === 'resolved') {
      // ゆっくり明滅させて、成功の余韻を残す
      this.goldTimer += dt
      this.standGlow.intensity = 1.8 + Math.sin(this.goldTimer * 3) * 0.7
    }
  }

  /** 扉から出てきて台座に乗るまで。乗ったら叩ける状態になる。 */
  updateGoldEntry(dt) {
    const G = CONFIG.bonus.gold
    if (this.goldState === 'entering') {
      this.goldTimer += dt
      if (this.goldTimer >= G.entryTime) {
        // ここから物理に任せる。台座へストンと乗る。
        const b = this.gold.body
        b.type = CANNON.Body.DYNAMIC
        b.mass = G.type.mass
        b.updateMassProperties()
        b.velocity.setZero()
        b.angularVelocity.set(0, 1.5, 0)
        b.wakeUp()
        this.goldState = 'settling'
        this.goldTimer = 0
      }
    } else if (this.goldState === 'settling') {
      this.goldTimer += dt
      const b = this.gold.body
      const resting = b.velocity.length() < 0.5 && b.position.y < G.standTop + 0.25
      if ((resting && this.goldTimer > G.readyDelay) || this.goldTimer > 2.5) {
        this.goldState = 'ready'
        this.goldTimer = 0
        this.standGlow.intensity = 1.2
        this.onGoldReady?.()
      }
    }
  }

  dispose() {
    for (const m of this.objects) this.scene.remove(m)
    for (const b of this.bodies) this.world.removeBody(b)
    this.objects.length = 0
    this.bodies.length = 0
    this.gold = null
  }
}
