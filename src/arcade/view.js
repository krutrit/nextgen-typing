// src/arcade/view.js - MMORPG Retro Canvas View Renderer
// Renders fantasy RPG dungeon tiles, hero adventurer, runes, lasers, and relic chests

class ArcadeView {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.time = 0;
  }

  resize(width, height) {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  clear() {
    this.ctx.fillStyle = '#0f111a';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  // Safe rounded rect supporting older browsers/environments without ctx.roundRect
  drawRoundedRect(x, y, w, h, r = 6) {
    const ctx = this.ctx;
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(x, y, w, h, r);
    } else {
      ctx.rect(x, y, w, h);
    }
  }

  // Draw MMORPG Stone Dungeon Grid
  drawDungeonFloor(gridW, gridH, tileSize, offsetX, offsetY) {
    const ctx = this.ctx;
    for (let y = 0; y < gridH; y++) {
      for (let x = 0; x < gridW; x++) {
        const px = offsetX + x * tileSize;
        const py = offsetY + y * tileSize;

        // Checkerboard stone tiles
        ctx.fillStyle = (x + y) % 2 === 0 ? '#1e2238' : '#191c2e';
        ctx.fillRect(px, py, tileSize, tileSize);

        // Stone tile borders
        ctx.strokeStyle = '#2d3352';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 0.5, py + 0.5, tileSize - 1, tileSize - 1);

        // Subtle floor cracks / details
        if ((x * 7 + y * 13) % 5 === 0) {
          ctx.fillStyle = '#141624';
          ctx.fillRect(px + tileSize * 0.3, py + tileSize * 0.4, 3, 2);
        }
      }
    }
  }

  // Draw Hero Adventurer (Knight/Mage sprite)
  drawHero(x, y, dir, tileSize, offsetX, offsetY) {
    const ctx = this.ctx;
    const px = offsetX + x * tileSize + tileSize / 2;
    const py = offsetY + y * tileSize + tileSize / 2;
    const radius = tileSize * 0.38;

    ctx.save();
    ctx.translate(px, py);

    // Hero shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    if (typeof ctx.ellipse === 'function') {
      ctx.ellipse(0, radius * 0.8, radius * 0.9, radius * 0.4, 0, 0, Math.PI * 2);
    } else {
      ctx.arc(0, radius * 0.8, radius * 0.6, 0, Math.PI * 2);
    }
    ctx.fill();

    // Body (Armor plate)
    ctx.fillStyle = '#4f46e5';
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#a5b4fc';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Golden Knight Crest
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(0, -radius * 0.2, radius * 0.35, 0, Math.PI * 2);
    ctx.fill();

    // Visor / Eyes based on facing direction
    ctx.fillStyle = '#0f172a';
    if (dir === 'right') {
      ctx.fillRect(radius * 0.2, -radius * 0.3, 5, 4);
    } else if (dir === 'left') {
      ctx.fillRect(-radius * 0.5, -radius * 0.3, 5, 4);
    } else if (dir === 'up') {
      // Facing away
      ctx.fillStyle = '#6366f1';
      ctx.fillRect(-4, -radius * 0.6, 8, 5);
    } else {
      // Facing down
      ctx.fillRect(-6, -radius * 0.2, 4, 4);
      ctx.fillRect(2, -radius * 0.2, 4, 4);
    }

    ctx.restore();
  }

  // Draw Runic Spell Plate / Character Block
  drawRuneBlock(x, y, char, tileSize, offsetX, offsetY, isLocked = false, color = '#38bdf8') {
    const ctx = this.ctx;
    const px = offsetX + x * tileSize + 4;
    const py = offsetY + y * tileSize + 4;
    const size = tileSize - 8;

    ctx.save();
    // Rune stone background
    ctx.fillStyle = isLocked ? '#334155' : '#1e1b4b';
    ctx.strokeStyle = isLocked ? '#ef4444' : color;
    ctx.lineWidth = 2;

    // Glowing aura if unlocked
    if (!isLocked) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
    }

    ctx.beginPath();
    this.drawRoundedRect(px, py, size, size, 8);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Lesson Character label
    ctx.fillStyle = isLocked ? '#94a3b8' : '#ffffff';
    ctx.font = `bold ${Math.round(size * 0.55)}px "Noto Sans Thai", Tahoma, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(char, px + size / 2, py + size / 2 + 1);

    // Lock icon badge if locked
    if (isLocked) {
      ctx.font = '12px sans-serif';
      ctx.fillText('🔒', px + size - 10, py + 12);
    }

    ctx.restore();
  }

  // -----------------------------------------------------------
  // Scene Renderer: Game 1 - Rune Coder (Scratch-Style Queue)
  // -----------------------------------------------------------
  renderRuneCoder(game) {
    this.clear();
    const ctx = this.ctx;
    const tileSize = 64;
    const offsetX = Math.floor((this.canvas.width - game.width * tileSize) / 2);
    const offsetY = 50;

    // Floor
    this.drawDungeonFloor(game.width, game.height, tileSize, offsetX, offsetY);

    // Walls
    game.walls.forEach(w => {
      const [wx, wy] = w.split(',').map(Number);
      const px = offsetX + wx * tileSize;
      const py = offsetY + wy * tileSize;
      ctx.fillStyle = '#334155';
      ctx.fillRect(px + 2, py + 2, tileSize - 4, tileSize - 4);
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 2, py + 2, tileSize - 4, tileSize - 4);
      ctx.fillStyle = '#1e293b';
      ctx.fillText('🧱', px + tileSize / 2, py + tileSize / 2 + 4);
    });

    // Rune Barrier Gate
    this.drawRuneBlock(game.gate.x, game.gate.y, game.gate.char, tileSize, offsetX, offsetY, !game.gate.unlocked, '#ec4899');

    // Goal Portal
    const gpx = offsetX + game.goal.x * tileSize + tileSize / 2;
    const gpy = offsetY + game.goal.y * tileSize + tileSize / 2;
    ctx.save();
    ctx.fillStyle = '#10b981';
    ctx.shadowColor = '#34d399';
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.arc(gpx, gpy, tileSize * 0.38, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '24px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🏁', gpx, gpy);
    ctx.restore();

    // Hero
    this.drawHero(game.hero.x, game.hero.y, game.hero.dir, tileSize, offsetX, offsetY);

    // HUD: Command Queue Bar (Bottom)
    this.renderCommandQueueHUD(game.queue, game.targetChar, game.status);
  }

  renderCommandQueueHUD(queue, targetChar, status) {
    const ctx = this.ctx;
    const hudY = this.canvas.height - 95;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, hudY, this.canvas.width, 95);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, hudY);
    ctx.lineTo(this.canvas.width, hudY);
    ctx.stroke();

    // Title / Instructions
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 13px "Noto Sans Thai", Tahoma, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`คำสั่ง: [ลูกศร] วางแผนเดิน | [พิมพ์ '${targetChar}'] ปลดสลักรูน | [Spacebar] รันโปรแกรม 🚀`, 16, hudY + 22);

    // Queue slots
    const slotStartX = 16;
    const slotY = hudY + 34;
    const slotSize = 48;

    for (let i = 0; i < Math.max(10, queue.length); i++) {
      const sx = slotStartX + i * (slotSize + 8);
      if (sx + slotSize > this.canvas.width - 16) break;

      ctx.fillStyle = '#1e293b';
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1;
      ctx.beginPath();
      this.drawRoundedRect(sx, slotY, slotSize, slotSize, 6);
      ctx.fill();
      ctx.stroke();

      if (i < queue.length) {
        const item = queue[i];
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 20px "Noto Sans Thai", Tahoma, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (item.type === 'move') {
          const icon = item.cmd === 'forward' ? '⬆' : item.cmd === 'backward' ? '⬇' : item.cmd === 'left' ? '⬅' : '➡';
          ctx.fillStyle = '#60a5fa';
          ctx.fillText(icon, sx + slotSize / 2, slotY + slotSize / 2);
        } else if (item.type === 'char') {
          ctx.fillStyle = '#f472b6';
          ctx.fillText(item.char, sx + slotSize / 2, slotY + slotSize / 2);
        }
      }
    }
  }

  // -----------------------------------------------------------
  // Scene Renderer: Game 2 - Crystal Reflector (Optics)
  // -----------------------------------------------------------
  renderCrystalReflector(game) {
    this.clear();
    const ctx = this.ctx;
    const tileSize = 64;
    const offsetX = Math.floor((this.canvas.width - game.width * tileSize) / 2);
    const offsetY = 50;

    // Floor
    this.drawDungeonFloor(game.width, game.height, tileSize, offsetX, offsetY);

    // Laser Emitter
    const lex = offsetX + game.laser.x * tileSize + tileSize / 2;
    const ley = offsetY + game.laser.y * tileSize + tileSize / 2;
    ctx.fillStyle = '#ef4444';
    ctx.shadowColor = '#f87171';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(lex, ley, tileSize * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🔴', lex, ley);

    // Obelisk
    this.drawRuneBlock(game.obelisk.x, game.obelisk.y, game.obelisk.char, tileSize, offsetX, offsetY, !game.isEnergized, '#a855f7');

    // Mirrors
    game.mirrors.forEach(m => {
      const mx = offsetX + m.x * tileSize + tileSize / 2;
      const my = offsetY + m.y * tileSize + tileSize / 2;
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate((m.angle * Math.PI) / 180);

      // Prism stand
      ctx.fillStyle = '#38bdf8';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-tileSize * 0.35, -tileSize * 0.35);
      ctx.lineTo(tileSize * 0.35, tileSize * 0.35);
      ctx.stroke();

      // Mirror reflection surface
      ctx.fillStyle = '#e0f2fe';
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // Beam Path
    const beam = game.traceBeam();
    if (beam.path.length > 1) {
      ctx.save();
      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = 4;
      ctx.shadowColor = '#fb7185';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      for (let i = 0; i < beam.path.length; i++) {
        const bx = offsetX + beam.path[i].x * tileSize + tileSize / 2;
        const by = offsetY + beam.path[i].y * tileSize + tileSize / 2;
        if (i === 0) ctx.moveTo(bx, by);
        else ctx.lineTo(bx, by);
      }
      ctx.stroke();
      ctx.restore();
    }

    // Hero
    this.drawHero(game.hero.x, game.hero.y, 'down', tileSize, offsetX, offsetY);

    // Guide HUD
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 13px "Noto Sans Thai", Tahoma, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`[ลูกศร] เดิน | [Spacebar หน้ากระจก] หมุนมุมกระจก | [พิมพ์ '${game.obelisk.char}'] เมื่อแสงโดนเสาเพื่อปลดผนึก!`, this.canvas.width / 2, this.canvas.height - 25);
  }

  // -----------------------------------------------------------
  // Scene Renderer: Game 3 - Dungeon Relic (Sokoban)
  // -----------------------------------------------------------
  renderDungeonRelic(game) {
    this.clear();
    const ctx = this.ctx;
    const tileSize = 56;
    const offsetX = Math.floor((this.canvas.width - game.width * tileSize) / 2);
    const offsetY = 50;

    // Floor
    this.drawDungeonFloor(game.width, game.height, tileSize, offsetX, offsetY);

    // Walls
    game.walls.forEach(w => {
      const [wx, wy] = w.split(',').map(Number);
      const px = offsetX + wx * tileSize;
      const py = offsetY + wy * tileSize;
      ctx.fillStyle = '#334155';
      ctx.fillRect(px + 1, py + 1, tileSize - 2, tileSize - 2);
    });

    // Targets (Magic Circles)
    game.targets.forEach(t => {
      const tx = offsetX + t.x * tileSize + tileSize / 2;
      const ty = offsetY + t.y * tileSize + tileSize / 2;
      ctx.save();
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(tx, ty, tileSize * 0.4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#fef3c7';
      ctx.font = `bold ${Math.round(tileSize * 0.4)}px "Noto Sans Thai", Tahoma, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t.char, tx, ty);
      ctx.restore();
    });

    // Relic Chests
    game.chests.forEach(c => {
      this.drawRuneBlock(c.x, c.y, c.char, tileSize, offsetX, offsetY, c.locked, '#f59e0b');
    });

    // Hero
    this.drawHero(game.hero.x, game.hero.y, 'down', tileSize, offsetX, offsetY);

    // Guide HUD
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 13px "Noto Sans Thai", Tahoma, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`[ลูกศร] เดินและผลักหีบ | [พิมพ์อักษรบนหีบ] ปลดโซ่ตรวน | [Spacebar] ย้อนกลับ 1 ก้าว`, this.canvas.width / 2, this.canvas.height - 25);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ArcadeView;
}
if (typeof window !== 'undefined') {
  window.ArcadeView = ArcadeView;
}
