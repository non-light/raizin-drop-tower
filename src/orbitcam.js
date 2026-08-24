import * as THREE from 'three'
import { CONFIG } from './config.js'

/**
 * 3Dビューアのような周回カメラ。
 * つねに CONFIG.camera.target を中心に見て、床の下へは回り込まない。
 *
 * 入力の振り分けはここではやらない。ゲーム側が「ブロックを掴んでいないドラッグ」
 * だけを rotate() へ流すことで、叩く操作と干渉しないようにしている。
 */
export class OrbitCam {
  constructor(canvas) {
    const C = CONFIG.camera
    this.canvas = canvas
    this.camera = new THREE.PerspectiveCamera(C.fov, 1, 0.1, 400)
    this.target = new THREE.Vector3(...C.target)
    this.yaw = C.yaw
    this.pitch = C.pitch
    this.distance = C.distance
    this.apply()
  }

  rotate(dx, dy) {
    const C = CONFIG.camera
    this.yaw -= dx * C.rotateSpeed
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * C.rotateSpeed, C.minPitch, C.maxPitch)
    this.apply()
  }

  zoom(deltaY) {
    const C = CONFIG.camera
    this.distance = THREE.MathUtils.clamp(
      this.distance * (1 + deltaY * C.zoomSpeed),
      C.minDistance,
      C.maxDistance
    )
    this.apply()
  }

  apply() {
    const r = this.distance
    const cp = Math.cos(this.pitch)
    this.camera.position.set(
      this.target.x + r * cp * Math.sin(this.yaw),
      this.target.y + r * Math.sin(this.pitch),
      this.target.z + r * cp * Math.cos(this.yaw)
    )
    this.camera.lookAt(this.target)
  }

  /** 塔の高さに合わせて注視点をゆっくり上下させる。 */
  follow(contentTopY, dt) {
    const C = CONFIG.camera
    if (!C.followHeight) return
    const want = THREE.MathUtils.clamp(contentTopY * C.followFactor, C.minTargetY, C.maxTargetY)
    this.target.y += (want - this.target.y) * Math.min(1, dt * C.followRate)
    this.apply()
  }

  reset() {
    const C = CONFIG.camera
    this.target.set(...C.target)
    this.yaw = C.yaw
    this.pitch = C.pitch
    this.distance = C.distance
    this.apply()
  }

  resize() {
    // 0 になると aspect が NaN になり、何も描かれなくなる
    const w = Math.max(1, innerWidth)
    const h = Math.max(1, innerHeight)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    return [w, h]
  }
}
