import { CONFIG } from './config.js'
import { ACHIEVEMENTS } from './achievements.js'
import { STAGES } from './stages.js'

export class UI {
  constructor() {
    this.gaugeWrap = document.getElementById('gauge-wrap')
    this.fill = document.getElementById('gauge-fill')
    this.pct = document.getElementById('gauge-pct')
    this.zone = document.getElementById('gauge-zone-good')
    this.zonePerfect = document.getElementById('gauge-zone-perfect')
    this.cloud = document.getElementById('gauge-cloud')
    this.black = document.getElementById('gauge-black')
    this.gaugeFlash = document.getElementById('gauge-flash')
    this.hazardTag = document.getElementById('hazard-tag')
    this.markLo = document.getElementById('gauge-mark-lo')
    this.markHi = document.getElementById('gauge-mark-hi')
    this.remain = document.getElementById('remain')
    this.phase = document.getElementById('phase')
    this.blockType = document.getElementById('blocktype')
    this.judge = document.getElementById('judge')
    this.combo = document.getElementById('combo')
    this.comboText = document.getElementById('combo-text')
    this.bubble = document.getElementById('bubble')
    this.bubbleText = document.getElementById('bubble-text')
    this.wind = document.getElementById('wind-banner')
    this.windArrow = document.getElementById('wind-arrow')
    this.windKind = document.getElementById('wind-kind')
    this.result = document.getElementById('result')
    this.resultTitle = document.getElementById('result-title')
    this.resultSub = document.getElementById('result-sub')
    this.retry = document.getElementById('retry')

    this.guard = document.getElementById('guard')
    this.missionPanel = document.getElementById('missions')
    this.missionList = document.getElementById('mission-list')
    this.missionToast = document.getElementById('mission-toast')
    this.missionResult = document.getElementById('mission-result')
    this.missionResultList = document.getElementById('mission-result-list')
    this.missionResultCount = document.getElementById('mission-result-count')
    this.finaleTitle = document.getElementById('finale-title')
    this.finaleText = document.getElementById('finale-text')
    this.flash = document.getElementById('flash')
    this.soundBtn = document.getElementById('sound')
    this.soundIcon = document.getElementById('sound-icon')
    this.ui = document.getElementById('ui')
    this.toResult = document.getElementById('to-result')
    this.resultStats = document.getElementById('result-stats')
    this.titleName = document.getElementById('title-name')
    this.achToast = document.getElementById('ach-toast')
    this.achPanel = document.getElementById('ach-panel')
    this.achList = document.getElementById('ach-list')
    this.achCount = document.getElementById('ach-count')
    this.bonusTag = document.getElementById('bonus-tag')
    this.bonusHead = this.bonusTag.querySelector('.bt-head')
    this.bonusSub = this.bonusTag.querySelector('.bt-sub')
    this.bonusArrow = this.bonusTag.querySelector('.bt-arrow')
    this.stageSelect = document.getElementById('stage-select')
    this.stageList = document.getElementById('stage-list')
    this.stageBanner = document.getElementById('stage-banner')
    this.openAch = document.getElementById('open-ach')
    this.stageBtn = document.getElementById('open-stage')
    this.closeAch = document.getElementById('close-ach')
    this.closeStage = document.getElementById('close-stage')

    this.bubbleUntil = 0
    const n = CONFIG.blockTypes.normal
    this.setZone({ lo: n.weakMax, hi: n.goodMax, pLo: n.weakMax, pHi: n.goodMax })
  }

  // ---- ミッション ----
  renderMissions(missions) {
    this.missionList.innerHTML = ''
    for (const m of missions.list) {
      const li = document.createElement('li')
      li.dataset.id = m.id
      const done = missions.done.has(m.id)
      li.className = done ? 'done' : ''
      const mark = done ? '✓' : '○'
      const prog = m.target > 1 ? `${missions.progress(m)} / ${m.target}` : ''
      li.innerHTML = `<span class="mk">${mark}</span><span>${m.text}</span><span class="pg">${prog}</span>`
      this.missionList.appendChild(li)
    }
  }

  flashMission(id) {
    const li = this.missionList.querySelector(`li[data-id="${id}"]`)
    if (!li) return
    li.classList.remove('flash')
    void li.offsetWidth
    li.classList.add('flash')
  }

  showMissionToast(text) {
    this.missionToast.textContent = text
    this.missionToast.className = ''
    void this.missionToast.offsetWidth
    this.missionToast.className = 'show'
  }

  renderMissionResult(missions) {
    this.missionResultList.innerHTML = ''
    for (const m of missions.list) {
      const li = document.createElement('li')
      const done = missions.done.has(m.id)
      li.className = done ? 'done' : ''
      li.textContent = `${done ? '✓' : '×'} ${m.text}`
      this.missionResultList.appendChild(li)
    }
    this.missionResultCount.textContent = `${missions.completed} / ${missions.list.length} COMPLETE`
  }

