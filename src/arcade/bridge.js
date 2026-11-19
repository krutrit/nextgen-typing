// src/arcade/bridge.js - MMORPG Puzzle Arcade Bridge & Lifecycle Manager
// Isolated from typing system; uses AbortController for clean input binding

const ArcadeBridge = {
  activeSession: null,
  isLobbyOpen: false,
  abortController: null,
  animationFrameId: null,

  // Open Dungeon Lobby Selector
  openLobby(lessonChars = ['ก', 'ด', 'า', 'ส'], onExit = null) {
    this.closeLobby();
    this.isLobbyOpen = true;

    const overlay = document.createElement('div');
    overlay.id = 'arcade-lobby-overlay';
    overlay.className = 'arcade-overlay';

    overlay.innerHTML = `
      <div class="arcade-modal">
        <div class="arcade-header">
          <div class="arcade-title">
            <span>🏰</span>
            <span>หอคอยประลองปัญญา (MMORPG Puzzle Arcade)</span>
          </div>
          <button type="button" id="arcade-lobby-close" class="arcade-close-btn" aria-label="ปิด">✕</button>
        </div>

        <div class="arcade-grid">
          <!-- Game 1: Rune Coder -->
          <div class="arcade-card" data-game="rune_coder">
            <span class="arcade-badge">Scratch Style</span>
            <div class="arcade-icon">⚔️</div>
            <div class="arcade-name">วงกตศิลาจารึก</div>
            <div class="arcade-desc">ป้อนโค้ดลูกศรล่วงหน้า พิมพ์อักขระปลดสลัก เคาะ Spacebar รันคำสั่ง</div>
            <div class="arcade-tag">ลูกศร + อักษร + Space</div>
          </div>

          <!-- Game 2: Crystal Reflector -->
          <div class="arcade-card" data-game="crystal_reflector">
            <span class="arcade-badge">Optics Puzzle</span>
            <div class="arcade-icon">🔮</div>
            <div class="arcade-name">หอคอยกระจกสะท้อน</div>
            <div class="arcade-desc">เดินปรับมุมกระจก เคาะ Spacebar หมุนทิศทาง พิมพ์อักขระยิงลำแสง</div>
            <div class="arcade-tag">ลูกศร + อักษร + Space</div>
          </div>

          <!-- Game 3: Dungeon Relic -->
          <div class="arcade-card" data-game="dungeon_relic">
            <span class="arcade-badge">Sokoban RPG</span>
            <div class="arcade-icon">📦</div>
            <div class="arcade-name">หีบสมบัติวงเวท</div>
            <div class="arcade-desc">ผลักหีบสมบัติ พิมพ์อักขระปลดโซ่ตรวน เคาะ Spacebar ย้อนเวลา</div>
            <div class="arcade-tag">ลูกศร + อักษร + Space</div>
          </div>

          <!-- Game 4: Original Lettercraft 3D -->
          <div class="arcade-card" data-game="lettercraft_3d">
            <span class="arcade-badge">3D Voxel</span>
            <div class="arcade-icon">🌲</div>
            <div class="arcade-name">นักสำรวจ 3 มิติ</div>
            <div class="arcade-desc">สำรวจโลกบล็อก 3D ขุดแร่ ฟันมอนสเตอร์ เก็บตัวอักษรแบบดั้งเดิม</div>
            <div class="arcade-tag">WASD + เมาส์ + สเปซ</div>
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

    // Attach click events to game cards
    const cards = overlay.querySelectorAll('.arcade-card');
    cards.forEach(card => {
      card.onclick = () => {
        const gameKey = card.getAttribute('data-game');
        this.closeLobby();

        if (gameKey === 'lettercraft_3d') {
          // Trigger original Lettercraft 3D
          if (typeof startLettercraftGame === 'function') {
            startLettercraftGame();
          } else if (typeof startMiniGame === 'function') {
            startMiniGame();
          }
        } else {
          // Launch MMORPG Puzzle
          this.launchGame(gameKey, lessonChars, onExit);
        }
      };
    });
  },

  closeLobby() {
    this.isLobbyOpen = false;
    const existing = document.getElementById('arcade-lobby-overlay');
    if (existing) existing.remove();
  },

  // Launch specific MMORPG puzzle game session
  launchGame(gameKey, lessonChars, onExit) {
    this.dispose();

    const Core = typeof ArcadeCore !== 'undefined' ? ArcadeCore : (typeof window !== 'undefined' ? window.ArcadeCore : null);
    const View = typeof ArcadeView !== 'undefined' ? ArcadeView : (typeof window !== 'undefined' ? window.ArcadeView : null);

    if (!Core || !View) {
      alert('⚠️ ไม่พบเอนจินเกม กำลังโหลดข้อมูล กรุณาลองใหม่อีกครั้ง');
      return;
    }

    let game;
    if (gameKey === 'rune_coder') {
      game = Core.createRuneCoder({ lessonChars });
    } else if (gameKey === 'crystal_reflector') {
      game = Core.createCrystalReflector({ lessonChars });
    } else if (gameKey === 'dungeon_relic') {
      game = Core.createDungeonRelic({ lessonChars });
    }

    if (!game) return;

    // Create Stage Container
    const container = document.createElement('div');
    container.id = 'arcade-game-container';
    container.className = 'arcade-overlay';

    this.activeSession = { game, view, gameKey };

    container.innerHTML = `
      <div class="arcade-modal" style="max-width: 680px; height: 560px;">
        <div class="arcade-header">
          <div class="arcade-title">
            <span>${gameKey === 'rune_coder' ? '⚔️ วงกตศิลาจารึก' : gameKey === 'crystal_reflector' ? '🔮 หอคอยกระจกสะท้อน' : '📦 หีบสมบัติวงเวท'}</span>
          </div>
          <button type="button" id="arcade-game-exit" class="arcade-close-btn" aria-label="ออกจากเกม">✕</button>
        </div>
        <div class="arcade-viewport-container" style="flex: 1; padding: 0.5rem; background: #0f111a;">
          <canvas id="arcade-canvas" width="640" height="470" class="arcade-canvas"></canvas>
        </div>
      </div>
    `;

    document.body.appendChild(container);

    const canvas = document.getElementById('arcade-canvas');
    const view = new View(canvas);

    const exitBtn = document.getElementById('arcade-game-exit');
    if (exitBtn) {
      exitBtn.onclick = () => {
        this.dispose();
        if (typeof onExit === 'function') onExit();
      };
    }

    // Bind Keyboard with AbortController
    this.abortController = new AbortController();
    const { signal } = this.abortController;

    window.addEventListener('keydown', (e) => {
      // Prevent browser scroll on game controls
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }

      if (game.status === 'won') {
        if (e.code === 'Space' || e.code === 'Enter') {
          this.dispose();
          if (typeof onExit === 'function') onExit();
        }
        return;
      }

      // ---------------------------------------------
      // Game 1: Rune Coder Input
      // ---------------------------------------------
      if (game.type === 'rune_coder') {
        if (e.code === 'ArrowUp') game.addCommand('forward');
        else if (e.code === 'ArrowDown') game.addCommand('backward');
        else if (e.code === 'ArrowLeft') game.addCommand('left');
        else if (e.code === 'ArrowRight') game.addCommand('right');
        else if (e.code === 'Backspace') game.removeLastCommand();
        else if (e.code === 'Space') {
          if (game.status === 'failed') game.reset();
          else game.execute();
        } else if (e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
          game.addCharCommand(e.key);
        }
      }

      // ---------------------------------------------
      // Game 2: Crystal Reflector Input
      // ---------------------------------------------
      else if (game.type === 'crystal_reflector') {
        if (e.code === 'ArrowUp') game.hero.y = Math.max(0, game.hero.y - 1);
        else if (e.code === 'ArrowDown') game.hero.y = Math.min(game.height - 1, game.hero.y + 1);
        else if (e.code === 'ArrowLeft') game.hero.x = Math.max(0, game.hero.x - 1);
        else if (e.code === 'ArrowRight') game.hero.x = Math.min(game.width - 1, game.hero.x + 1);
        else if (e.code === 'Space') game.interactSpacebar();
        else if (e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
          game.typeChar(e.key);
        }
      }

      // ---------------------------------------------
      // Game 3: Dungeon Relic Input
      // ---------------------------------------------
      else if (game.type === 'dungeon_relic') {
        if (e.code === 'ArrowUp') game.moveHero('up');
        else if (e.code === 'ArrowDown') game.moveHero('down');
        else if (e.code === 'ArrowLeft') game.moveHero('left');
        else if (e.code === 'ArrowRight') game.moveHero('right');
        else if (e.code === 'Space') game.interactSpacebar();
        else if (e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
          game.typeChar(e.key);
        }
      }
    }, { signal });

    // Animation Render Loop
    const loop = () => {
      if (game.type === 'rune_coder') view.renderRuneCoder(game);
      else if (game.type === 'crystal_reflector') view.renderCrystalReflector(game);
      else if (game.type === 'dungeon_relic') view.renderDungeonRelic(game);

      if (game.status === 'won') {
        // Draw victory banner
        const ctx = view.ctx;
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 28px "Noto Sans Thai", Tahoma, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('🏆 ภารกิจสำเร็จ! ยอดเยี่ยมมาก', canvas.width / 2, canvas.height / 2 - 20);

        ctx.fillStyle = '#e2e8f0';
        ctx.font = '15px "Noto Sans Thai", Tahoma, sans-serif';
        ctx.fillText('กด [ Spacebar ] หรือคลิกปุ่ม ✕ เพื่อกลับบทเรียน', canvas.width / 2, canvas.height / 2 + 20);
        ctx.restore();
      }

      this.animationFrameId = requestAnimationFrame(loop);
    };

    this.animationFrameId = requestAnimationFrame(loop);
  },

  dispose() {
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
