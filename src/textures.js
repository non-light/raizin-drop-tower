import * as THREE from 'three'

/** 木目テクスチャをcanvasで作る。だるま落としの木材っぽい色味。 */
export function makeWoodTexture(seed = 0, base = [196, 142, 82]) {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 256
  const g = c.getContext('2d')

  let s = seed * 9973 + 12345
  const rnd = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }

  g.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`
  g.fillRect(0, 0, 256, 256)

  // 横方向に流れる木目
  for (let i = 0; i < 150; i++) {
    const y = rnd() * 256
    const dark = rnd() < 0.55
    const a = 0.03 + rnd() * 0.10
    g.strokeStyle = dark ? `rgba(96,58,24,${a})` : `rgba(255,226,186,${a})`
    g.lineWidth = 0.6 + rnd() * 2.6
    g.beginPath()
    g.moveTo(-10, y)
    const amp = 2 + rnd() * 7
    for (let x = -10; x <= 266; x += 16) {
      g.lineTo(x, y + Math.sin((x / 256) * Math.PI * (1 + rnd() * 2)) * amp)
    }
    g.stroke()
  }

  // 節（ふし）
  const knots = 1 + Math.floor(rnd() * 2)
  for (let k = 0; k < knots; k++) {
    const kx = 30 + rnd() * 196
    const ky = 30 + rnd() * 196
    for (let r = 14; r > 0; r -= 2) {
      g.strokeStyle = `rgba(92,55,22,${0.05 + (14 - r) * 0.012})`
      g.lineWidth = 1.2
      g.beginPath()
      g.ellipse(kx, ky, r * 1.6, r * 0.75, 0, 0, Math.PI * 2)
      g.stroke()
    }
  }

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = 4
  return tex
}
