import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { CONFIG } from './config.js'
import { makeWoodSideTexture, makeWoodCapTexture } from './textures.js'
import { RaizinView } from './raizin.js'

// NORMAL は段の切れ目が見えないと狙えないので、明暗を交互に付ける
const NORMAL_SHADES = [1.0, 0.78, 0.94, 0.7, 1.06, 0.84]

/** どの段をどの種類にするか、毎ゲーム決め直す。 */
function rollTypes(count) {
  const list = []
  for (const [key, t] of Object.entries(CONFIG.blockTypes)) {
    for (let i = 0; i < t.count; i++) list.push(key)
  }
  while (list.length < count) list.push('normal')
  list.length = count
  // シャッフル
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[list[i], list[j]] = [list[j], list[i]]
  }
  return list
}

/**
 * 台の上に木製ブロックを積み、その一番上に雷神を乗せる。
 * 戻り値の pieces はゲーム側が毎フレーム参照する。
 */
export function buildTower({ scene, world, mats, sprites }) {
  const B = CONFIG.block
  const R = CONFIG.raizin
  const P = CONFIG.physics

  const blocks = []
  const halfX = B.width / 2
  const halfY = B.height / 2
  const halfZ = B.depth / 2

  const typeKeys = rollTypes(B.count)

  for (let i = 0; i < B.count; i++) {
    const typeKey = typeKeys[i]
    const type = CONFIG.blockTypes[typeKey]
    // NORMAL だけは隣り合う段が同じ色にならないよう、明暗を振っている
    const shade = typeKey === 'normal' ? NORMAL_SHADES[i % NORMAL_SHADES.length] : 1
    const tint = type.tint.map((v) => Math.max(0, Math.min(255, Math.round(v * shade))))
    const side = makeWoodSideTexture(i + 1, tint)
    const cap = makeWoodCapTexture(i + 1, tint.map((v) => Math.round(v * 0.88)))

    const opts = { roughness: type.roughness, metalness: type.metalness }
    const sideMat = new THREE.MeshStandardMaterial({ map: side, ...opts })
    const capMat = new THREE.MeshStandardMaterial({ map: cap, ...opts })

    // BoxGeometry のマテリアル順は [+X, -X, +Y, -Y, +Z, -Z]。
    // 側面だけ段の境目つきのテクスチャ、天面と底面は木口にする。
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(B.width, B.height, B.depth), [
      sideMat,
      sideMat,
      capMat,
      capMat,
      sideMat,
      sideMat,
    ])
    mesh.castShadow = true
    mesh.receiveShadow = true
    scene.add(mesh)

    const baseMaterial = mats[typeKey] || mats.block
    const body = new CANNON.Body({
      mass: B.mass * type.mass,
      shape: new CANNON.Box(new CANNON.Vec3(halfX, halfY, halfZ)),
      material: baseMaterial,
      linearDamping: P.linearDamping,
      angularDamping: P.angularDamping,
    })
    body.position.set(0, halfY + i * B.height, 0)
    body.allowSleep = true
    body.sleepSpeedLimit = 0.12
    body.sleepTimeLimit = 0.4
    body.isBlock = true // 背景ギミックが「ブロックが当たった」を判別するための目印
    world.addBody(body)

    blocks.push({
      kind: 'block',
      index: i,
      typeKey,
      type,
      baseMaterial,
      mesh,
      body,
      sideMat,
      capMat,
      state: 'tower', // 'tower' | 'out'
    })
  }

  // ---- 雷神 ----
  const stackTop = B.count * B.height

  const group = new THREE.Group()
  scene.add(group)

  const view = new RaizinView(sprites)
  group.add(view.mesh)

  const shapeHalfY = R.height / 2
  // シェイプは重心より comDrop だけ上にずらす。足元は重心から見て下の位置になる。
  const bottomLocal = R.comDrop - shapeHalfY
  view.setBaseY(bottomLocal)

  const raizinBody = new CANNON.Body({
    mass: R.mass,
    material: mats.block,
    linearDamping: R.linearDamping,
    angularDamping: R.angularDamping,
  })
  // 重心が下がるので、多少揺れても持ちこたえる（起き上がりこぼしと同じ理屈）
  raizinBody.addShape(
    new CANNON.Box(new CANNON.Vec3(R.bodyWidth / 2, shapeHalfY, R.bodyDepth / 2)),
    new CANNON.Vec3(0, R.comDrop, 0)
  )
  raizinBody.position.set(0, stackTop - bottomLocal, 0)
  raizinBody.allowSleep = true
  raizinBody.sleepSpeedLimit = 0.1
  raizinBody.sleepTimeLimit = 0.5
  world.addBody(raizinBody)

  const raizin = { kind: 'raizin', mesh: group, body: raizinBody, view }

  return { blocks, raizin }
}

/** 物理の姿勢を見た目へ反映する。 */
export function syncMesh(piece) {
  piece.mesh.position.copy(piece.body.position)
  piece.mesh.quaternion.copy(piece.body.quaternion)
}

const UP = new CANNON.Vec3(0, 1, 0)
const tmp = new CANNON.Vec3()

/** 雷神の傾き（度）。0 = まっすぐ立っている。 */
export function tiltDegrees(body) {
  body.quaternion.vmult(UP, tmp)
  return THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(tmp.y, -1, 1)))
}
