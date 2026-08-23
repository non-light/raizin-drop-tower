import * as THREE from 'three'
import { CONFIG } from './config.js'
import { makeWoodTexture } from './textures.js'

const easeOut = (t) => 1 - Math.pow(1 - t, 3)
const easeIn = (t) => t * t
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)

/**
 * 画面左からブロックを横殴りするハンマー。
 * pivot を中心に Z 軸まわりで回すだけの簡単なもの。
 */
export class Hammer {
  constructor(scene) {
    const H = CONFIG.hammer
    this.cfg = H

    this.dir = H.dir           // +1 = 左から / -1 = 右から
    this.pivot = new THREE.Group()
    this.pivot.position.set(-this.dir * H.pivotX, 2, 0)
    scene.add(this.pivot)

    const handleTex = makeWoodTexture(42, [150, 105, 62])
    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.12, H.armLength, 16),
      new THREE.MeshStandardMaterial({ map: handleTex, roughness: 0.8 })
    )
    handle.rotation.z = -Math.PI / 2
    handle.position.x = (this.dir * H.armLength) / 2
    handle.castShadow = true
    this.pivot.add(handle)

    const headTex = makeWoodTexture(7, [166, 116, 66])
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.78, 0.66, 0.66),
      new THREE.MeshStandardMaterial({ map: headTex, roughness: 0.68 })
    )
    head.position.x = this.dir * H.armLength
    head.castShadow = true
    this.pivot.add(head)
    this.head = head

    this.angle = H.restAngle
    this.pivot.rotation.z = this.dir * this.angle

    this.targetY = 2
    this.swingT = -1
    this.onImpact = null
  }

  /** 待機高さ（＝狙っているブロックの高さ）を指定する。 */
  aimAt(blockCenterY) {
    const H = this.cfg
    this.targetY = blockCenterY + H.armLength * Math.sin(-H.impactAngle)
  }

  /** 追従を待たずに待機高さへ飛ばす。仕切り直しのとき用。 */
  snapToAim() {
    this.pivot.position.y = this.targetY
  }

  /** 振り始める。振り下ろし切った瞬間に onImpact() が1度だけ呼ばれる。 */
  swing(onImpact) {
    this.onImpact = onImpact
    this.swingT = 0
    this.impactFired = false
  }

  get busy() {
    return this.swingT >= 0
  }

  update(dt) {
    const H = this.cfg

    // 待機高さへ追従する。振りかぶり中までは追従し、振り下ろし以降は固定。
    if (this.swingT < 0 || this.swingT < H.windUp) {
      this.pivot.position.y += (this.targetY - this.pivot.position.y) * Math.min(1, dt * 16)
    }

    if (this.swingT >= 0) {
      this.swingT += dt
      const t = this.swingT
      if (t < H.windUp) {
        this.angle = THREE.MathUtils.lerp(H.restAngle, H.raiseAngle, easeOut(t / H.windUp))
      } else if (t < H.windUp + H.swing) {
        const k = (t - H.windUp) / H.swing
        this.angle = THREE.MathUtils.lerp(H.raiseAngle, H.impactAngle, easeIn(k))
      } else {
        if (!this.impactFired) {
          this.impactFired = true
          this.angle = H.impactAngle
          this.onImpact?.()
        }
        const k = (t - H.windUp - H.swing) / H.recover
        if (k >= 1) {
          this.angle = H.restAngle
          this.swingT = -1
        } else {
          this.angle = THREE.MathUtils.lerp(H.impactAngle, H.restAngle, easeInOut(k))
        }
      }
    }

    this.pivot.rotation.z = this.dir * this.angle
  }

  reset() {
    this.swingT = -1
    this.impactFired = false
    this.angle = this.cfg.restAngle
    this.pivot.rotation.z = this.dir * this.angle
  }
}
