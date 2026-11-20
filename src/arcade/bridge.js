// src/arcade/bridge.js - 2.5D MMORPG Puzzle Arcade Bridge, Audio & Lifecycle Manager
// Strictly isolated from typing engine via AbortController & capture-phase key handling

const ArcadeSFX = {
  ctx: null,

  isEnabled() {
    if (typeof state !== 'undefined' && state && state.soundEnabled === false) return false;
    return typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  },

  getContext() {
    if (!this.isEnabled()) return null;
    try {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioCtx();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    } catch (_) {
      return null;
    }
  },

  tone(freq, duration = 0.09, type = 'triangle', vol = 0.12, delay = 0) {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + duration + 0.01);
    } catch (_) {}
  },

  step() { this.tone(330, 0.06, 'triangle', 0.09); },
  queue() { this.tone(440, 0.06, 'sine', 0.08); },
  rotate() {
    this.tone(587.33, 0.08, 'sine', 0.1, 0);
    this.tone(880, 0.1, 'sine', 0.08, 0.05);
  },
  unlock() {
    this.tone(523.25, 0.1, 'triangle', 0.12, 0);
    this.tone(659.25, 0.12, 'triangle', 0.12, 0.06);
    this.tone(783.99, 0.18, 'sine', 0.14, 0.12);
  },
  push() { this.tone(180, 0.1, 'sawtooth', 0.08); },
  undo() {
    this.tone(440, 0.07, 'sine', 0.09, 0);
    this.tone(310, 0.1, 'sine', 0.09, 0.05);
  },
  bump() { this.tone(120, 0.14, 'square', 0.1); },
  victory() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, i) => this.tone(n, 0.22, 'triangle', 0.14, i * 0.09));
  }
};

const GAME_META = {
  rune_coder: { icon: '⚔️', name: 'วงกตศิลาจารึก', biome: '🌲 ป่าเอลฟ์โบราณ' },
  crystal_reflector: { icon: '🔮', name: 'หอคอยกระจกสะท้อน', biome: '✨ หอคอยคริสตัลนภา' },
  dungeon_relic: { icon: '📦', name: 'หีบสมบัติวงเวท', biome: '🏛️ วิหารทองคำโบราณ' }
};

function resolveTypedChar(e, expectedChars = []) {
  const raw = e.key;
  if (!raw || raw.length !== 1) return null;
  if (expectedChars.includes(raw)) return raw;
  if (typeof getVirtualChar === 'function') {
    const mapped = getVirtualChar(raw);
    if (mapped && expectedChars.includes(mapped)) return mapped;
    if (typeof state !== 'undefined' && state && state.lang === 'TH' && mapped) {
      return mapped;
    }
  }
  return raw;
}

