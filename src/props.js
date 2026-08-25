import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { CONFIG } from './config.js'
import { makeWoodSideTexture, makeWoodCapTexture } from './textures.js'
import { placeStatic } from './physics.js'

const BELL_COLOR = { shrine: 0xb59a4e, alarm: 0xc94a3d, plate: 0x9aa3ad, arcade: 0xffd23d }
const FRAME_TINT = { shrine: [126, 88, 52], alarm: [110, 116, 126], plate: [96, 102, 112], arcade: [150, 90, 170] }
const CRATE_TINT = { wood: [150, 108, 66], toolbox: [96, 110, 128], drum: [140, 92, 62], electronics: [92, 96, 130] }

/**
 * 塔のまわりに置く、飛んだブロックが当たると反応するもの。
 * クリアには一切関係しない遊び要素。
 * 360度カメラで回しても塔を隠さないよう、塔から十分に離して低く置いている。
 */
export class Props {
  constructor({ scene, world, mats, sfx, theme }) {
    this.theme = theme
    this.scene = scene
    this.world = world
    this.sfx = sfx
    this.items = []   // 毎フレーム物理と同期するもの
    this.statics = []  // 動かないもの（片付け用）
    this.bell = null
    this.bellHits = 0
    this.cansToppled = 0
    this.crateHits = 0

    if (!CONFIG.props.enabled) return
    this.addBell(mats)
    this.addCans(mats)
    this.addCrates(mats)
  }

  track(mesh, body, kind, onHit) {
    this.scene.add(mesh)
    this.world.addBody(body)
    body.addEventListener('collide', (e) => {
      const other = e.body
      if (!other.isBlock) return
      const v = Math.abs(e.contact.getImpactVelocityAlongNormal())
      if (v < CONFIG.audio.minImpact) return
      onHit(Math.min(1, v / 14))
    })
    this.items.push({ mesh, body, kind })
    return { mesh, body }
  }

