import * as THREE from 'three'
import { CONFIG } from './config.js'
import { makeWoodTexture } from './textures.js'

const easeOut = (t) => 1 - Math.pow(1 - t, 3)
const easeIn = (t) => t * t
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)

/** -π〜π に畳む。角度をなめらかに補間するのに使う。 */
function wrapPi(a) {
  return Math.atan2(Math.sin(a), Math.cos(a))
}

/**
 * ブロックを横から叩くハンマー。
 *
 * 見た目のハンマーをブロックへ物理的に激突させるのではなく、
 * アニメーションでヘッドがブロック表面に届いた瞬間に、
 * ゲーム側がそのブロックへインパルスを与える方式にしている。
 * こちらのほうが、めり込みも取りこぼしもなく安定する。
 *
 * 支点は「カメラ → ブロック」の向きの手前側に置き、腕はその向きへ伸びる。
 * 腕の仰角 0 のときがいちばんブロックに近づく姿勢で、そこがちょうど表面。
 * 振り抜きは仰角をマイナスにするだけなので、ヘッドは下へ抜けていき、
 * ブロックの中へ進むことがない。
 */
export class Hammer {
  constructor(scene) {
    const H = CONFIG.hammer
    this.cfg = H

    this.pivot = new THREE.Group()
    scene.add(this.pivot)

    const handleTex = makeWoodTexture(42, [150, 105, 62])
    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.12, H.armLength, 16),
      new THREE.MeshStandardMaterial({ map: handleTex, roughness: 0.8 })
    )
    handle.rotation.z = -Math.PI / 2
    handle.position.x = H.armLength / 2
    handle.castShadow = true
    this.pivot.add(handle)

    const headTex = makeWoodTexture(7, [166, 116, 66])
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(H.headLength, 0.66, 0.66),
      new THREE.MeshStandardMaterial({ map: headTex, roughness: 0.68 })
    )
    head.position.x = H.armLength
    head.castShadow = true
    this.pivot.add(head)
    this.head = head

    this.angle = H.restAngle
    this.yaw = 0
    this.pos = new THREE.Vector3(0, 2, 0)

    this.wantYaw = 0
    this.wantPos = new THREE.Vector3(0, 2, 0)

    this.swingT = -1
    this.impactFired = false
    this.onImpact = null
    // 当たった手応え。物理の反作用ではなく、見た目だけの小さな揺れ。
    this.recoilT = -1

    this.apply()
  }

  /**
   * 狙う場所を伝える。
   * @param center      ブロックの中心（THREE.Vector3）
   * @param dir         叩く向き（水平の単位ベクトル。カメラ → ブロック）
   * @param surfaceDist ブロック中心から、その向きの表面までの距離
   */
  aim(center, dir, surfaceDist) {
    const H = this.cfg
    // ヘッドの面が表面にちょうど触れる位置に支点を置く
    const standoff = H.armLength + surfaceDist + H.headLength / 2 + H.gap
    this.wantPos.set(center.x - dir.x * standoff, center.y, center.z - dir.z * standoff)
    // 腕はローカル +X 方向。Y 回転でその向きを dir に合わせる。
    this.wantYaw = Math.atan2(-dir.z, dir.x)
  }

  /** いまの狙いへ即座に移す。仕切り直しのとき用。 */
  snapToAim() {
    this.pos.copy(this.wantPos)
    this.yaw = this.wantYaw
    this.apply()
  }

  /** 振り始める。ヘッドがブロック表面に届いた瞬間に onImpact() が1度だけ呼ばれる。 */
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

    // 振っている間は狙いを固定する。カメラを回しても振り込み先はぶれない。
    if (!this.busy) {
      const k = Math.min(1, dt * H.followSpeed)
      this.pos.lerp(this.wantPos, k)
      this.yaw += wrapPi(this.wantYaw - this.yaw) * k
    }

    if (this.swingT >= 0) {
      this.swingT += dt
      const t = this.swingT
      const tSwing = H.windUp + H.swing
      const tThrough = tSwing + H.through

      if (t < H.windUp) {
        // 振りかぶり
        this.angle = THREE.MathUtils.lerp(H.restAngle, H.raiseAngle, easeOut(t / H.windUp))
      } else if (t < tSwing) {
        // 振り下ろし。仰角 0 ＝ ブロック表面に届く姿勢。
        this.angle = THREE.MathUtils.lerp(H.raiseAngle, 0, easeIn((t - H.windUp) / H.swing))
      } else if (t < tThrough) {
        if (!this.impactFired) {
          this.impactFired = true
          this.angle = 0
          this.recoilT = 0
          this.onImpact?.()
        }
        // 振り抜き。仰角がマイナスになるぶん、ヘッドはブロックから離れて下へ抜ける。
        this.angle = THREE.MathUtils.lerp(0, H.throughAngle, easeOut((t - tSwing) / H.through))
      } else {
        const k = (t - tThrough) / H.recover
        if (k >= 1) {
          this.angle = H.restAngle
          this.swingT = -1
        } else {
          this.angle = THREE.MathUtils.lerp(H.throughAngle, H.restAngle, easeInOut(k))
        }
      }
    }

    if (this.recoilT >= 0) {
      this.recoilT += dt
      if (this.recoilT >= H.recoilTime) this.recoilT = -1
    }

    this.apply()
  }

  apply() {
    this.pivot.position.copy(this.pos)
    if (this.recoilT >= 0) {
      // 手元側へ小さく戻して、すぐ収まる。減衰する揺れ。
      const H = this.cfg
      const k = this.recoilT / H.recoilTime
      const amp = H.recoil * (1 - k) * Math.cos(k * Math.PI * 3)
      this.pivot.position.x -= Math.cos(this.yaw) * amp
      this.pivot.position.z += Math.sin(this.yaw) * amp
    }
    // Euler の 'XYZ' は Z → Y の順に効くので、
    // 「腕を持ち上げてから、その向きへ回す」という意図どおりになる。
    this.pivot.rotation.set(0, this.yaw, this.angle)
  }

  reset() {
    this.swingT = -1
    this.impactFired = false
    this.recoilT = -1
    this.angle = this.cfg.restAngle
    this.apply()
  }
}
