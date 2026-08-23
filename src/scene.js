import * as THREE from 'three'
import { CONFIG } from './config.js'

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.outputColorSpace = THREE.SRGBColorSpace

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x1a2030)
  scene.fog = new THREE.Fog(0x1a2030, 22, 46)

  const C = CONFIG.camera
  const camera = new THREE.PerspectiveCamera(C.fov, 1, 0.1, 200)
  camera.position.set(...C.position)
  camera.lookAt(new THREE.Vector3(...C.target))

  scene.add(new THREE.HemisphereLight(0xbcd2ff, 0x2a2016, 0.65))

  const key = new THREE.DirectionalLight(0xfff2dd, 1.5)
  key.position.set(-7, 12, 8)
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  const d = 8
  key.shadow.camera.left = -d
  key.shadow.camera.right = d
  key.shadow.camera.top = d
  key.shadow.camera.bottom = -d
  key.shadow.camera.near = 1
  key.shadow.camera.far = 40
  key.shadow.bias = -0.0008
  key.shadow.normalBias = 0.03
  scene.add(key)

  const rim = new THREE.DirectionalLight(0x88aaff, 0.4)
  rim.position.set(6, 5, -8)
  scene.add(rim)

  // 床
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshStandardMaterial({ color: 0x232b3c, roughness: 0.95, metalness: 0 })
  )
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.03 // 台と同じ高さだと Z ファイティングするので少し下げる
  floor.receiveShadow = true
  scene.add(floor)

  // 塔を置く台（見た目だけ。当たり判定は床の平面が受け持つ）
  const dais = new THREE.Mesh(
    new THREE.CylinderGeometry(3.4, 3.7, 0.12, 48),
    new THREE.MeshStandardMaterial({ color: 0x414e6e, roughness: 0.85, metalness: 0 })
  )
  dais.position.y = -0.06
  dais.receiveShadow = true
  scene.add(dais)

  return { renderer, scene, camera }
}

export function resize(renderer, camera) {
  // 0 になるとカメラの aspect が NaN になり、何も描かれなくなる
  const w = Math.max(1, innerWidth)
  const h = Math.max(1, innerHeight)
  renderer.setSize(w, h, false)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
}