  // ---- 鐘にあたるもの（ステージで見た目が変わるだけで、中身は共通） ----
  addBell(mats) {
    const [x, , z] = this.theme.bell.at
    const s = CONFIG.props.bell.scale
    const style = this.theme.bell.style
    const group = new THREE.Group()
    group.position.set(x, 0, z)

    const frameTint = FRAME_TINT[style] ?? [126, 88, 52]
    const woodMat = new THREE.MeshStandardMaterial({
      map: makeWoodSideTexture(31, frameTint, false),
      roughness: style === 'shrine' ? 0.8 : 0.45,
      metalness: style === 'shrine' ? 0 : 0.6,
    })
    const post = new THREE.BoxGeometry(0.22 * s, 3.0 * s, 0.22 * s)
    for (const px of [-1.1 * s, 1.1 * s]) {
      const p = new THREE.Mesh(post, woodMat)
      p.position.set(px, 1.5 * s, 0)
      p.castShadow = true
      group.add(p)
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(2.7 * s, 0.24 * s, 0.24 * s), woodMat)
    beam.position.y = 3.0 * s
    beam.castShadow = true
    group.add(beam)

    // 鐘そのものは梁からぶら下がる。当たったら揺れる（見た目だけ）。
    const pivot = new THREE.Group()
    pivot.position.y = 3.0 * s
    group.add(pivot)

    const metal = new THREE.MeshStandardMaterial({
      color: BELL_COLOR[style] ?? 0xb59a4e,
      roughness: 0.35,
      metalness: 0.85,
      side: THREE.DoubleSide,
    })

    if (style === 'plate') {
      // 工場：吊り下げられた金属板
      const plate = new THREE.Mesh(new THREE.BoxGeometry(1.5 * s, 1.5 * s, 0.12 * s), metal)
      plate.position.y = -0.95 * s
      plate.castShadow = true
      pivot.add(plate)
    } else if (style === 'alarm' || style === 'arcade') {
      // 屋上：非常ベル / 秋葉原：当たりベル。どちらも半球型。
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(0.74 * s, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
        metal
      )
      dome.rotation.x = Math.PI
      dome.position.y = -0.7 * s
      dome.castShadow = true
      pivot.add(dome)
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.16 * s, 10, 8), metal)
      knob.position.y = -1.5 * s
      pivot.add(knob)
    } else {
      // 神社：釣鐘
      const bell = new THREE.Mesh(
        new THREE.CylinderGeometry(0.52 * s, 0.78 * s, 1.5 * s, 24, 1, true),
        metal
      )
      bell.position.y = -0.95 * s
      bell.castShadow = true
      pivot.add(bell)
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.52 * s, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
        metal
      )
      cap.position.y = -0.2 * s
      pivot.add(cap)
    }

    this.scene.add(group)

    const body = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: new CANNON.Cylinder(0.78 * s, 0.78 * s, 1.5 * s, 12),
      material: mats.ground,
    })
    placeStatic(body, x, 2.05 * s, z)
    this.world.addBody(body)
    // 当たりの検出はトリガー側で行う。この物理ボディは
    // 「ブロックが素通りせず、ちゃんと当たって弾かれる」ための見た目担当。
    this.statics.push({ mesh: group, body })
    this.bell = { pivot, swing: 0, t: 0, center: [x, 2.05 * s, z] }
  }

  /** 当たり検出をトリガー側へ登録する。 */
  registerTriggers(triggers) {
    if (!this.bell) return
    triggers.add({
      id: 'bell',
      center: this.bell.center,
      radius: CONFIG.triggers.bell.radius,
      halfHeight: CONFIG.triggers.bell.halfHeight,
      cooldown: 0.35,
      onHit: (body, speed) => this.ringBell(speed),
    })
  }

  ringBell(speed) {
    this.bellHits++
    this.sfx.playBell(Math.min(1, 0.45 + speed / 16))
    this.bell.swing = Math.min(0.5, 0.14 + speed / 30)
    this.bell.t = 0
  }

  // ---- 空き缶 ----
  addCans(mats) {
    const C = { ...CONFIG.props.cans, ...this.theme.cans }
    const [x, , z] = C.at
    const mat = new THREE.MeshStandardMaterial({
      color: C.color ?? 0xa9b3bd,
      roughness: 0.42,
      metalness: 0.72,
    })
    const geo = new THREE.CylinderGeometry(0.19, 0.19, 0.52, 16)

    for (let i = 0; i < C.count; i++) {
      const mesh = new THREE.Mesh(geo, mat)
      mesh.castShadow = true
      mesh.receiveShadow = true
      const body = new CANNON.Body({
        mass: 0.09,
        shape: new CANNON.Cylinder(0.19, 0.19, 0.52, 10),
        material: mats.ground,
        linearDamping: 0.06,
        angularDamping: 0.12,
      })
      body.position.set(
        x + (Math.random() - 0.5) * C.spread * 2,
        0.27 + (i % 2) * 0.54,
        z + (Math.random() - 0.5) * C.spread * 2
      )
      body.allowSleep = true
      body.sleepSpeedLimit = 0.15
      body.sleepTimeLimit = 0.5
      this.track(mesh, body, 'can', (p) => this.sfx.playCanCrash(p))
    }
  }

  // ---- 木箱 ----
  addCrates(mats) {
    const style = this.theme.crateStyle
    for (const at of this.theme.crates) {
      const [x, , z] = at
      const tint = CRATE_TINT[style] ?? [150, 108, 66]
      const shiny = style === 'drum' || style === 'electronics'
      const side = new THREE.MeshStandardMaterial({
        map: makeWoodSideTexture(Math.round(70 + x * 5), tint, false),
        roughness: shiny ? 0.4 : 0.85,
        metalness: shiny ? 0.55 : 0,
      })
      const cap = new THREE.MeshStandardMaterial({
        map: makeWoodCapTexture(Math.round(70 + z * 5), tint.map((v) => Math.round(v * 0.88))),
        roughness: shiny ? 0.4 : 0.85,
        metalness: shiny ? 0.55 : 0,
      })
      // ドラム缶だけ円柱。それ以外は箱。当たり判定は共通の箱のまま。
      const mesh =
        style === 'drum'
          ? new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.1, 18), [side, cap, cap])
          : new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), [side, side, cap, cap, side, side])
      mesh.castShadow = true
      mesh.receiveShadow = true

      const body = new CANNON.Body({
        mass: 1.4,
        shape: new CANNON.Box(new CANNON.Vec3(0.55, 0.55, 0.55)),
        material: mats.ground,
        linearDamping: 0.05,
        angularDamping: 0.15,
      })
      body.position.set(x, 0.56, z)
      body.allowSleep = true
      body.sleepSpeedLimit = 0.14
      body.sleepTimeLimit = 0.5
      this.track(mesh, body, 'crate', (p) => {
        this.crateHits++
        this.sfx.playCrate(p)
      })
    }
  }

  update(dt) {
    let toppled = 0
    for (const it of this.items) {
      it.mesh.position.copy(it.body.position)
      it.mesh.quaternion.copy(it.body.quaternion)
      // 缶が横倒しになったかを、上向きがどれだけ傾いたかで見る
      if (it.kind === 'can') {
        const q = it.body.quaternion
        const upY = 1 - 2 * (q.x * q.x + q.z * q.z)
        if (upY < 0.5) toppled++
      }
    }
    this.cansToppled = Math.max(this.cansToppled, toppled)
    // 鐘の揺れ。減衰する振り子。
    const b = this.bell
    if (b && b.swing > 0.001) {
      b.t += dt
      b.swing *= Math.pow(0.16, dt)
      b.pivot.rotation.z = Math.sin(b.t * 9.5) * b.swing
      b.pivot.rotation.x = Math.cos(b.t * 8.2) * b.swing * 0.4
    }
  }

  dispose() {
    for (const it of [...this.items, ...this.statics]) {
      this.scene.remove(it.mesh)
      this.world.removeBody(it.body)
    }
    this.items.length = 0
    this.statics.length = 0
  }
}
