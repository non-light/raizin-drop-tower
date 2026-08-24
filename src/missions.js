import { CONFIG } from './config.js'

/**
 * ミッション。1プレイごとに2つランダムで出る。
 * クリアの条件ではなく、あくまで「今回はこれも狙ってみる」ための小さな目標。
 *
 * exclusive が同じもの同士は同時に出さない（3COMBO と 5COMBO のような上位互換を避ける）。
 */
export const MISSION_LIST = [
  { id: 'perfect3', text: 'PERFECTを3回成功させる', rank: 'EASY', target: 3, exclusive: 'perfect', read: (s) => s.perfects },
  { id: 'heavyPerfect', text: 'HEAVYをPERFECTで抜く', rank: 'EASY', target: 1, read: (s) => s.perfectByType.heavy },
  { id: 'slipperyPerfect', text: 'SLIPPERYをPERFECTで抜く', rank: 'EASY', target: 1, read: (s) => s.perfectByType.slippery },
  { id: 'bell', text: '鐘を鳴らす', rank: 'EASY', target: 1, read: (s) => s.bellHits },
  { id: 'combo3', text: '3 COMBOを達成する', rank: 'NORMAL', target: 3, exclusive: 'combo', read: (s) => s.maxCombo },
  { id: 'cans3', text: '空き缶を3個倒す', rank: 'NORMAL', target: 3, read: (s) => s.cansToppled },
  { id: 'door', text: '隠し扉を開ける', rank: 'NORMAL', target: 1, read: (s) => s.doorOpened },
  { id: 'combo5', text: '5 COMBOを達成する', rank: 'HARD', target: 5, exclusive: 'combo', read: (s) => s.maxCombo },
  { id: 'golden', text: 'GOLDEN PERFECTを成功させる', rank: 'HARD', target: 1, read: (s) => s.goldenPerfects },
]

const byId = (id) => MISSION_LIST.find((m) => m.id === id)
const pick = (list) => list[Math.floor(Math.random() * list.length)]

/**
 * 2つ選ぶ。HARD が2つ同時には出ない。HARD が入ったら相方は EASY にする。
 * 直前と完全に同じ組み合わせも避ける。
 */
export function rollMissions(previousIds = []) {
  const n = CONFIG.missions.count
  for (let attempt = 0; attempt < 40; attempt++) {
    const first = pick(MISSION_LIST)
    const rest = MISSION_LIST.filter(
      (m) =>
        m.id !== first.id &&
        !(m.exclusive && m.exclusive === first.exclusive) &&
        !(m.rank === 'HARD' && first.rank === 'HARD') &&
        !(first.rank === 'HARD' && m.rank !== 'EASY') &&
        !(m.rank === 'HARD' && first.rank !== 'EASY')
    )
    if (!rest.length) continue
    const second = pick(rest)
    const ids = [first.id, second.id]
    const same =
      previousIds.length === n && ids.every((id) => previousIds.includes(id))
    if (same) continue
    return ids.slice(0, n).map(byId)
  }
  return [byId('perfect3'), byId('bell')]
}

/** 1プレイぶんの進捗。 */
export function newStats() {
  return {
    perfects: 0,
    weaks: 0,
    dangers: 0,
    maxCombo: 0,
    perfectByType: { normal: 0, heavy: 0, slippery: 0, gold: 0 },
    bellHits: 0,
    cansToppled: 0,
    doorOpened: 0,
    goldenPerfects: 0,
    windPerfects: 0, // 強い風の最中に決めた PERFECT
    darkPerfects: 0, // 暗雲のあいだに決めた PERFECT
    blindPerfects: 0, // カーソルが完全に見えない状態で決めた PERFECT
    fastPerfects: 0, // フェイントで速さが変わっている最中に決めた PERFECT
    cleared: false,
    missionsDone: 0,
    missionsTotal: 0,
  }
}

export class Missions {
  constructor(previousIds) {
    this.list = rollMissions(previousIds)
    this.stats = newStats()
    this.done = new Set()
  }

  get ids() {
    return this.list.map((m) => m.id)
  }

  progress(m) {
    return Math.min(m.target, m.read(this.stats))
  }

  /** 進捗を見直して、今この瞬間に達成されたものを返す。 */
  check() {
    const justDone = []
    for (const m of this.list) {
      if (this.done.has(m.id)) continue
      if (m.read(this.stats) >= m.target) {
        this.done.add(m.id)
        justDone.push(m)
      }
    }
    return justDone
  }

  get completed() {
    return this.done.size
  }

  get allDone() {
    return this.done.size === this.list.length
  }
}
