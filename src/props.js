import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { CONFIG } from './config.js'
import { makeWoodSideTexture, makeWoodCapTexture } from './textures.js'

/**
 * 塔のまわりに置く、飛んだブロックが当たると反応するもの。
 * クリアには一切関係しない遊び要素。
 * 360度カメラで回しても塔を隠さないよう、塔から十分に離して低く置いている。
 */
export class Props {
  constructor({ scene, world, mats, sfx }) {
    this.scene = scene
    this.world = world
    this.sfx = sfx
    this.items = []   // 毎フレーム物理と同期するもの
    this.statics = []  // 動かないもの（片付け用）
    this.bell = null
    this.bellHits = 0
    this.cansToppled = 0

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

  // ---- 鐘 ----
  addBell(mats) {
    const [x, , z] = CONFIG.props.bell.at
    const s = CONFIG.props.bell.scale
    const group = new THREE.Group()
    group.position.set(x, 0, z)

    const woodMat = new THREE.MeshStandardMaterial({
      map: makeWoodSideTexture(31, [126, 88, 52], false),
      roughness: 0.8,
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

    const bell = new THREE.Mesh(
      new THREE.CylinderGeometry(0.52 * s, 0.78 * s, 1.5 * s, 24, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0xb59a4e,
        roughness: 0.35,
        metalness: 0.85,
        side: THREE.DoubleSide,
      })
    )
    bell.position.y = -0.95 * s
    bell.castShadow = true
    pivot.add(bell)
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.52 * s, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      bell.material
    )
    cap.position.y = -0.2 * s
    pivot.add(cap)

    this.scene.add(group)

    const body = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: new CANNON.Cylinder(0.78 * s, 0.78 * s, 1.5 * s, 12),
      material: mats.ground,
    })
    body.position.set(x, 2.05 * s, z)
    this.world.addBody(body)
    body.addEventListener('collide', (e) => {
      if (!e.body.isBlock) return
      const v = Math.abs(e.contact.getImpactVelocityAlongNormal())
      if (v < CONFIG.audio.minImpact) return
      this.bellHits++
      this.sfx.playBell(Math.min(1, 0.4 + v / 14))
      this.bell.swing = Math.min(0.5, 0.12 + v / 30)
      this.bell.t = 0
    })

    this.statics.push({ mesh: group, body })
    this.bell = { pivot, swing: 0, t: 0 }
  }

  // ---- 空き缶 ----
  addCans(mats) {
    const C = CONFIG.props.cans
    const [x, , z] = C.at
    const mat = new THREE.MeshStandardMaterial({ color: 0xa9b3bd, roughness: 0.42, metalness: 0.72 })
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
    for (const c of CONFIG.props.crates) {
      const [x, , z] = c.at
      const side = new THREE.MeshStandardMaterial({
        map: makeWoodSideTexture(Math.round(70 + x * 5), [150, 108, 66], false),
        roughness: 0.85,
      })
      const cap = new THREE.MeshStandardMaterial({
        map: makeWoodCapTexture(Math.round(70 + z * 5), [132, 94, 58]),
        roughness: 0.85,
      })
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), [
        side, side, cap, cap, side, side,
      ])
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
      this.track(mesh, body, 'crate', (p) => this.sfx.playCrate(p))
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
