import * as THREE from 'three'
import { CONFIG } from './config.js'

const HALF_PI = Math.PI / 2
const DIR_NAMES = ['front', 'left', 'back', 'right']

/** -π〜π に畳む。 */
function wrapPi(a) {
  return Math.atan2(Math.sin(a), Math.cos(a))
}

/**
 * 雷神の見た目。物理は1つのオブジェクトのままで、
 * 表示だけをカメラの向きに合わせて 前／右／後ろ／左 の4枚に切り替える。
 *
 * 4枚は同じ大きさ・同じ基準点に正規化された画像を前提にしていて、
 * 板は1枚だけ・大きさも固定のまま map だけ差し替える。
 * こうしておくと、切り替わってもサイズが跳ねたり位置がずれたりしない。
 */
export class RaizinView {
  constructor(sprites) {
    const R = CONFIG.raizin
    this.sprites = sprites

    const tex = sprites.front
    const aspect = tex.image.width / tex.image.height

    // 原点を板の下端に置く。どの向きでも足元が同じ高さに来る。
    const geo = new THREE.PlaneGeometry(1, 1)
    geo.translate(0, 0.5, 0)

    this.material = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      alphaTest: 0.4,
      side: THREE.DoubleSide,
      toneMapped: false,
    })

    this.mesh = new THREE.Mesh(geo, this.material)
    this.mesh.scale.set(R.height * aspect, R.height, 1)
    this.mesh.castShadow = true
    // 板は抜き色つきなので、影も同じ抜きで落とす
    this.mesh.customDepthMaterial = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
      map: tex,
      alphaTest: 0.4,
    })

    this.dirIndex = 0
    this.baseY = 0
    this.bounceT = -1
    this.bouncePower = 0
  }

  /** 足元の高さ（跳ねる前の位置）を決める。 */
  setBaseY(y) {
    this.baseY = y
    this.mesh.position.y = y
  }

  /** コンボのごほうび。見た目だけ跳ねる。物理には一切さわらない。 */
  bounce(power = 1) {
    this.bounceT = 0
    this.bouncePower = power
  }

  /** 物理の姿勢を保ったまま、板だけをカメラへ向ける。 */
  update(camera, group, dt = 0) {
    if (this.bounceT >= 0) {
      this.bounceT += dt
      const t = this.bounceT
      const life = 0.55
      if (t >= life) {
        this.bounceT = -1
        this.mesh.position.y = this.baseY
      } else {
        const k = t / life
        this.mesh.position.y =
          this.baseY + Math.sin(k * Math.PI * 2) * 0.42 * this.bouncePower * (1 - k)
      }
    }

    const local = group.worldToLocal(camera.position.clone())
    const theta = Math.atan2(local.x, local.z)

    // 板の正面をカメラへ。傾きは group（＝物理）側が持っているので、ここでは向きだけ。
    this.mesh.rotation.set(0, theta, 0)

    // 境目でパタパタしないよう、少し行き過ぎてから切り替える
    const hyst = THREE.MathUtils.degToRad(CONFIG.raizin.switchHysteresisDeg)
    const drift = Math.abs(wrapPi(theta - this.dirIndex * HALF_PI))
    if (drift > HALF_PI / 2 + hyst) {
      this.setDirection(((Math.round(theta / HALF_PI) % 4) + 4) % 4)
    }
  }

  setDirection(index) {
    if (index === this.dirIndex) return
    this.dirIndex = index
    let name = DIR_NAMES[index]
    if (CONFIG.raizin.flipSides) {
      if (name === 'left') name = 'right'
      else if (name === 'right') name = 'left'
    }
    const tex = this.sprites[name] || this.sprites.front
    this.material.map = tex
    this.material.needsUpdate = true
    this.mesh.customDepthMaterial.map = tex
    this.mesh.customDepthMaterial.needsUpdate = true
  }

  dispose() {
    this.mesh.geometry.dispose()
    this.material.dispose()
    this.mesh.customDepthMaterial.dispose()
  }
}

/**
 * 画像を読み込んで {front, right, back, left} を返す。
 * 足りない向きは front で代用するので、素材が1枚しかなくても動く。
 */
export function loadRaizinSprites(urls) {
  const loader = new THREE.TextureLoader()
  const names = Object.keys(urls)
  return Promise.all(
    names.map(
      (n) =>
        new Promise((res, rej) =>
          loader.load(
            urls[n],
            (t) => {
              t.colorSpace = THREE.SRGBColorSpace
              t.anisotropy = 8
              res([n, t])
            },
            undefined,
            rej
          )
        )
    )
  ).then((pairs) => {
    const out = Object.fromEntries(pairs)
    for (const n of DIR_NAMES) if (!out[n]) out[n] = out.front
    return out
  })
}
