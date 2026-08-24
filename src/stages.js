import * as THREE from 'three'

/**
 * ステージ。ゲームのルールは一切変えず、
 * 背景・床・光・周囲の小物・ギミックの見た目だけを差し替える。
 *
 * 360度どこを見ても不自然にならないよう、飾りは塔を中心とした「輪」で置く。
 * 塔のすぐ後ろに大きいものや派手なものを置かないよう、
 * 近い輪（半径12以内）は低く・まばらにしてある。
 *
 * ギミックの中身（鐘に当たった、缶が倒れた…）は全ステージ共通なので、
 * ミッションや実績はどのステージでもそのまま達成できる。
 */

const T = {
  flat: (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...opts }),
  metal: (color, opts = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.8, ...opts }),
  glow: (color, intensity = 0.6) =>
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.6 }),
}

/** 塔を中心にした輪の上へ、同じものを並べる。360度どこを見ても絵になる。 */
function ring(group, count, radius, make, { jitter = 0, startAngle = 0, faceCenter = true } = {}) {
  for (let i = 0; i < count; i++) {
    const a = startAngle + (i / count) * Math.PI * 2
    const r = radius + (Math.random() - 0.5) * jitter
    const m = make(i)
    if (!m) continue
    m.position.set(Math.cos(a) * r, m.position.y, Math.sin(a) * r)
    if (faceCenter) m.rotation.y = -a + Math.PI / 2
    group.add(m)
  }
}

const box = (w, h, d, mat, y = h / 2) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
  m.position.y = y
  return m
}
const cyl = (r1, r2, h, mat, y = h / 2, seg = 12) => {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), mat)
  m.position.y = y
  return m
}

// ---------------------------------------------------------------- 神社
function shrineScenery(g) {
  const stone = T.flat(0x8d8d86)
  const wood = T.flat(0x9c4b3a)
  const dark = T.flat(0x4a3a30)
  const leaf = T.flat(0x39603a)

  // 鳥居
  for (const [x, z, s] of [[0, 15, 1], [15, -3, 0.85]]) {
    const t = new THREE.Group()
    t.position.set(x, 0, z)
    t.rotation.y = Math.atan2(-x, -z)
    for (const px of [-2.2 * s, 2.2 * s]) {
      const p = cyl(0.26 * s, 0.32 * s, 5.6 * s, wood, 2.8 * s)
      p.position.x = px
      t.add(p)
    }
    t.add(box(6.2 * s, 0.36 * s, 0.5 * s, wood, 5.5 * s))
    t.add(box(5.4 * s, 0.28 * s, 0.4 * s, wood, 4.8 * s))
    g.add(t)
  }

  // 石灯籠。低いので塔を隠さない。
  ring(g, 5, 11.5, () => {
    const l = new THREE.Group()
    l.add(cyl(0.28, 0.34, 1.1, stone, 0.55))
    l.add(box(0.8, 0.55, 0.8, stone, 1.4))
    l.add(box(1.05, 0.18, 1.05, dark, 1.78))
    return l
  }, { startAngle: 0.6 })

  // 木立。遠くに高く。
  ring(g, 14, 20, () => {
    const t = new THREE.Group()
    const h = 4 + Math.random() * 3.5
    t.add(cyl(0.3, 0.4, h * 0.5, dark, h * 0.25))
    const c = new THREE.Mesh(new THREE.ConeGeometry(1.8 + Math.random(), h, 7), leaf)
    c.position.y = h * 0.5 + h * 0.42
    t.add(c)
    return t
  }, { jitter: 5 })

  // 社殿
  const hall = new THREE.Group()
  hall.position.set(-19, 0, -12)
  hall.rotation.y = 0.9
  hall.add(box(9, 3.4, 6, wood, 1.7))
  const roof = new THREE.Mesh(new THREE.ConeGeometry(7.4, 2.4, 4), dark)
  roof.position.y = 4.6
  roof.rotation.y = Math.PI / 4
  hall.add(roof)
  g.add(hall)

  // 提灯
  ring(g, 8, 13.5, () => cyl(0.34, 0.34, 0.7, T.glow(0xffd9a0, 0.45), 2.6), { startAngle: 0.25 })
}

