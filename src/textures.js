import * as THREE from 'three'

function rng(seed) {
  let s = seed * 9973 + 12345
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
}

function finish(canvas) {
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
  tex.anisotropy = 8
  return tex
}

/**
 * ブロックの側面用。木目に加えて、上下の端に暗い帯を焼き込んである。
 * この帯がそのまま段の境目に見えるので、境目用のメッシュを重ねなくてよい
 * ＝面が重ならないので、ちらつきの原因を作らずに済む。
 */
export function makeWoodSideTexture(seed = 0, base = [196, 142, 82], withBands = true) {
  const W = 320
  const H = 96
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')
  const rnd = rng(seed)

  g.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`
  g.fillRect(0, 0, W, H)

  for (let i = 0; i < 130; i++) {
    const y = rnd() * H
    const dark = rnd() < 0.55
    const a = 0.03 + rnd() * 0.10
    g.strokeStyle = dark ? `rgba(96,58,24,${a})` : `rgba(255,226,186,${a})`
    g.lineWidth = 0.6 + rnd() * 2.4
    g.beginPath()
    g.moveTo(-10, y)
    const amp = 1.5 + rnd() * 4
    for (let x = -10; x <= W + 10; x += 18) {
      g.lineTo(x, y + Math.sin((x / W) * Math.PI * (1 + rnd() * 2)) * amp)
    }
    g.stroke()
  }

  // 節（ふし）
  for (let k = 0, n = 1 + Math.floor(rnd() * 2); k < n; k++) {
    const kx = 40 + rnd() * (W - 80)
    const ky = 24 + rnd() * (H - 48)
    for (let r = 12; r > 0; r -= 2) {
      g.strokeStyle = `rgba(92,55,22,${0.05 + (12 - r) * 0.014})`
      g.lineWidth = 1.2
      g.beginPath()
      g.ellipse(kx, ky, r * 1.7, r * 0.7, 0, 0, Math.PI * 2)
      g.stroke()
    }
  }

  // 上下の暗い帯＝段の境目。これをテクスチャに焼くことで、
  // 境目用のメッシュを重ねずに済ませている。
  if (withBands) {
    const band = Math.round(H * 0.085)
    for (const [y0, y1] of [[0, band], [H - band, H]]) {
      const grad = g.createLinearGradient(0, y0, 0, y1)
      const dark = 'rgba(52,30,12,0.72)'
      const clear = 'rgba(52,30,12,0)'
      grad.addColorStop(0, y0 === 0 ? dark : clear)
      grad.addColorStop(1, y0 === 0 ? clear : dark)
      g.fillStyle = grad
      g.fillRect(0, y0, W, y1 - y0)
    }
  }

  return finish(c)
}

/** ブロックの天面・底面用。年輪っぽい木口。 */
export function makeWoodCapTexture(seed = 0, base = [176, 126, 72]) {
  const S = 256
  const c = document.createElement('canvas')
  c.width = S
  c.height = S
  const g = c.getContext('2d')
  const rnd = rng(seed + 77)

  g.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`
  g.fillRect(0, 0, S, S)

  const cx = S / 2 + (rnd() - 0.5) * 40
  const cy = S / 2 + (rnd() - 0.5) * 40
  for (let r = 4; r < S; r += 5 + rnd() * 5) {
    g.strokeStyle = `rgba(104,64,26,${0.10 + rnd() * 0.10})`
    g.lineWidth = 1 + rnd() * 1.6
    g.beginPath()
    g.ellipse(cx, cy, r, r * (0.9 + rnd() * 0.2), rnd() * 0.4, 0, Math.PI * 2)
    g.stroke()
  }

  return finish(c)
}

/** ハンマー用。柄と頭で使い回す、向きを問わない木目。 */
export function makeWoodTexture(seed = 0, base = [166, 116, 66]) {
  return makeWoodSideTexture(seed + 200, base, false)
}
