import * as THREE from 'three'
import { CONFIG } from './config.js'

/** ステージの色と光を反映する。中身（床・台）は使い回す。 */
export function applyStage(ctx, stage) {
  const { scene, floor, dais, hemi, key, fill } = ctx
  scene.background.setHex(stage.sky)
  scene.fog.color.setHex(stage.sky)
  scene.fog.near = stage.fogNear
  scene.fog.far = stage.fogFar
  floor.material.color.setHex(stage.floor)
  dais.material.color.setHex(stage.dais)
  const L = stage.light
  hemi.color.setHex(L.sky)
  hemi.groundColor.setHex(L.ground)
  hemi.intensity = L.hemi
  key.color.setHex(L.key)
  key.intensity = L.keyI
  fill.color.setHex(L.fill)
  fill.intensity = L.fillI
}

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.outputColorSpace = THREE.SRGBColorSpace

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x1a2030)
  scene.fog = new THREE.Fog(0x1a2030, 34, 78)

  const hemi = new THREE.HemisphereLight(0xbcd2ff, 0x2a2016, 0.7)
  scene.add(hemi)

  // 主光源は真横から回り込まない位置に置く。360度から見るので、
  // どの向きから見てもブロックの段差が読めるように少し高めにしている。
  const key = new THREE.DirectionalLight(0xfff2dd, 1.4)
  key.position.set(-8, 18, 10)
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  const d = 13
  key.shadow.camera.left = -d
  key.shadow.camera.right = d
  key.shadow.camera.top = d
  key.shadow.camera.bottom = -d
  key.shadow.camera.near = 1
  key.shadow.camera.far = 60
  key.shadow.bias = -0.0006
  key.shadow.normalBias = 0.03
  scene.add(key)

  const fill = new THREE.DirectionalLight(0x88aaff, 0.45)
  fill.position.set(9, 7, -11)
  scene.add(fill)

  // 床。台の天面（y=0）とは十分に離して置く。近すぎると遠景で Z ファイティングになる。
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 120),
    new THREE.MeshStandardMaterial({ color: 0x232b3c, roughness: 0.95, metalness: 0 })
  )
  floor.rotation.x = -Math.PI / 2
  floor.position.y = CONFIG.floorY
  floor.receiveShadow = true
  scene.add(floor)

  // 塔を置く台。天面をちょうど y=0（物理の地面）に合わせてある。
  // ブロックの底面とは向きが逆なので、重なっていてもちらつかない。
  const dais = new THREE.Mesh(
    new THREE.CylinderGeometry(3.6, 3.95, -CONFIG.floorY, 56),
    new THREE.MeshStandardMaterial({ color: 0x414e6e, roughness: 0.85, metalness: 0 })
  )
  dais.position.y = CONFIG.floorY / 2
  dais.receiveShadow = true
  scene.add(dais)

  return { renderer, scene, floor, dais, hemi, key, fill }
}
