import * as THREE from 'three'
import { CONFIG } from './config.js'

/**
 * イベント検出用のトリガー。
 *
 * 物理の衝突イベントだけに頼ると、速いブロックが1フレームで通り抜けたときに
 * 取りこぼす。ここでは「前フレームの位置から今の位置まで」を線分として扱い、
 * その線分とトリガー球との距離で判定するので、どれだけ速くても、
 * どの向きから来ても抜けない。
 *
 * 物理の当たり判定（見た目の跳ね返り）とは分けてある。
 * 物理側は素直に置いたまま、イベントだけをこちらで確実に拾う。
 */
export class Triggers {
  constructor(scene) {
    this.scene = scene
    this.list = []
    this.prev = new Map() // body -> 前フレームの位置
    this.debug = null
  }

  /**
   * @param id         名前（デバッグ表示とログ用）
   * @param center     THREE.Vector3 か {x,y,z}
   * @param radius     水平方向の半径
   * @param halfHeight 縦の半分の高さ。鐘のように縦に長いものは球だとずれる。
   * @param once       一度きりなら true
   * @param cooldown 同じトリガーが続けて鳴らない最短間隔（秒）
   * @param onHit    (body, speed) => void
   */
  add({ id, center, radius, halfHeight = 0.3, once = false, cooldown = 0.3, onHit }) {
    const t = {
      id,
      center: new THREE.Vector3(center.x ?? center[0], center.y ?? center[1], center.z ?? center[2]),
      radius,
      halfHeight,
      once,
      cooldown,
      onHit,
      fired: false,
      last: -99,
      inside: new Set(), // いま中にいるボディ。出入りしたときだけ鳴らす。
    }
    this.list.push(t)
    if (this.debug) this.addDebugMesh(t)
    return t
  }

  /** トリガーが動く場合（いまは使っていないが、鐘を吊り替えるときなどに）。 */
  moveTo(t, x, y, z) {
    t.center.set(x, y, z)
    if (t.debugMesh) t.debugMesh.position.copy(t.center)
  }

  /**
   * @param movers [{ body, radius }] 判定したい動くもの
   */
  update(time, movers) {
    for (const { body, radius, halfHeight = 0.3 } of movers) {
      const p = body.position
      let prev = this.prev.get(body)
      if (!prev) {
        prev = new THREE.Vector3(p.x, p.y, p.z)
        this.prev.set(body, prev)
      }

      for (const t of this.list) {
        if (t.once && t.fired) continue
        const reach = t.radius + radius
        const reachY = t.halfHeight + halfHeight
        const near = closestOnSegment(prev, p, t.center, reach)
        const hit = near.d2 <= reach * reach && Math.abs(near.dy) <= reachY

        if (!hit) {
          t.inside.delete(body)
          continue
        }
        // すでに中にいるあいだは鳴らさない。入った瞬間だけ。
        if (t.inside.has(body)) continue
        t.inside.add(body)
        if (time - t.last < t.cooldown) continue

        t.last = time
        t.fired = true
        const v = body.velocity
        const speed = Math.hypot(v.x, v.y, v.z)
        if (CONFIG.debug.logTriggers) {
          // eslint-disable-next-line no-console
          console.log(
            `[trigger] ${t.id} speed=${speed.toFixed(1)} 水平=${Math.sqrt(near.d2).toFixed(2)}/${reach.toFixed(2)} 高さ差=${Math.abs(near.dy).toFixed(2)}/${reachY.toFixed(2)}`
          )
        }
        t.onHit(body, speed)
      }

      prev.set(p.x, p.y, p.z)
    }
  }

  forget(body) {
    this.prev.delete(body)
    for (const t of this.list) t.inside.delete(body)
  }

  // ---- デバッグ表示 ----
  setDebug(on) {
    if (on && !this.debug) {
      this.debug = new THREE.Group()
      this.scene.add(this.debug)
      for (const t of this.list) this.addDebugMesh(t)
    } else if (!on && this.debug) {
      this.scene.remove(this.debug)
      for (const t of this.list) (t.debugMesh = null)
      this.debug = null
    }
  }

  addDebugMesh(t) {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(t.radius, t.radius, t.halfHeight * 2, 18),
      new THREE.MeshBasicMaterial({ color: 0x37ff9a, wireframe: true, transparent: true, opacity: 0.5 })
    )
    mesh.position.copy(t.center)
    this.debug.add(mesh)
    t.debugMesh = mesh
  }

  dispose() {
    this.list.length = 0
    this.prev.clear()
    if (this.debug) {
      this.scene.remove(this.debug)
      this.debug = null
    }
  }
}

/**
 * 移動の線分 A→B のうち、水平方向でいちばん的に近づく点を探す。
 * 高さは別で見る（縦に長いものを球で判定すると、高さ方向でずれるため）。
 * 返すのは、その点での水平距離の2乗と高さの差。
 */
function closestOnSegment(a, b, p) {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const len2 = dx * dx + dz * dz
  let t = 0
  if (len2 > 1e-9) {
    t = ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2
    t = t < 0 ? 0 : t > 1 ? 1 : t
  }
  const ex = p.x - (a.x + dx * t)
  const ez = p.z - (a.z + dz * t)
  const y = a.y + (b.y - a.y) * t
  return { d2: ex * ex + ez * ez, dy: y - p.y }
}