// ---------------------------------------------------------------- 屋上
function rooftopScenery(g) {
  const cool = T.flat(0x6f7a88)
  const dark = T.flat(0x3c444f)
  const glass = T.flat(0x54708c, { roughness: 0.4, metalness: 0.3 })

  // フェンス。支柱を並べて、横は輪でつなぐ。低いので向こうが見える。
  ring(g, 40, 12.5, () => box(0.09, 1.5, 0.09, dark, 0.75), { faceCenter: false })
  for (const y of [1.42, 0.8]) {
    const rail = new THREE.Mesh(new THREE.TorusGeometry(12.5, 0.045, 5, 64), dark)
    rail.rotation.x = Math.PI / 2
    rail.position.y = y
    g.add(rail)
  }

  // 給水タンク
  const tank = new THREE.Group()
  tank.position.set(-14, 0, 9)
  for (const px of [-1.5, 1.5]) {
    for (const pz of [-1.5, 1.5]) {
      const leg = box(0.22, 2.6, 0.22, dark, 1.3)
      leg.position.set(px, 1.3, pz)
      tank.add(leg)
    }
  }
  tank.add(cyl(2.1, 2.1, 2.8, cool, 4.0, 16))
  const cap = new THREE.Mesh(new THREE.ConeGeometry(2.2, 0.9, 16), cool)
  cap.position.y = 5.8
  tank.add(cap)
  g.add(tank)

  // 室外機
  ring(g, 6, 10.5, () => {
    const u = new THREE.Group()
    u.add(box(1.6, 1.1, 0.8, cool, 0.55))
    const fan = cyl(0.38, 0.38, 0.06, dark, 0.55, 14)
    fan.rotation.x = Math.PI / 2
    fan.position.z = 0.42
    u.add(fan)
    return u
  }, { startAngle: 1.1, jitter: 1.6 })

  // 遠くのビル群。高いものは十分に離す。
  ring(g, 22, 26, () => {
    const h = 8 + Math.random() * 22
    const b = box(4 + Math.random() * 4, h, 4 + Math.random() * 4, Math.random() < 0.4 ? glass : dark, h / 2)
    return b
  }, { jitter: 9 })
}

// ---------------------------------------------------------------- 工場
function factoryScenery(g) {
  const steel = T.metal(0x7b828c)
  const dark = T.flat(0x3a3f47)
  const rust = T.flat(0x8a5236)
  const warn = T.glow(0xe8b330, 0.35)

  // 立ち並ぶパイプ
  ring(g, 16, 16, () => {
    const h = 5 + Math.random() * 5
    return cyl(0.28 + Math.random() * 0.2, 0.28, h, steel, h / 2, 10)
  }, { jitter: 4 })

  // 横に走るパイプ
  for (const y of [4.2, 5.6]) {
    const p = new THREE.Mesh(new THREE.TorusGeometry(15, 0.16, 6, 40), steel)
    p.rotation.x = Math.PI / 2
    p.position.y = y
    g.add(p)
  }

  // 作業台と棚
  ring(g, 5, 11, (i) => {
    const w = new THREE.Group()
    w.add(box(2.4, 0.14, 1.1, steel, 1.0))
    for (const px of [-1.0, 1.0]) {
      const leg = box(0.12, 1.0, 0.12, dark, 0.5)
      leg.position.x = px
      w.add(leg)
    }
    if (i % 2 === 0) {
      for (const sy of [1.6, 2.3]) w.add(box(2.4, 0.1, 1.0, dark, sy))
    }
    return w
  }, { startAngle: 0.4 })

  // 機械
  ring(g, 5, 18, () => {
    const m = new THREE.Group()
    const h = 3 + Math.random() * 2.5
    m.add(box(3.4, h, 2.4, dark, h / 2))
    m.add(box(3.5, 0.24, 2.5, warn, h + 0.1))
    m.add(cyl(0.5, 0.5, 1.6, rust, h + 0.9, 10))
    return m
  }, { startAngle: 0.9, jitter: 3 })

  // 注意表示
  ring(g, 8, 13, () => box(1.2, 0.5, 0.06, warn, 1.9), { startAngle: 0.2 })
}

