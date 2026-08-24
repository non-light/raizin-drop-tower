/**
 * 称号。1プレイの内容から1つだけ選んで RESULT に出す。
 * 上から順に見て、最初に条件を満たしたものが称号になる。
 * レアなものほど上に置いてあるので、並べ替えるだけで優先順位を変えられる。
 */
export const TITLES = [
  {
    id: 'master',
    name: '雷神マスター',
    mark: '⚡',
    test: (s) =>
      s.cleared && s.missionsDone >= s.missionsTotal && s.goldenPerfects > 0 &&
      s.maxCombo >= 5 && s.dangers === 0,
  },
  { id: 'golden', name: '黄金の雷神', mark: '⚡', test: (s) => s.goldenPerfects > 0 },
  {
    id: 'perfectionist',
    name: '完璧主義者',
    mark: '✦',
    test: (s) => s.missionsDone >= s.missionsTotal && s.dangers === 0,
  },
  { id: 'windmaster', name: '風を制する者', mark: '✦', test: (s) => s.windPerfects > 0 },
  { id: 'combo', name: '連撃の鬼', mark: '✦', test: (s) => s.maxCombo >= 5 },
  {
    id: 'destroyer',
    name: '破壊王',
    mark: '✦',
    test: (s) => s.cansToppled >= 4 || s.bellHits >= 2,
  },
  {
    id: 'expert',
    name: '達人',
    mark: '✦',
    test: (s) => s.cleared && s.perfects >= 6 && s.dangers <= 1,
  },
  // どれにも当てはまらなかったとき
  { id: 'challenger', name: '挑戦者', mark: '・', test: () => true },
]

export function pickTitle(stats) {
  return TITLES.find((t) => t.test(stats)) || TITLES[TITLES.length - 1]
}
