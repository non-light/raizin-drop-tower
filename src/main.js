import './style.css'
import { Game } from './game.js'
import { loadRaizinSprites } from './raizin.js'

// 雷神の見た目。設定シート assets/raizin_daruma.png から
//   python3 tools/slice_raizin.py assets/raizin_daruma.png
// で切り出した4方向を使う。差し替えるときはシートを置き換えて再実行するだけでよい。
import front from '../assets/raizin_daruma_front.png'
import left from '../assets/raizin_daruma_left.png'
import right from '../assets/raizin_daruma_right.png'
import back from '../assets/raizin_daruma_back.png'

loadRaizinSprites({ front, left, right, back }).then((sprites) => {
  const game = new Game(document.getElementById('scene'), sprites)
  game.start()
  // 調整用。ブラウザのコンソールから window.game.cfg でパラメータを触れる
  window.game = game
})