// ---------------------------------------------------------------- 秋葉原
const AKIBA_SIGNS = [
  [0xff4d6d, 'RAIZIN GAME'],
  [0x36d1ff, 'DENKI'],
  [0xffd93d, 'ROBOT LAB'],
  [0x7cff6b, 'GAME CENTER'],
  [0xc77dff, 'AI SHOP'],
  [0xff9f45, 'PARTS'],
]

function akibaScenery(g) {
  const dark = T.flat(0x2a2c3a)
  const panel = T.flat(0x3a3e52)

  // ビルと看板。看板は遠くの高い位置に置き、塔の背後で目を引かないようにする。
  ring(g, 22, 18, (i) => {
    const b = new THREE.Group()
    const h = 9 + Math.random() * 16
    b.add(box(5 + Math.random() * 3, h, 5, dark, h / 2))
    // 縦看板
    const [color] = AKIBA_SIGNS[i % AKIBA_SIGNS.length]
    const sign = box(0.9, 3 + Math.random() * 3, 0.25, T.glow(color, 0.9), h * 0.55)
    sign.position.z = 2.7
    b.add(sign)
    // 窓の帯
    for (let k = 1; k < Math.floor(h / 2.4); k++) {
      const w = box(4.6, 0.28, 0.12, T.glow(0x8fd9ff, 0.35), k * 2.4)
      w.position.z = 2.55
      b.add(w)
    }
    return b
  }, { jitter: 5 })

  // 横看板
  ring(g, 6, 15, (i) => {
    const [color] = AKIBA_SIGNS[(i + 2) % AKIBA_SIGNS.length]
    const s = new THREE.Group()
    s.add(box(3.4, 1.0, 0.2, T.glow(color, 0.8), 3.4))
    s.add(box(0.16, 3.4, 0.16, panel, 1.7))
    return s
  }, { startAngle: 0.5 })

  // カプセルトイ機。低いので塔を隠さない。
  ring(g, 6, 10.5, (i) => {
    const c = new THREE.Group()
    const [color] = AKIBA_SIGNS[i % AKIBA_SIGNS.length]
    c.add(box(0.9, 1.0, 0.9, panel, 0.5))
    const globe = new THREE.Mesh(new THREE.SphereGeometry(0.46, 14, 10), T.glow(color, 0.4))
    globe.position.y = 1.35
    c.add(globe)
    return c
  }, { startAngle: 1.4 })

  // ゲーム筐体
  ring(g, 4, 12.5, (i) => {
    const a = new THREE.Group()
    const [color] = AKIBA_SIGNS[(i + 3) % AKIBA_SIGNS.length]
    a.add(box(1.2, 1.9, 1.0, dark, 0.95))
    const screen = box(1.0, 0.8, 0.08, T.glow(color, 0.7), 1.5)
    screen.position.z = 0.52
    a.add(screen)
    return a
  }, { startAngle: 2.6 })
}