  // ---- COMBO GUARD ----
  // ---- RESULT の内訳と称号 ----
  renderResultStats(stats, title) {
    const rows = [
      ['PERFECT', String(stats.perfects + stats.goldenPerfects)],
      ['MAX COMBO', String(stats.maxCombo)],
      ['DANGER', String(stats.dangers)],
      ['MISSIONS', `${stats.missionsDone} / ${stats.missionsTotal}`],
      ['GOLDEN PERFECT', stats.goldenPerfects > 0 ? '✓' : '—'],
    ]
    this.resultStats.innerHTML = ''
    for (const [k, v] of rows) {
      const dt = document.createElement('dt')
      dt.textContent = k
      const dd = document.createElement('dd')
      dd.textContent = v
      if (v === '✓') dd.className = 'hit'
      this.resultStats.append(dt, dd)
    }
    this.titleName.textContent = `${title.mark} ${title.name} ${title.mark}`
  }

  // ---- ステージ選択 ----
  renderStages(currentId, onPick, canCancel) {
    // 最初の1回は必ず選んでもらう。結果画面から開いたときは戻れるようにする。
    this.closeStage.classList.toggle('hidden', !canCancel)
    this.stageList.innerHTML = ''
    const cards = [...STAGES, { id: 'random', name: 'RANDOM', nameJa: 'おまかせ', blurb: '4つから1つ選ばれる', sky: 0x555a72 }]
    for (const st of cards) {
      const b = document.createElement('button')
      b.className = 'stage-card' + (st.id === currentId ? ' current' : '')
      const sw = `#${st.sky.toString(16).padStart(6, '0')}`
      b.innerHTML =
        `<div class="sc-swatch" style="background:linear-gradient(160deg, ${sw}, rgba(0,0,0,0.5))"></div>` +
        `<div class="sc-name">${st.name}</div>` +
        `<div class="sc-ja">${st.nameJa}</div>` +
        `<div class="sc-blurb">${st.blurb}</div>` +
        (st.id === currentId ? '<div class="sc-last">前回のステージ</div>' : '')
      b.addEventListener('click', () => onPick(st.id))
      this.stageList.appendChild(b)
    }
    this.stageSelect.classList.add('show')
  }

  hideStageSelect() {
    this.stageSelect.classList.remove('show')
  }

  showStageBanner(stage, index) {
    this.stageBanner.querySelector('.sb-no').textContent = `STAGE ${index + 1}`
    this.stageBanner.querySelector('.sb-name').textContent = `${stage.name} / ${stage.nameJa}`
    this.stageBanner.className = ''
    void this.stageBanner.offsetWidth
    this.stageBanner.className = 'show'
  }

  // ---- GOLD BLOCK のボーナス案内 ----
  /**
   * @param at   {x, y, offscreen, angle} 画面上の位置。null で消す
   * @param head 大きいほうの文字
   * @param sub  小さいほうの文字
   */
  setBonusTag(at, head, sub) {
    if (!at) {
      this.bonusTag.className = ''
      return
    }
    if (head) this.bonusHead.textContent = head
    if (sub !== undefined) this.bonusSub.textContent = sub
    this.bonusTag.className = 'show pulse' + (at.offscreen ? ' offscreen' : '')
    this.bonusTag.style.left = `${at.x}px`
    this.bonusTag.style.top = `${at.y}px`
    if (at.offscreen) this.bonusArrow.style.transform = `rotate(${at.angle}rad)`
  }

  // ---- 実績 ----
  showAchievement(a) {
    this.achToast.querySelector('.ach-name').textContent = `${a.mark} ${a.name}`
    this.achToast.className = ''
    void this.achToast.offsetWidth
    this.achToast.className = 'show'
  }

  renderAchievements(achievements) {
    this.achList.innerHTML = ''
    for (const a of ACHIEVEMENTS) {
      const got = achievements.has(a.id)
      const li = document.createElement('li')
      li.className = got ? 'got' : ''
      // 未解除のものは名前を伏せて、ヒントだけ見せる
      li.innerHTML = got
        ? `${a.mark} ${a.name}`
        : `??? <span class="ach-hint">${a.hint}</span>`
      this.achList.appendChild(li)
    }
    this.achCount.textContent = `${achievements.count} / ${ACHIEVEMENTS.length}`
  }

  toggleAchPanel(on) {
    this.achPanel.classList.toggle('show', on)
  }

  setGuard(n) {
    this.guard.className = n > 0 ? 'show' : ''
    if (n > 0) this.guard.textContent = `COMBO GUARD ×${n}`
  }

  useGuard() {
    this.guard.textContent = 'COMBO GUARD!'
    this.guard.className = 'used'
  }

  // ---- クリア演出 ----
  showFlash() {
    this.flash.className = ''
    void this.flash.offsetWidth
    this.flash.className = 'show'
  }

