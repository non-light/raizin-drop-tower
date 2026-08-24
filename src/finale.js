import * as THREE from 'three'

/**
 * 最後の1段を抜いたときの雷。
 * 凝ったパーティクルは使わず、稲妻を数本と一瞬の発光だけ。
 */
export class Lightning {
  constructor(scene) {
    this.scene = scene
    this.group = new THREE.Group()
    this.group.visible = false
    scene.add(this.group)

    this.material = new THREE.LineBasicMaterial({
      color: 0xdff0ff,
      transparent: true,
      opacity: 1,
    })
    this.bolts = []
    for (let i = 0; i < 6; i++) {
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12 * 3), 3))
      const line = new THREE.Line(geo, this.material)
      line.frustumCulled = false
      this.group.add(line)
      this.bolts.push(line)
    }

    this.light = new THREE.PointLight(0xaad4ff, 0, 22)
    scene.add(this.light)

    this.t = -1
    this.life = 0.45
  }

  strike(center, life = 0.45) {
    this.life = life
    this.t = 0
    this.group.visible = true
    this.group.position.copy(center)
    this.light.position.copy(center)
    this.reshape()
  }

  reshape() {
    for (const bolt of this.bolts) {
      const pos = bolt.geometry.attributes.position
      const arr = pos.array
      const a = Math.random() * Math.PI * 2
      const r = 1.2 + Math.random() * 1.4
      const x0 = Math.cos(a) * r
      const z0 = Math.sin(a) * r
      const top = 3.4 + Math.random() * 1.6
      for (let i = 0; i < 12; i++) {
        const k = i / 11
        arr[i * 3] = x0 * (1 - k) + (Math.random() - 0.5) * 0.55
        arr[i * 3 + 1] = top * (1 - k) - 0.3
        arr[i * 3 + 2] = z0 * (1 - k) + (Math.random() - 0.5) * 0.55
      }
      pos.needsUpdate = true
    }
  }

  update(dt) {
    if (this.t < 0) return
    this.t += dt
    const k = this.t / this.life
    if (k >= 1) {
      this.t = -1
      this.group.visible = false
      this.light.intensity = 0
      return
    }
    // ちらつかせる
    if (Math.random() < 0.4) this.reshape()
    this.material.opacity = (1 - k) * (0.6 + Math.random() * 0.4)
    this.light.intensity = (1 - k) * 9 * (0.5 + Math.random() * 0.5)
  }
}
