import * as CANNON from 'cannon-es'
import { CONFIG } from './config.js'

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
    // 叩いた瞬間だけブロックに割り当てる、ほぼ摩擦ゼロのマテリアル。
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

  const ground = new CANNON.Body({
    type: CANNON.Body.STATIC,
    shape: new CANNON.Plane(),
    material: mats.ground,
  })
  ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0)
  world.addBody(ground)

  return { world, mats }
}
