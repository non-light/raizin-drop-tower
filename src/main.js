import * as THREE from 'three'
import './style.css'
import raizinUrl from '../assets/raizin.png'
import { Game } from './game.js'

// 雷神の画像。差し替えるときは assets/raizin.png を置き換えるだけでよい。
new THREE.TextureLoader().load(raizinUrl, (tex) => {
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  const game = new Game(document.getElementById('scene'), tex)
  game.start()
  // 調整用。ブラウザのコンソールから window.game.cfg でパラメータを触れる
  window.game = game
})