  showFinaleTitle(text) {
    this.finaleText.textContent = text
    this.finaleTitle.className = ''
    void this.finaleTitle.offsetWidth
    this.finaleTitle.className = 'show'
  }

  hideFinaleTitle() {
    this.finaleTitle.className = ''
  }

  /** 余韻タイム。遊んでいる最中のUIを引っ込め、タイトルを小さくして上へ寄せる。 */
  enterAfterglow() {
    this.ui.classList.add('afterglow')
    this.finaleTitle.classList.add('settled')
  }

  exitAfterglow() {
    this.ui.classList.remove('afterglow')
    this.finaleTitle.classList.remove('settled')
  }

  setMuted(muted) {
    this.soundIcon.textContent = muted ? '🔇' : '🔊'
    this.soundBtn.classList.toggle('muted', muted)
  }

  /**
   * ゲージの帯を、いま狙っているコマと難易度に合わせる。
   * 緑が GOOD（抜ける範囲）、その中の金色が PERFECT の芯。
   */
  setZone(band) {
    const lo = band.lo * 100
    const hi = band.hi * 100
    this.zone.style.left = `${lo}%`
    this.zone.style.width = `${hi - lo}%`
    this.zonePerfect.style.left = `${band.pLo * 100}%`
    this.zonePerfect.style.width = `${(band.pHi - band.pLo) * 100}%`
    this.markLo.style.left = `${lo}%`
    this.markHi.style.left = `${hi}%`
  }

  setBlockType(type, key) {
    this.blockType.textContent = type ? type.label : '—'
    this.blockType.className = 'chip type-chip' + (key ? ' ' + key : '')
  }

  // ---- タイミングバーの妨害 ----
  /** @param h { cloud:[lo,hi]|null, blackout:bool, label:string, warning:bool } */
  setHazards(h) {
    if (h.cloud) {
      this.cloud.classList.add('show')
      this.cloud.style.left = `${h.cloud[0] * 100}%`
      this.cloud.style.width = `${(h.cloud[1] - h.cloud[0]) * 100}%`
    } else {
      this.cloud.classList.remove('show')
    }
    this.black.classList.toggle('show', !!h.blackout)
    if (h.label) {
      this.hazardTag.textContent = h.label
      this.hazardTag.className = 'show' + (h.warning ? ' warn' : '')
    } else {
      this.hazardTag.className = ''
    }
  }

  /** フェイントの予兆。速さが変わる直前に一瞬光らせる。 */
  flashGauge() {
    this.gaugeFlash.className = ''
    void this.gaugeFlash.offsetWidth
    this.gaugeFlash.className = 'show'
  }

  setPower(p, charging) {
    this.fill.style.width = `${p * 100}%`
    this.pct.textContent = `${Math.round(p * 100)}%`
    this.gaugeWrap.classList.toggle('charging', charging)
  }

  setRemain(n) {
    this.remain.textContent = `のこり ${n}`
  }

  setPhase(text) {
    this.phase.textContent = text
  }

  /** WEAK / PERFECT / DANGER。CSS のアニメーションを鳴らし直すため、一度クラスを外す。 */
  showJudge(kind, text) {
    this.judge.className = ''
    void this.judge.offsetWidth
    this.judge.textContent = text
    this.judge.className = 'show ' + kind
  }

  showCombo(count) {
    if (count < 1) return
    this.comboText.textContent = count === 1 ? 'PERFECT!' : `${count} COMBO`
    // コンボが伸びるほど少しだけ大きく。伸びすぎないよう頭打ちにする。
    this.combo.style.fontSize = `${20 + Math.min(count, 8) * 3.4}px`
    this.combo.className = ''
    void this.combo.offsetWidth
    this.combo.className = 'show'
  }

  /** 雷神のひとこと。画面に投影した位置へ吹き出しを置く。 */
  say(text, seconds, now) {
    this.bubbleText.textContent = text
    this.bubble.classList.add('show')
    this.bubbleUntil = now + seconds
  }

  updateBubble(screen, now) {
    // 時間切れ、または雷神がカメラの後ろに回ったときは引っ込める
    if (now > this.bubbleUntil || !screen) {
      this.bubble.classList.remove('show')
      return
    }
    this.bubble.classList.add('show')
    this.bubble.style.left = `${screen.x}px`
    this.bubble.style.top = `${screen.y}px`
  }

  setWind(state) {
    if (!state) {
      this.wind.className = ''
      return
    }
    this.windArrow.textContent = state.arrow
    this.windKind.textContent = state.label
    this.wind.className =
      'show' + (state.warning ? ' warn' : '') + (state.label === 'STRONG WIND' ? ' strong' : '')
  }

  showResult(title, sub, cleared) {
    this.exitAfterglow()
    this.hideFinaleTitle()
    this.resultTitle.textContent = title
    this.resultTitle.classList.toggle('clear', cleared)
    this.resultSub.textContent = sub
    this.result.classList.add('show')
  }

  hideResult() {
    this.result.classList.remove('show')
  }
}
