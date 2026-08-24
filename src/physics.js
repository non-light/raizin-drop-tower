import * as CANNON from 'cannon-es'
import { CONFIG } from './config.js'

/**
 * 静的ボディを置く。
 *
 * cannon-es は静的ボディを積分しないので、生成したあとに position を変えても
 * AABB が作られたときのまま（＝原点のまま）になり、ブロードフェーズが
 * 一度もペアにしてくれない。見た目では当たっているのに素通りする原因になる。
 * 位置を決めたら必ずこれを通すこと。
 */
export function placeStatic(body, x, y, z) {
  body.position.set(x, y, z)
  body.aabbNeedsUpdate = true
  body.updateAABB()
  return body
}

/** 物理ワールドと、摩擦の組み合わせ（マテリアル）を作る。 */
export function createWorld() {
  const P = CONFIG.physics

  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, P.gravity, 0) })
  world.broadphase = new CANNON.SAPBroadphase(world)
  world.allowSleep = true
  world.solver.iterations = P.solverIterations
  world.solver.tolerance = 0.001

  const mats = {
    ground: new CANNON.Material('ground'),
    block: new CANNON.Material('block'),
    // 叩いた瞬間だけブロックに割り当てる、摩擦ゼロのマテリアル。
    // これがあるおかげで「上を巻き込まずに横だけスコーンと抜ける」。
    slip: new CANNON.Material('slip'),
  }

  const pair = (a, b, friction, restitution = P.restitution) =>
    world.addContactMaterial(new CANNON.ContactMaterial(a, b, { friction, restitution }))

  pair(mats.block, mats.block, P.friction.blockBlock)
  pair(mats.block, mats.ground, P.friction.blockGround)
  pair(mats.slip, mats.block, P.friction.slip)
  pair(mats.slip, mats.ground, P.friction.slip)
  pair(mats.slip, mats.slip, P.friction.slip)

  // 種類ごとに摩擦が違うブロック（HEAVY / SLIPPERY）ぶんのマテリアルを足す。
  // 触れ合う2面のうち、すべりやすいほうに合わせる。
  const typed = []
  for (const [name, t] of Object.entries(CONFIG.blockTypes)) {
    if (t.friction == null) continue
    const m = new CANNON.Material('block-' + name)
    m.blockFriction = t.friction
    mats[name] = m
    typed.push(m)
  }
  for (let i = 0; i < typed.length; i++) {
    pair(typed[i], mats.block, Math.min(typed[i].blockFriction, P.friction.blockBlock))
    pair(typed[i], mats.ground, Math.min(typed[i].blockFriction, P.friction.blockGround))
    pair(typed[i], mats.slip, P.friction.slip)
    for (let j = i; j < typed.length; j++) {
      pair(typed[i], typed[j], Math.min(typed[i].blockFriction, typed[j].blockFriction))
    }
  }

  const ground = new CANNON.Body({
    type: CANNON.Body.STATIC,
    shape: new CANNON.Plane(),
    material: mats.ground,
  })
  ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0)
  world.addBody(ground)

  return { world, mats }
}
