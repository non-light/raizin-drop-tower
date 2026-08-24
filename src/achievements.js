const STORAGE_KEY = 'raizin-drop-tower/achievements'

/**
 * 隠し実績。条件は最初から全部は見せない。
 * 未解除のものは名前を伏せて、ヒントだけ出す。
 */
export const ACHIEVEMENTS = [
  {
    id: 'quiet',
    name: '静かなる達人',
    mark: '✦',
    hint: 'あわてず、荒くならずに最後まで',
    test: (s) => s.cleared && s.dangers === 0,
  },
  {
    id: 'bellringer',
    name: '鐘つき名人',
    mark: '✦',
    hint: '遠くの何かは、何度も鳴らせるらしい',
    test: (s) => s.bellHits >= 3,
  },
  {
    id: 'discovery',
    name: '黄金発見',
    mark: '✦',
    hint: 'あたりを見回すと、閉じたままのものがある',
    test: (s) => s.doorOpened > 0,
  },
  {
    id: 'goldstrike',
    name: '黄金の一撃',
    mark: '⚡',
    hint: '特別な一撃が必要らしい…',
    test: (s) => s.goldenPerfects > 0,
  },
  {
    id: 'windproof',
    name: '風なんて平気',
    mark: '✦',
    hint: '荒れているときこそ、腕の見せどころ',
    test: (s) => s.windPerfects > 0,
  },
  {
    id: 'blindshot',
    name: '見えておる',
    mark: '⚡',
    hint: '見えていなくても、そこにあると分かるときがある',
    test: (s) => s.blindPerfects > 0,
  },
  {
    id: 'fasterthan',
    name: '雷神より速く',
    mark: '⚡',
    hint: '揺さぶられても、崩れない',
    test: (s) => s.fastPerfects > 0,
  },
  { id: 'combo5', name: '五連撃', mark: '✦', hint: '続けて決めるほど良いことがある', test: (s) => s.maxCombo >= 5 },
  { id: 'combo10', name: '十連撃', mark: '⚡', hint: 'ずっと決め続けられたら…？', test: (s) => s.maxCombo >= 10 },
  {
    id: 'fullclear',
    name: '完全攻略',
    mark: '⚡',
    hint: 'すべてを、一度のプレイで',
    test: (s) =>
      s.cleared && s.missionsDone >= s.missionsTotal && s.goldenPerfects > 0 && s.dangers === 0,
  },
]

/** 解除状況。ブラウザに残るので、次に遊んだときも覚えている。 */
export class Achievements {
  constructor() {
    this.unlocked = new Set(load())
  }

  has(id) {
    return this.unlocked.has(id)
  }

  /** いま新しく解除できたものを返す。すでに解除済みのものは返さない。 */
  check(stats) {
    const fresh = []
    for (const a of ACHIEVEMENTS) {
      if (this.unlocked.has(a.id)) continue
      if (!a.test(stats)) continue
      this.unlocked.add(a.id)
      fresh.push(a)
    }
    if (fresh.length) save([...this.unlocked])
    return fresh
  }

  get count() {
    return this.unlocked.size
  }
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function save(ids) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
  } catch {
    // プライベートモードなどで保存できなくても、遊べなくはしない
  }
}
