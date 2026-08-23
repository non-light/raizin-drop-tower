/**
 * ゲームの調整値はすべてここに集約している。
 * 「もっと重くしたい」「抜けすぎる」といった調整は、原則このファイルだけを触れば効く。
 */
export const CONFIG = {
  physics: {
    gravity: -20,          // 小さく（-14 など）すると全体がゆっくり重たくなる
    fixedStep: 1 / 120,
    maxSubSteps: 4,
    solverIterations: 24,
    friction: {
      blockBlock: 0.55,    // ブロック同士。大きいほど抜けにくい
      blockGround: 0.60,
      slip: 0.0,           // 叩いた瞬間だけ使う摩擦＝スコーン！の正体。0 でないと荷重に負けて止まる
    },
    restitution: 0.02,     // 跳ね返り。上げるとバタつく
    linearDamping: 0.02,
    angularDamping: 0.10,
  },

  block: {
    count: 5,
    width: 2.2,
    height: 0.7,
    depth: 2.2,
    mass: 1.0,
  },

  raizin: {
    height: 2.0,           // 画像の高さ（幅は元画像のアスペクト比から自動計算）
    bodyWidth: 1.7,        // 当たり判定の幅
    bodyDepth: 0.9,
    mass: 1.6,
    comDrop: 0.75,         // 重心を見た目より下げる量。大きいほど倒れにくい（起き上がりこぼし効果）
    linearDamping: 0.05,
    angularDamping: 0.45,  // 上げるほど揺れがすぐ収まる
    fallTiltDeg: 50,       // これ以上傾いたら「倒れた」
    slideLimit: 2.6,       // 塔の軸からこれだけ横にずれたら「落ちた」
  },

  hit: {
    chargeCycle: 0.75,     // 0% → 100% にかかる秒数（往復するので1周期は1.5秒）
    weakMax: 0.30,         // これ未満は「弱すぎ」
    goodMax: 0.78,         // これを超えると「強すぎ」
    speedMin: 2.0,         // パワー0%のときの初速
    speedMax: 28.0,        // パワー100%のときの初速
    slideTime: 0.30,       // 「ちょうどいい／強すぎ」で、抜ける勢いを保証する秒数。
                           //   この間だけ摩擦を消し、上の段に引っかかっても減速させない＝スコーン！
    weakSlideTime: 0.05,   // 「弱すぎ」の保証時間。短いので少し動いただけで荷重に負けて止まる
    overhitCurve: 0.7,     // 「強すぎ」の効き方。小さいほど、少し超えただけでも一気に危なくなる
    overhitTorque: 7.0,    // 強すぎたときにブロックへ加わる回転
    overhitLift: 0.35,     // 強すぎたときの上向き成分（初速に対する割合）
    shakeAbove: 3.0,       // 強すぎたとき、上のブロック／雷神へ伝わる横向きの衝撃
    shakeHeight: 0.7,      // その衝撃を重心よりどれだけ上に加えるか。大きいほど傾く
    jitter: 0.22,          // 上のブロックに毎回入るランダムなブレ。0 にすると毎回同じ動きになる
  },

  hammer: {
    windUp: 0.18,          // 振りかぶりの秒数
    swing: 0.09,           // 振り下ろし（横振り）の秒数
    recover: 0.35,         // 戻りの秒数
    dir: -1,               // -1 = 画面右から叩く（ブロックは左へ飛ぶ）／ 1 = 左から叩く
    pivotX: 4.6,           // ハンマーの支点までの距離。塔は x=0
    armLength: 3.2,
    restAngle: 0.35,       // 待機時の角度(rad)
    raiseAngle: 1.15,      // 振りかぶり角度(rad)
    impactAngle: -0.10,    // 命中時の角度(rad)
  },

  rules: {
    strayLimit: 2,         // 意図せず塔から外れたブロックがこの数に達したら「崩壊」
    settleSpeed: 0.35,     // これ以下の速度になったら静止とみなす
    settleHold: 0.45,      // 静止が続くべき秒数
    settleTimeout: 4.0,    // 静止しなくてもこの秒数で打ち切る
    clearOutDistance: 3.0, // 塔の軸からこれだけ離れたら「抜けた」と判定
    despawnDistance: 22,   // これを超えたブロックは消す
  },

  camera: {
    fov: 42,
    position: [6.6, 4.4, 9.6],  // 少しだけ横・上から見る3D視点
    target: [0, 2.0, 0],
  },
}
