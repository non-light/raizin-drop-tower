import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { CONFIG } from './config.js'
import { makeWoodSideTexture, makeWoodCapTexture } from './textures.js'
import { RaizinView } from './raizin.js'

// 段の切れ目が見えないと狙えないので、明暗を交互にはっきり付けている
const BLOCK_TINTS = [
  [214, 164, 100],
  [162, 106, 58],
  [206, 152, 90],
  [150, 96, 52],
  [220, 176, 114],
  [170, 114, 64],
]

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

  for (let i = 0; i < B.count; i++) {
    const tint = BLOCK_TINTS[i % BLOCK_TINTS.length]
    const side = makeWoodSideTexture(i + 1, tint)
    const cap = makeWoodCapTexture(i + 1, tint.map((v) => Math.round(v * 0.88)))

    const opts = { roughness: 0.72, metalness: 0.02 }
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

    const body = new CANNON.Body({
      mass: B.mass,
      shape: new CANNON.Box(new CANNON.Vec3(halfX, halfY, halfZ)),
      material: mats.block,
      linearDamping: P.linearDamping,
      angularDamping: P.angularDamping,
    })
    body.position.set(0, halfY + i * B.height, 0)
    body.allowSleep = true
    body.sleepSpeedLimit = 0.12
    body.sleepTimeLimit = 0.4
    world.addBody(body)

    blocks.push({
      kind: 'block',
      index: i,
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
  view.mesh.position.y = bottomLocal

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