// ---------------------------------------------------------------- 定義
export const STAGES = [
  {
    id: 'shrine',
    name: 'SHRINE',
    nameJa: '神社',
    blurb: '王道のだるま落とし',
    sky: 0x93a9bd,
    fogNear: 30,
    fogFar: 76,
    floor: 0x6c6a63,
    dais: 0x8b8880,
    light: { sky: 0xdfe9ff, ground: 0x5a4a34, hemi: 0.85, key: 0xfff2dd, keyI: 1.5, fill: 0x9ab4d8, fillI: 0.4 },
    scenery: shrineScenery,
    ambience: 'wind',
    // ギミックの見た目と置き場所。中身は全ステージ共通。
    theme: {
      bell: { style: 'shrine', at: [-9.5, 0, 1.2] },
      cans: { at: [-7.4, 0, -1.6], color: 0xa9b3bd },
      crates: [[-2.2, 0, 7.4], [7.2, 0, -2.4], [1.6, 0, -7.6]],
      crateStyle: 'wood',
      key: { at: [-7.2, 1.65, 5.4], style: 'wood' },
      door: { at: [-8.9, 0, 6.7], style: 'wood' },
      gold: { at: [-5.9, 0, 4.6] },
    },
  },
  {
    id: 'rooftop',
    name: 'ROOFTOP',
    nameJa: '屋上',
    blurb: '風と街の開放感',
    sky: 0x6f9ac4,
    fogNear: 34,
    fogFar: 96,
    floor: 0x59606c,
    dais: 0x6d7686,
    light: { sky: 0xd6ecff, ground: 0x4a5464, hemi: 0.95, key: 0xffffff, keyI: 1.6, fill: 0x7fa8dd, fillI: 0.45 },
    scenery: rooftopScenery,
    ambience: 'city',
    theme: {
      bell: { style: 'alarm', at: [8.6, 0, 4.2] },
      cans: { at: [-6.8, 0, 4.6], count: 7, color: 0xb9c2cb },
      crates: [[-8.4, 0, -2.2], [4.6, 0, -7.2], [-1.8, 0, 8.2]],
      crateStyle: 'toolbox',
      key: { at: [5.6, 1.55, -6.8], style: 'metal' },
      door: { at: [7.0, 0, -8.3], style: 'locker' },
      gold: { at: [4.4, 0, -5.4] },
    },
  },
  {
    id: 'factory',
    name: 'FACTORY',
    nameJa: '工場',
    blurb: '飛ばしてぶつける',
    sky: 0x2c3138,
    fogNear: 26,
    fogFar: 66,
    floor: 0x4a4f57,
    dais: 0x5c626c,
    light: { sky: 0xbcd2e8, ground: 0x2a2c30, hemi: 0.7, key: 0xffe8c4, keyI: 1.35, fill: 0x6fd0ff, fillI: 0.5 },
    scenery: factoryScenery,
    ambience: 'machine',
    theme: {
      bell: { style: 'plate', at: [-4.4, 0, -9.2] },
      cans: { at: [7.2, 0, 2.4], count: 8, color: 0x9aa4ae },
      crates: [[-8.6, 0, 3.2], [3.2, 0, 8.4], [8.8, 0, -3.6]],
      crateStyle: 'drum',
      key: { at: [-6.2, 1.7, -6.2], style: 'metal' },
      door: { at: [-7.6, 0, -7.8], style: 'hatch' },
      gold: { at: [-4.8, 0, -4.9] },
    },
  },
  {
    id: 'akihabara',
    name: 'AKIHABARA',
    nameJa: '秋葉原',
    blurb: 'ポップで賑やか',
    sky: 0x14121f,
    fogNear: 28,
    fogFar: 72,
    floor: 0x2f2c3d,
    dais: 0x413c58,
    light: { sky: 0xa8b6ff, ground: 0x3a2050, hemi: 0.6, key: 0xfff0f6, keyI: 1.1, fill: 0xff6bb5, fillI: 0.7 },
    scenery: akibaScenery,
    ambience: 'arcade',
    theme: {
      bell: { style: 'arcade', at: [6.4, 0, -6.6] },
      cans: { at: [-7.6, 0, -2.8], count: 8, color: 0xc0c8d2 },
      crates: [[-5.2, 0, 7.4], [8.6, 0, 2.2], [-8.8, 0, 2.6]],
      crateStyle: 'electronics',
      key: { at: [4.8, 1.6, 7.0], style: 'metal' },
      door: { at: [6.0, 0, 8.6], style: 'cabinet' },
      gold: { at: [3.6, 0, 5.6] },
    },
  },
]

export const getStage = (id) => STAGES.find((s) => s.id === id) || STAGES[0]

/** 選んだステージの飾りだけを組み立てる。選んでいないステージは作らない。 */
export function buildScenery(scene, stage) {
  const group = new THREE.Group()
  stage.scenery(group)
  group.traverse((o) => {
    if (!o.isMesh) return
    o.castShadow = false // 遠景に影は落とさない（重くなるだけ）
    o.receiveShadow = false
  })
  scene.add(group)
  return group
}