const ArcadeBridge = {
  activeSession: null,
  isLobbyOpen: false,
  abortController: null,
  lobbyAbortController: null,
  animationFrameId: null,
  playbackTimers: [],

  // Open 2.5D Fantasy Realm Lobby Selector
  openLobby(lessonChars = ['ก', 'ด', 'า', 'ส'], onExit = null) {
    this.closeLobby();
    this.isLobbyOpen = true;

    const chars = (Array.isArray(lessonChars) && lessonChars.length > 0) ? lessonChars : ['ก', 'ด', 'า', 'ส'];
    const previewChips = chars.slice(0, 8).map(c => `<span class="arcade-char-chip">${c}</span>`).join('');

    const overlay = document.createElement('div');
    overlay.id = 'arcade-lobby-overlay';
    overlay.className = 'arcade-overlay';

    overlay.innerHTML = `
      <div class="arcade-modal">
        <div class="arcade-header">
          <div class="arcade-title">
            <span>🏰</span>
            <div>
              <div>หอคอยประลองปัญญา 2.5D (MMORPG Puzzle Arcade)</div>
              <div class="arcade-subtitle">เลือกดินแดนแฟนตาซีเพื่อฝึกตรรกะด้วยลูกศร อักขระบทเรียน และ Spacebar</div>
            </div>
          </div>
          <button type="button" id="arcade-lobby-close" class="arcade-close-btn" aria-label="ปิด">✕</button>
        </div>

        <div class="arcade-lobby-banner">
          <div class="arcade-lesson-chars">
            <span>✨ อักขระเวทมนตร์ประจำบทนี้:</span>
            ${previewChips}
          </div>
          <span class="arcade-pill arcade-pill--stage">🎲 สุ่มด่านใหม่ไม่ซ้ำทุกครั้ง</span>
        </div>

        <div class="arcade-grid">
          <!-- Game 1: Rune Coder -->
          <div class="arcade-card arcade-card--elven" data-game="rune_coder">
            <span class="arcade-badge">2.5D Scratch</span>
            <div class="arcade-icon-pedestal">⚔️</div>
            <div class="arcade-name">วงกตศิลาจารึก</div>
            <div class="arcade-biome">🌲 ป่าเอลฟ์โบราณ</div>
            <div class="arcade-desc">วางแผนป้อนคำสั่งลูกศรล่วงหน้า พิมพ์อักขระร่ายเวทปลดประตู แล้วเคาะ Spacebar รันโปรแกรม</div>
            <div class="arcade-tag">⬆⬇⬅➡ + อักษร + Space</div>
          </div>

          <!-- Game 2: Crystal Reflector -->
          <div class="arcade-card arcade-card--crystal" data-game="crystal_reflector">
            <span class="arcade-badge">2.5D Optics</span>
            <div class="arcade-icon-pedestal">🔮</div>
            <div class="arcade-name">หอคอยกระจกสะท้อน</div>
            <div class="arcade-biome">✨ หอคอยคริสตัลนภา</div>
            <div class="arcade-desc">บังคับจอมเวทเดินไปใกล้กระจก เคาะ Spacebar หมุนมุมสะท้อนแสง พิมพ์อักขระปลุกเสาโอเบลิสก์</div>
            <div class="arcade-tag">⬆⬇⬅➡ + Space + อักษร</div>
          </div>

          <!-- Game 3: Dungeon Relic -->
          <div class="arcade-card arcade-card--temple" data-game="dungeon_relic">
            <span class="arcade-badge">2.5D Sokoban</span>
            <div class="arcade-icon-pedestal">📦</div>
            <div class="arcade-name">หีบสมบัติวงเวท</div>
            <div class="arcade-biome">🏛️ วิหารทองคำโบราณ</div>
            <div class="arcade-desc">พิมพ์อักขระปลดโซ่ตรวน ผลักหีบสมบัติเข้าสู่วงเวททองคำ เคาะ Spacebar ย้อนเวลาเมื่อเดินพลาด</div>
            <div class="arcade-tag">⬆⬇⬅➡ + อักษร + Space</div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const closeBtn = document.getElementById('arcade-lobby-close');
    if (closeBtn) {
      closeBtn.onclick = () => {
        this.closeLobby();
        if (typeof onExit === 'function') onExit();
      };
    }

    if (typeof AbortController !== 'undefined' && typeof window !== 'undefined' && window.addEventListener) {
      this.lobbyAbortController = new AbortController();
      window.addEventListener('keydown', (e) => {
        if (e.code === 'Escape') {
          e.stopImmediatePropagation();
          this.closeLobby();
          if (typeof onExit === 'function') onExit();
        }
      }, { signal: this.lobbyAbortController.signal, capture: true });
    }

    const cards = overlay.querySelectorAll('.arcade-card');
    cards.forEach(card => {
      card.onclick = () => {
        const gameKey = card.getAttribute('data-game');
        this.closeLobby();
        this.launchGame(gameKey, chars, onExit);
      };
    });
  },

  closeLobby() {
    this.isLobbyOpen = false;
    if (this.lobbyAbortController) {
      this.lobbyAbortController.abort();
      this.lobbyAbortController = null;
    }
    const existing = document.getElementById('arcade-lobby-overlay');
    if (existing) existing.remove();
  },

  clearPlaybackTimers() {
    this.playbackTimers.forEach(id => clearTimeout(id));
    this.playbackTimers = [];
  },

  // Launch 2.5D MMORPG Puzzle Game Session
  launchGame(gameKey, lessonChars, onExit) {
    this.dispose();

    const Core = typeof ArcadeCore !== 'undefined' ? ArcadeCore : (typeof window !== 'undefined' ? window.ArcadeCore : null);
    const View = typeof ArcadeView !== 'undefined' ? ArcadeView : (typeof window !== 'undefined' ? window.ArcadeView : null);

    if (!Core || !View) {
      if (typeof alert === 'function') alert('⚠️ ไม่พบเอนจินเกม กำลังโหลดข้อมูล กรุณาลองใหม่อีกครั้ง');
      return;
    }

    const chars = (Array.isArray(lessonChars) && lessonChars.length > 0) ? lessonChars : ['ก', 'ด', 'า', 'ส'];
    let game;
    if (gameKey === 'rune_coder') {
      game = Core.createRuneCoder({ lessonChars: chars, stage: 1, random: true });
    } else if (gameKey === 'crystal_reflector') {
      game = Core.createCrystalReflector({ lessonChars: chars, stage: 1, random: true });
    } else if (gameKey === 'dungeon_relic') {
      game = Core.createDungeonRelic({ lessonChars: chars, stage: 1, random: true });
    }

    if (!game) return;

    const meta = GAME_META[gameKey] || GAME_META.rune_coder;
    const container = document.createElement('div');
    container.id = 'arcade-game-container';
    container.className = 'arcade-overlay';

    container.innerHTML = `
      <div class="arcade-modal arcade-modal--stage">
        <div class="arcade-header">
          <div class="arcade-title">
            <span>${meta.icon}</span>
            <div>
              <div>${meta.name}</div>
              <div class="arcade-subtitle">${meta.biome}</div>
            </div>
          </div>
          <div class="arcade-header-actions">
            <span id="arcade-stage-pill" class="arcade-pill arcade-pill--stage">ด่านที่ ${game.stage}</span>
            <span id="arcade-stars-pill" class="arcade-pill arcade-pill--stars">⭐ 0</span>
            <button type="button" id="arcade-btn-reset" class="arcade-action-btn" title="เริ่มด่านนี้ใหม่">🔄 รีเซ็ต</button>
            <button type="button" id="arcade-btn-shuffle" class="arcade-action-btn" title="สุ่มด่านใหม่">🎲 ด่านใหม่</button>
            <button type="button" id="arcade-btn-lobby" class="arcade-action-btn" title="กลับหน้ารวมเกม">🏠 เปลี่ยนเกม</button>
            <button type="button" id="arcade-game-exit" class="arcade-close-btn" aria-label="ออกจากเกม">✕</button>
          </div>
        </div>
        <div id="arcade-viewport" class="arcade-viewport-container">
          <canvas id="arcade-canvas" width="800" height="560" class="arcade-canvas"></canvas>
        </div>
      </div>
    `;

    document.body.appendChild(container);

    const canvas = document.getElementById('arcade-canvas');
    const view = new View(canvas);
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? Math.min(window.devicePixelRatio, 2) : 1;
    if (typeof view.resize === 'function') {
      view.resize(800, 560, dpr);
    }

    const session = {
      game,
      view,
      gameKey,
      clearedCount: 0,
      isPlayingBack: false,
      victoryShown: false
    };
    this.activeSession = session;

    const updateHeaderPills = () => {
      const stagePill = document.getElementById('arcade-stage-pill');
      const starsPill = document.getElementById('arcade-stars-pill');
      if (stagePill) stagePill.textContent = `ด่านที่ ${game.stage}`;
      if (starsPill) starsPill.textContent = `⭐ ${session.clearedCount}`;
    };

    const removeVictoryOverlay = () => {
      const vo = document.getElementById('arcade-victory-overlay');
      if (vo) vo.remove();
      session.victoryShown = false;
    };

    const advanceToNextStage = () => {
      this.clearPlaybackTimers();
      session.isPlayingBack = false;
      removeVictoryOverlay();
      game.nextStage();
      view.resetVisuals();
      updateHeaderPills();
      ArcadeSFX.unlock();
    };

    const showVictoryOverlay = () => {
      if (session.victoryShown) return;
      session.victoryShown = true;
      session.clearedCount++;
      updateHeaderPills();
      view.spawnVictoryConfetti();
      ArcadeSFX.victory();

      const viewport = document.getElementById('arcade-viewport');
      if (!viewport || typeof document.createElement !== 'function') return;

      const vo = document.createElement('div');
      vo.id = 'arcade-victory-overlay';
      vo.className = 'arcade-victory-overlay';
      vo.innerHTML = `
        <div class="arcade-victory-card">
          <div style="font-size: 2.6rem; margin-bottom: 0.25rem;">🏆</div>
          <div class="arcade-victory-title">ผ่านด่านที่ ${game.stage} สำเร็จ!</div>
          <div class="arcade-victory-sub">ยอดเยี่ยมมาก! พร้อมลุยด่านสุ่มใหม่ที่ท้าทายกว่าเดิมหรือยัง?</div>
          <div class="arcade-victory-actions">
            <button type="button" id="arcade-next-stage-btn" class="arcade-btn-primary">ด่านถัดไป ➡️ (Spacebar)</button>
            <button type="button" id="arcade-win-lobby-btn" class="arcade-btn-secondary">🏰 เปลี่ยนเกม</button>
          </div>
        </div>
      `;
      viewport.appendChild(vo);

      const nextBtn = document.getElementById('arcade-next-stage-btn');
      if (nextBtn) nextBtn.onclick = advanceToNextStage;
      const lobbyBtn = document.getElementById('arcade-win-lobby-btn');
      if (lobbyBtn) {
        lobbyBtn.onclick = () => {
          this.dispose();
          this.openLobby(chars, onExit);
        };
      }
    };

    const resetCurrentStage = () => {
      this.clearPlaybackTimers();
      session.isPlayingBack = false;
      removeVictoryOverlay();
      game.reset();
      view.resetVisuals();
      ArcadeSFX.undo();
    };

    const shuffleStage = () => {
      this.clearPlaybackTimers();
      session.isPlayingBack = false;
      removeVictoryOverlay();
      game.randomizeStage();
      view.resetVisuals();
      updateHeaderPills();
      ArcadeSFX.rotate();
    };

    // Animated step-by-step playback for Rune Coder
    const runRuneCoderPlayback = () => {
      if (session.isPlayingBack || game.queue.length === 0) return;
      const result = game.execute();
      const trace = result.trace || [];

      // Rewind game state visually to start and replay step-by-step
      game.resetPositionOnly();
      game.status = 'executing';
      session.isPlayingBack = true;
      view.activeStepIndex = -1;

      const stepMs = 280;
      trace.forEach((step, idx) => {
        const timerId = setTimeout(() => {
          if (this.activeSession !== session) return;
          view.activeStepIndex = step.stepIndex;

          if (step.hero) {
            game.hero = { ...step.hero };
          }
          if (step.gatesState && game.gates) {
            game.gates.forEach((g, gi) => { g.unlocked = Boolean(step.gatesState[gi]); });
          }

          const heroPt = view.gridToScreen(game.hero.x, game.hero.y);
          if (step.event === 'move') {
            ArcadeSFX.step();
            view.spawnBurst(heroPt.x, heroPt.y + 10, '#86efac', 4, 1.4);
          } else if (step.event === 'unlock' && step.unlockedGate) {
            const gp = view.gridToScreen(step.unlockedGate.x, step.unlockedGate.y);
            ArcadeSFX.unlock();
            view.spawnRing(gp.x, gp.y, '#f472b6', 54);
            view.spawnBurst(gp.x, gp.y, '#fde047', 18, 3.6);
            view.spawnPopup(gp.x, gp.y - 24, `✨ ปลดรูน '${step.unlockedGate.char}'!`, '#f9a8d4');
          } else if (step.event === 'wall_hit' || step.event === 'locked_gate') {
            ArcadeSFX.bump();
            view.triggerShake(8, 16);
            view.spawnBurst(heroPt.x, heroPt.y, '#ef4444', 14, 3.0);
            const msg = step.event === 'locked_gate' ? '🔒 ประตูยังล็อกอยู่!' : '💥 ชนสิ่งกีดขวาง!';
            view.spawnPopup(heroPt.x, heroPt.y - 24, msg, '#fca5a5');
          }
        }, idx * stepMs);
        this.playbackTimers.push(timerId);
      });

      const finishTimer = setTimeout(() => {
        if (this.activeSession !== session) return;
        session.isPlayingBack = false;
        view.activeStepIndex = -1;
        if (result.success) {
          game.status = 'won';
          showVictoryOverlay();
        } else {
          game.status = 'failed';
          if (result.reason === 'not_reached') {
            ArcadeSFX.bump();
            const hp = view.gridToScreen(game.hero.x, game.hero.y);
            view.spawnPopup(hp.x, hp.y - 24, 'ยังเดินไม่ถึงประตูวาร์ป!', '#fde047');
          }
        }
      }, trace.length * stepMs + 160);
      this.playbackTimers.push(finishTimer);
    };

    // Header button hooks
    const resetBtn = document.getElementById('arcade-btn-reset');
    if (resetBtn) resetBtn.onclick = resetCurrentStage;
    const shuffleBtn = document.getElementById('arcade-btn-shuffle');
    if (shuffleBtn) shuffleBtn.onclick = shuffleStage;
    const lobbyBtn = document.getElementById('arcade-btn-lobby');
    if (lobbyBtn) {
      lobbyBtn.onclick = () => {
        this.dispose();
        this.openLobby(chars, onExit);
      };
    }
    const exitBtn = document.getElementById('arcade-game-exit');
    if (exitBtn) {
      exitBtn.onclick = () => {
        this.dispose();
        if (typeof onExit === 'function') onExit();
      };
    }

    // Bind isolated capture-phase keyboard listener
    this.abortController = new AbortController();
    const { signal } = this.abortController;

    window.addEventListener('keydown', (e) => {
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        if (typeof e.preventDefault === 'function') e.preventDefault();
      }

      if (e.code === 'Escape') {
        this.dispose();
        if (typeof onExit === 'function') onExit();
        return;
      }

      if (game.status === 'won') {
        if (e.code === 'Space' || e.code === 'Enter') {
          advanceToNextStage();
        }
        return;
      }

      if (session.isPlayingBack) return;

      // ---------------------------------------------
      // Game 1: Rune Coder (Elven Glade)
      // ---------------------------------------------
      if (game.type === 'rune_coder') {
        if (game.status === 'failed') {
          if (e.code === 'Space' || e.code === 'Backspace') {
            game.resetPositionOnly();
            if (e.code === 'Backspace') game.removeLastCommand();
            ArcadeSFX.undo();
          }
          return;
        }
        if (e.code === 'ArrowUp') { game.addCommand('move_up'); ArcadeSFX.queue(); }
        else if (e.code === 'ArrowDown') { game.addCommand('move_down'); ArcadeSFX.queue(); }
        else if (e.code === 'ArrowLeft') { game.addCommand('move_left'); ArcadeSFX.queue(); }
        else if (e.code === 'ArrowRight') { game.addCommand('move_right'); ArcadeSFX.queue(); }
        else if (e.code === 'Backspace') { game.removeLastCommand(); ArcadeSFX.undo(); }
        else if (e.code === 'Space') {
          if (game.queue.length > 0) runRuneCoderPlayback();
        } else if (e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          const gateChars = (game.gates || []).map(g => g.char);
          const ch = resolveTypedChar(e, gateChars);
          if (ch) {
            game.addCharCommand(ch);
            ArcadeSFX.queue();
          }
        }
      }

      // ---------------------------------------------
      // Game 2: Crystal Reflector (Astral Spire)
      // ---------------------------------------------
      else if (game.type === 'crystal_reflector') {
        if (e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
          const dir = e.code.replace('Arrow', '').toLowerCase();
          if (game.moveHero(dir)) {
            ArcadeSFX.step();
          } else {
            ArcadeSFX.bump();
            view.triggerShake(3, 6);
          }
        } else if (e.code === 'Space') {
          const rotated = game.interactSpacebar();
          if (rotated) {
            const mp = view.gridToScreen(rotated.x, rotated.y);
            ArcadeSFX.rotate();
            view.spawnRing(mp.x, mp.y, '#38bdf8', 38);
            view.spawnBurst(mp.x, mp.y, '#e0f2fe', 10, 2.5);
          } else {
            ArcadeSFX.bump();
          }
        } else if (e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          const ch = resolveTypedChar(e, [game.obelisk.char]);
          if (ch && game.typeChar(ch)) {
            const op = view.gridToScreen(game.obelisk.x, game.obelisk.y);
            view.spawnRing(op.x, op.y, '#34d399', 64);
            view.spawnBurst(op.x, op.y, '#fde047', 22, 4.0);
            view.spawnPopup(op.x, op.y - 30, '⚡ พลังเต็มพิกัด!', '#a7f3d0');
            showVictoryOverlay();
          }
        }
      }

      // ---------------------------------------------
      // Game 3: Dungeon Relic (Ancient Sun Temple)
      // ---------------------------------------------
      else if (game.type === 'dungeon_relic') {
        if (e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
          const dir = e.code.replace('Arrow', '').toLowerCase();
          const prevChests = game.chests.map(c => `${c.x},${c.y}`);
          if (game.moveHero(dir)) {
            const pushedIdx = game.chests.findIndex((c, i) => `${c.x},${c.y}` !== prevChests[i]);
            if (pushedIdx >= 0) {
              const cp = view.gridToScreen(game.chests[pushedIdx].x, game.chests[pushedIdx].y);
              ArcadeSFX.push();
              view.spawnBurst(cp.x, cp.y + 10, '#fcd34d', 8, 2.2);
            } else {
              ArcadeSFX.step();
            }
            if (game.status === 'won') {
              showVictoryOverlay();
            }
          } else {
            ArcadeSFX.bump();
            view.triggerShake(4, 7);
          }
        } else if (e.code === 'Space') {
          if (game.interactSpacebar()) {
            const hp = view.gridToScreen(game.hero.x, game.hero.y);
            ArcadeSFX.undo();
            view.spawnRing(hp.x, hp.y, '#fbbf24', 42);
            view.spawnPopup(hp.x, hp.y - 24, '⏪ ย้อนเวลา', '#fde68a');
          }
        } else if (e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          const lockedChars = game.chests.filter(c => c.locked).map(c => c.char);
          const ch = resolveTypedChar(e, lockedChars);
          if (ch && game.typeChar(ch)) {
            const hp = view.gridToScreen(game.hero.x, game.hero.y);
            ArcadeSFX.unlock();
            view.spawnRing(hp.x, hp.y, '#fbbf24', 52);
            view.spawnBurst(hp.x, hp.y, '#f87171', 16, 3.5);
            view.spawnPopup(hp.x, hp.y - 26, `🔓 ปลดโซ่ '${ch}'!`, '#fde047');
          }
        }
      }
    }, { signal, capture: true });

    // 60 FPS Diorama Render Loop
    const loop = () => {
      if (game.type === 'rune_coder') view.renderRuneCoder(game);
      else if (game.type === 'crystal_reflector') view.renderCrystalReflector(game);
      else if (game.type === 'dungeon_relic') view.renderDungeonRelic(game);

      this.animationFrameId = requestAnimationFrame(loop);
    };

    this.animationFrameId = requestAnimationFrame(loop);
  },

  dispose() {
    this.clearPlaybackTimers();
    this.activeSession = null;
    this.isLobbyOpen = false;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    const container = document.getElementById('arcade-game-container');
    if (container) container.remove();
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ArcadeBridge;
}
if (typeof window !== 'undefined') {
  window.ArcadeBridge = ArcadeBridge;
}
