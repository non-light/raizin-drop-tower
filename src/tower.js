import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { CONFIG } from './config.js'
import { makeWoodTexture } from './textures.js'

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
 * 床の上に木製ブロックを積み、その一番上に雷神を乗せる。
 * 戻り値の pieces はゲーム側が毎フレーム参照する。
 */
export function buildTower({ scene, world, mats, raizinTexture }) {
  const B = CONFIG.block
  const R = CONFIG.raizin
  const P = CONFIG.physics

  const blocks = []
  const halfX = B.width / 2
  const halfY = B.height / 2
  const halfZ = B.depth / 2

  for (let i = 0; i < B.count; i++) {
    const tint = BLOCK_TINTS[i % BLOCK_TINTS.length]
    const tex = makeWoodTexture(i + 1, tint)
    tex.repeat.set(1.6, 0.6)

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(B.width, B.height, B.depth),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.72, metalness: 0.02 })
    )
    mesh.castShadow = true
    mesh.receiveShadow = true
    scene.add(mesh)

    // 上面に少しだけ張り出した暗い縁を付けて、段の境目を分かりやすくする
    const rim = new THREE.Mesh(
      new THREE.BoxGeometry(B.width * 1.03, 0.07, B.depth * 1.03),
      new THREE.MeshStandardMaterial({ color: 0x54341a, roughness: 0.85 })
    )
    rim.position.y = B.height / 2 - 0.035
    rim.castShadow = true
    mesh.add(rim)

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
      rim,
      state: 'tower',      // 'tower' | 'flying' | 'out'
      baseEmissive: new THREE.Color(0x000000),
    })
  }

  // ---- 雷神 ----
  const stackTop = B.count * B.height
  const imgAspect = raizinTexture.image.width / raizinTexture.image.height
  const imgW = R.height * imgAspect

  const group = new THREE.Group()
  scene.add(group)

  const shapeHalfY = R.height / 2
  // シェイプは重心より comDrop だけ上にずらす。足元は重心から見て下の位置になる。
  const bottomLocal = R.comDrop - shapeHalfY

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.8, 0.86, 0.18, 32),
    new THREE.MeshStandardMaterial({ color: 0x8c3a2a, roughness: 0.7 })
  )
  base.position.y = bottomLocal + 0.09
  base.castShadow = true
  base.receiveShadow = true
  group.add(base)

  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(imgW, R.height),
    new THREE.MeshBasicMaterial({
      map: raizinTexture,
      transparent: true,
      alphaTest: 0.25,
      side: THREE.DoubleSide,
      toneMapped: false,
    })
  )
  plane.position.y = bottomLocal + 0.18 + R.height / 2
  // 固定カメラ（少し右上）に正対させるため、ほんの少しだけ回しておく
  plane.rotation.y = 0.45
  group.add(plane)

  const raizinBody = new CANNON.Body({
    mass: R.mass,
    material: mats.block,
    linearDamping: R.linearDamping,
    angularDamping: R.angularDamping,
  })
  // シェイプを重心より上にずらすことで重心が下がり、多少揺れても持ちこたえる
  raizinBody.addShape(
    new CANNON.Box(new CANNON.Vec3(R.bodyWidth / 2, shapeHalfY, R.bodyDepth / 2)),
    new CANNON.Vec3(0, R.comDrop, 0)
  )
  raizinBody.position.set(0, stackTop - bottomLocal, 0)
  raizinBody.allowSleep = true
  raizinBody.sleepSpeedLimit = 0.1
  raizinBody.sleepTimeLimit = 0.5
  world.addBody(raizinBody)

  const raizin = { kind: 'raizin', mesh: group, body: raizinBody, plane }

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
