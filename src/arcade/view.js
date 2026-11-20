// src/arcade/view.js - Top-Down 2.5D Oblique Diorama Renderer
// Features 3 fantasy biomes (Elven Glade, Astral Crystal Spire, Ancient Sun Temple),
// Y-depth sorting, smooth tweening, dynamic lighting, and particle effects.

class ArcadeView {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.logicalW = canvas.width || 800;
    this.logicalH = canvas.height || 560;
    this.time = 0;

    // Smooth visual interpolation state
    this.heroVisual = null;
    this.chestVisuals = new Map();
    this.mirrorVisuals = new Map();
    this.lastGameId = null;

    // Juice: Particles, rings, floating popups, screen shake
    this.particles = [];
    this.rings = [];
    this.popups = [];
    this.ambientMotes = [];
    this.shakeTime = 0;
    this.shakeMag = 0;

    // Layout cache (for bridge to convert grid coords to screen coords for particles)
    this.lastLayout = { tileW: 64, tileH: 54, offsetX: 160, offsetY: 90 };

    // Playback highlight state for Rune Coder
    this.activeStepIndex = -1;
    this.statusBanner = null;

    this.initAmbientMotes();
  }

  initAmbientMotes() {
    this.ambientMotes = [];
    for (let i = 0; i < 28; i++) {
      this.ambientMotes.push({
        x: Math.random() * 800,
        y: Math.random() * 560,
        r: 1.2 + Math.random() * 2.4,
        vx: (Math.random() - 0.5) * 0.35,
        vy: -0.15 - Math.random() * 0.45,
        phase: Math.random() * Math.PI * 2
      });
    }
  }

  resize(width, height, dpr = 1) {
    this.logicalW = width;
    this.logicalH = height;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    if (this.ctx && typeof this.ctx.setTransform === 'function') {
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  resetVisuals() {
    this.heroVisual = null;
    this.chestVisuals.clear();
    this.mirrorVisuals.clear();
    this.activeStepIndex = -1;
    this.statusBanner = null;
  }

  triggerShake(magnitude = 7, duration = 14) {
    this.shakeMag = magnitude;
    this.shakeTime = duration;
  }

  gridToScreen(gx, gy) {
    const { tileW, tileH, offsetX, offsetY } = this.lastLayout;
    return {
      x: offsetX + gx * tileW + tileW / 2,
      y: offsetY + gy * tileH + tileH / 2
    };
  }

  spawnBurst(x, y, color = '#fbbf24', count = 14, speed = 3.2) {
    for (let i = 0; i < count; i++) {
      const ang = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
      const spd = speed * (0.45 + Math.random() * 0.85);
      this.particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 1.2,
        gravity: 0.08,
        r: 2.2 + Math.random() * 3.2,
        color,
        life: 1.0,
        decay: 0.022 + Math.random() * 0.02
      });
    }
  }

  spawnRing(x, y, color = '#38bdf8', maxRadius = 46) {
    this.rings.push({
      x,
      y,
      color,
      radius: 6,
      maxRadius,
      life: 1.0
    });
  }

  spawnPopup(x, y, text, color = '#fde047') {
    this.popups.push({
      x,
      y,
      text,
      color,
      life: 1.0,
      vy: -0.9
    });
  }

  spawnVictoryConfetti() {
    const colors = ['#fbbf24', '#34d399', '#38bdf8', '#f472b6', '#c084fc'];
    for (let i = 0; i < 42; i++) {
      this.particles.push({
        x: this.logicalW * (0.15 + Math.random() * 0.7),
        y: this.logicalH * 0.25 + (Math.random() - 0.5) * 40,
        vx: (Math.random() - 0.5) * 4.5,
        vy: -2.5 - Math.random() * 3.5,
        gravity: 0.1,
        r: 3 + Math.random() * 3.5,
        color: colors[i % colors.length],
        life: 1.4,
        decay: 0.012 + Math.random() * 0.01
      });
    }
  }

  // Safe Canvas 2D Helpers
  drawRoundedRect(x, y, w, h, r = 6) {
    const ctx = this.ctx;
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(x, y, w, h, r);
    } else {
      ctx.rect(x, y, w, h);
    }
  }

  drawEllipse(x, y, rx, ry) {
    const ctx = this.ctx;
    if (typeof ctx.ellipse === 'function') {
      ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    } else {
      ctx.arc(x, y, Math.max(rx, ry) * 0.75, 0, Math.PI * 2);
    }
  }

  computeBoardLayout(gridW, gridH, bottomReserve = 96, topReserve = 52) {
    const availW = this.logicalW - 76;
    const availH = this.logicalH - bottomReserve - topReserve;
    const tileW = Math.min(82, Math.floor(availW / gridW), Math.floor(availH / (gridH * 0.84)));
    const tileH = Math.round(tileW * 0.84);
    const boardW = gridW * tileW;
    const boardH = gridH * tileH;
    const offsetX = Math.floor((this.logicalW - boardW) / 2);
    const offsetY = Math.floor(topReserve + (availH - boardH) / 2);
    this.lastLayout = { tileW, tileH, offsetX, offsetY, boardW, boardH };
    return this.lastLayout;
  }

  // Smoothly update hero & entity tweens
  syncHeroTween(game) {
    if (!this.heroVisual || Math.abs(this.heroVisual.x - game.hero.x) > 2.5 || Math.abs(this.heroVisual.y - game.hero.y) > 2.5) {
      this.heroVisual = { x: game.hero.x, y: game.hero.y, hop: 0 };
      return this.heroVisual;
    }
    const dx = game.hero.x - this.heroVisual.x;
    const dy = game.hero.y - this.heroVisual.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 0.02) {
      this.heroVisual.x += dx * 0.28;
      this.heroVisual.y += dy * 0.28;
      this.heroVisual.hop = Math.min(1, dist) * 12;
    } else {
      this.heroVisual.x = game.hero.x;
      this.heroVisual.y = game.hero.y;
      this.heroVisual.hop = 0;
    }
    return this.heroVisual;
  }

  // -----------------------------------------------------------
  // Atmospheric Biome Backdrops & Floating 2.5D Diorama Island
  // -----------------------------------------------------------
  drawBiomeBackdrop(biome) {
    const ctx = this.ctx;
    const w = this.logicalW;
    const h = this.logicalH;

    let topColor = '#071b1a';
    let botColor = '#102e2b';
    let moteColor = 'rgba(253, 224, 71, 0.75)';

    if (biome === 'crystal_spire') {
      topColor = '#090a1f';
      botColor = '#1e1648';
      moteColor = 'rgba(192, 132, 252, 0.85)';
    } else if (biome === 'sun_temple') {
      topColor = '#1a0e08';
      botColor = '#331a0d';
      moteColor = 'rgba(251, 146, 60, 0.85)';
    }

    if (typeof ctx.createLinearGradient === 'function') {
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, topColor);
      grad.addColorStop(1, botColor);
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = topColor;
    }
    ctx.fillRect(0, 0, w, h);

    // Subtle atmospheric radial spotlight behind diorama
    if (typeof ctx.createRadialGradient === 'function') {
      const rad = ctx.createRadialGradient(w / 2, h * 0.42, 30, w / 2, h * 0.42, w * 0.55);
      if (biome === 'elven_glade') {
        rad.addColorStop(0, 'rgba(16, 185, 129, 0.16)');
      } else if (biome === 'crystal_spire') {
        rad.addColorStop(0, 'rgba(139, 92, 246, 0.22)');
      } else {
        rad.addColorStop(0, 'rgba(245, 158, 11, 0.18)');
      }
      rad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = rad;
      ctx.fillRect(0, 0, w, h);
    }

    // Animated ambient motes (fireflies / stardust / embers)
    ctx.save();
    for (const m of this.ambientMotes) {
      m.x = (m.x + m.vx + w) % w;
      m.y = (m.y + m.vy + h) % h;
      const pulse = 0.45 + 0.55 * Math.sin(this.time * 0.05 + m.phase);
      ctx.globalAlpha = pulse * 0.8;
      ctx.fillStyle = moteColor;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawDioramaIsland(gridW, gridH, layout, biome) {
    const ctx = this.ctx;
    const { tileW, tileH, offsetX, offsetY, boardW, boardH } = layout;
    const cliffH = 22;

    const palettes = {
      elven_glade: {
        cliffTop: '#365314',
        cliffFace: '#3f2e21',
        cliffShade: '#281d15',
        tileA: '#22543d',
        tileB: '#1d4734',
        tileBorder: 'rgba(134, 239, 172, 0.16)',
        rim: '#4ade80'
      },
      crystal_spire: {
        cliffTop: '#312e81',
        cliffFace: '#1e1b4b',
        cliffShade: '#120f31',
        tileA: '#28265c',
        tileB: '#211f4f',
        tileBorder: 'rgba(196, 181, 253, 0.18)',
        rim: '#a78bfa'
      },
      sun_temple: {
        cliffTop: '#78350f',
        cliffFace: '#451a03',
        cliffShade: '#290f02',
        tileA: '#573620',
        tileB: '#4c2e1b',
        tileBorder: 'rgba(253, 186, 116, 0.16)',
        rim: '#f59e0b'
      }
    };
    const p = palettes[biome] || palettes.elven_glade;

    // Floating drop shadow beneath the entire diorama island
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.48)';
    ctx.beginPath();
    this.drawRoundedRect(offsetX + 6, offsetY + cliffH + 10, boardW - 4, boardH + 4, 14);
    ctx.fill();

    // Extruded 2.5D island cliff body
    ctx.fillStyle = p.cliffFace;
    ctx.beginPath();
    this.drawRoundedRect(offsetX - 6, offsetY + 6, boardW + 12, boardH + cliffH, 12);
    ctx.fill();

    // Lower cliff stratification shade
    ctx.fillStyle = p.cliffShade;
    ctx.fillRect(offsetX - 4, offsetY + boardH + 10, boardW + 8, cliffH - 6);

    // Subtle stone grooves on cliff front
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1.5;
    for (let x = 1; x < gridW; x++) {
      const gx = offsetX + x * tileW;
      ctx.beginPath();
      ctx.moveTo(gx, offsetY + boardH + 2);
      ctx.lineTo(gx, offsetY + boardH + cliffH + 4);
      ctx.stroke();
    }

    // Island top outer bezel
    ctx.fillStyle = p.cliffTop;
    ctx.beginPath();
    this.drawRoundedRect(offsetX - 6, offsetY - 6, boardW + 12, boardH + 12, 10);
    ctx.fill();

    // Floor tiles with 2.5D bevel & subtle biome texture
    for (let y = 0; y < gridH; y++) {
      for (let x = 0; x < gridW; x++) {
        const px = offsetX + x * tileW;
        const py = offsetY + y * tileH;
        const isEven = (x + y) % 2 === 0;

        ctx.fillStyle = isEven ? p.tileA : p.tileB;
        ctx.fillRect(px, py, tileW, tileH);

        // Top-left inner highlight bevel
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.fillRect(px, py, tileW, 2);
        ctx.fillRect(px, py, 2, tileH);

        // Subtle grid border
        ctx.strokeStyle = p.tileBorder;
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 0.5, py + 0.5, tileW - 1, tileH - 1);

        // Biome tile details
        const hash = (x * 17 + y * 31) % 7;
        if (biome === 'elven_glade' && hash === 0) {
          ctx.fillStyle = 'rgba(74, 222, 128, 0.22)';
          ctx.fillRect(px + tileW * 0.2, py + tileH * 0.3, 4, 3);
          ctx.fillRect(px + tileW * 0.28, py + tileH * 0.25, 3, 4);
        } else if (biome === 'crystal_spire' && hash === 1) {
          ctx.strokeStyle = 'rgba(251, 191, 36, 0.14)';
          ctx.beginPath();
          ctx.moveTo(px + 8, py + tileH / 2);
          ctx.lineTo(px + tileW / 2, py + 8);
          ctx.lineTo(px + tileW - 8, py + tileH / 2);
          ctx.lineTo(px + tileW / 2, py + tileH - 8);
          ctx.closePath();
          ctx.stroke();
        } else if (biome === 'sun_temple' && hash === 2) {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
          ctx.fillRect(px + tileW * 0.25, py + tileH * 0.55, 10, 2);
          ctx.fillRect(px + tileW * 0.45, py + tileH * 0.3, 6, 2);
        }
      }
    }

    // Crisp illuminated front rim edge
    ctx.strokeStyle = p.rim;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 2;
    ctx.beginPath();
    this.drawRoundedRect(offsetX - 5, offsetY - 5, boardW + 10, boardH + 10, 10);
    ctx.stroke();
    ctx.restore();
  }

  // -----------------------------------------------------------
  // 2.5D Extruded Entities & Chibi MMORPG Heroes
  // -----------------------------------------------------------
  drawElvenTree(x, y, layout) {
    const ctx = this.ctx;
    const { tileW, tileH, offsetX, offsetY } = layout;
    const cx = offsetX + x * tileW + tileW / 2;
    const cy = offsetY + y * tileH + tileH * 0.6;
    const sway = Math.sin(this.time * 0.04 + x * 1.3 + y * 0.9) * 2.2;

    ctx.save();
    // Cast shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.34)';
    ctx.beginPath();
    this.drawEllipse(cx + 5, cy + 8, tileW * 0.36, tileH * 0.22);
    ctx.fill();

    // 2.5D Trunk
    ctx.fillStyle = '#5c3a21';
    ctx.fillRect(cx - 7, cy - 16, 14, 22);
    ctx.fillStyle = '#7c4f2d';
    ctx.fillRect(cx - 7, cy - 16, 5, 22);

    // Layered lush canopies (back -> mid -> highlight)
    const r = tileW * 0.36;
    ctx.fillStyle = '#14532d';
    ctx.beginPath();
    ctx.arc(cx + sway * 0.5, cy - 18, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#16a34a';
    ctx.beginPath();
    ctx.arc(cx - 4 + sway * 0.8, cy - 26, r * 0.85, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#4ade80';
    ctx.beginPath();
    ctx.arc(cx - 8 + sway, cy - 32, r * 0.48, 0, Math.PI * 2);
    ctx.fill();

    // Tiny golden forest berry / blossom accent
    if ((x + y) % 2 === 0) {
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.arc(cx + 6 + sway, cy - 24, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawCrystalSpireWall(x, y, layout) {
    const ctx = this.ctx;
    const { tileW, tileH, offsetX, offsetY } = layout;
    const cx = offsetX + x * tileW + tileW / 2;
    const baseY = offsetY + y * tileH + tileH * 0.72;
    const shimmer = 0.65 + 0.35 * Math.sin(this.time * 0.06 + x * 2 + y);

    ctx.save();
    // Cast shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
    ctx.beginPath();
    this.drawEllipse(cx + 4, baseY + 4, tileW * 0.32, tileH * 0.18);
    ctx.fill();

    // Stone pedestal base
    ctx.fillStyle = '#312e81';
    ctx.beginPath();
    this.drawEllipse(cx, baseY, tileW * 0.3, tileH * 0.16);
    ctx.fill();

    // Faceted Amethyst Crystal Main Shard
    ctx.fillStyle = '#7c3aed';
    ctx.beginPath();
    ctx.moveTo(cx, baseY - 46);
    ctx.lineTo(cx + 15, baseY - 12);
    ctx.lineTo(cx + 8, baseY + 2);
    ctx.lineTo(cx - 10, baseY + 2);
    ctx.lineTo(cx - 14, baseY - 14);
    ctx.closePath();
    ctx.fill();

    // Bright left crystal facet
    ctx.fillStyle = '#c084fc';
    ctx.beginPath();
    ctx.moveTo(cx, baseY - 46);
    ctx.lineTo(cx - 14, baseY - 14);
    ctx.lineTo(cx - 2, baseY + 2);
    ctx.closePath();
    ctx.fill();

    // Side mini crystal shard
    ctx.fillStyle = '#a855f7';
    ctx.beginPath();
    ctx.moveTo(cx + 16, baseY - 26);
    ctx.lineTo(cx + 22, baseY - 4);
    ctx.lineTo(cx + 9, baseY + 1);
    ctx.closePath();
    ctx.fill();

    // Specular sparkle tip
    ctx.fillStyle = `rgba(255, 255, 255, ${shimmer})`;
    ctx.beginPath();
    ctx.arc(cx - 2, baseY - 36, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawTempleWall(x, y, layout, hasTorch = false) {
    const ctx = this.ctx;
    const { tileW, tileH, offsetX, offsetY } = layout;
    const px = offsetX + x * tileW;
    const py = offsetY + y * tileH;
    const extrude = 20;

    ctx.save();
    // Cast shadow onto lower tile
    ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
    ctx.fillRect(px + 4, py + tileH, tileW, 8);

    // Front 2.5D vertical stone face
    ctx.fillStyle = '#6b4226';
    ctx.fillRect(px + 1, py + tileH - extrude, tileW - 2, extrude);
    ctx.strokeStyle = '#3d2211';
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 1, py + tileH - extrude, tileW - 2, extrude);

    // Brick seams on front face
    ctx.beginPath();
    ctx.moveTo(px + tileW / 2, py + tileH - extrude);
    ctx.lineTo(px + tileW / 2, py + tileH);
    ctx.stroke();

    // Top 2.5D sandstone cap (raised up by extrude)
    ctx.fillStyle = '#9a6338';
    ctx.fillRect(px + 1, py - extrude + 4, tileW - 2, tileH - 4);
    ctx.strokeStyle = '#c28450';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(px + 2, py - extrude + 5, tileW - 4, tileH - 6);

    // Subtle carved temple square on top
    ctx.strokeStyle = 'rgba(69, 26, 3, 0.35)';
    ctx.strokeRect(px + 8, py - extrude + 10, tileW - 16, tileH - 16);

    // Optional flickering temple torch on wall top
    if (hasTorch) {
      const tx = px + tileW / 2;
      const ty = py - extrude + tileH / 2;
      const flicker = 0.8 + 0.2 * Math.sin(this.time * 0.25 + x * 3);

      // Warm torch light glow
      if (typeof ctx.createRadialGradient === 'function') {
        const glow = ctx.createRadialGradient(tx, ty, 2, tx, ty, tileW * 0.85);
        glow.addColorStop(0, `rgba(251, 146, 60, ${0.42 * flicker})`);
        glow.addColorStop(1, 'rgba(251, 146, 60, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(tx, ty, tileW * 0.85, 0, Math.PI * 2);
        ctx.fill();
      }

      // Brazier bowl
      ctx.fillStyle = '#b45309';
      ctx.beginPath();
      this.drawEllipse(tx, ty + 4, 9, 5);
      ctx.fill();

      // Flame
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.arc(tx, ty - 2, 7 * flicker, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(tx, ty - 3, 3.8 * flicker, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Draw floating RPG Keycap Badge above interactive rune objects
  drawFloatingKeyBadge(cx, topY, char, accentColor = '#ec4899', pulsePrompt = false) {
    const ctx = this.ctx;
    const bob = Math.sin(this.time * 0.08) * 3.5;
    const y = topY + bob;
    const size = 28;

    ctx.save();
    if (pulsePrompt) {
      const glowR = 20 + Math.sin(this.time * 0.14) * 5;
      ctx.fillStyle = accentColor;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.arc(cx, y, glowR, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // 2.5D keycap depth
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    this.drawRoundedRect(cx - size / 2, y - size / 2 + 3, size, size, 7);
    ctx.fill();

    // Keycap top surface
    ctx.fillStyle = '#1e1b4b';
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    this.drawRoundedRect(cx - size / 2, y - size / 2, size, size, 7);
    ctx.fill();
    ctx.stroke();

    // Lesson character text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px "Sarabun", "Noto Sans Thai", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(char, cx, y + 1);
    ctx.restore();
  }

  // 2.5D Rune Gate (Elven Glade)
  drawRuneGate(gate, layout) {
    const ctx = this.ctx;
    const { tileW, tileH, offsetX, offsetY } = layout;
    const px = offsetX + gate.x * tileW;
    const py = offsetY + gate.y * tileH;
    const cx = px + tileW / 2;
    const cy = py + tileH / 2;

    ctx.save();
    if (gate.unlocked) {
      // Unlocked: glowing emerald floor runes + parted stone pillars
      ctx.strokeStyle = 'rgba(52, 211, 153, 0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      this.drawEllipse(cx, cy, tileW * 0.35, tileH * 0.25);
      ctx.stroke();

      // Parted side stones
      ctx.fillStyle = '#64748b';
      ctx.fillRect(px + 3, py - 8, 10, 26);
      ctx.fillRect(px + tileW - 13, py - 8, 10, 26);
      ctx.fillStyle = '#34d399';
      ctx.fillRect(px + 5, py - 5, 6, 4);
      ctx.fillRect(px + tileW - 11, py - 5, 6, 4);
      ctx.restore();
      return;
    }

    // Locked 2.5D Stone Gate + Shimmering Pink-Gold Magic Barrier
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(px + 4, py + tileH - 4, tileW - 8, 8);

    // Left & Right Stone Pillars
    ctx.fillStyle = '#475569';
    ctx.fillRect(px + 4, py - 18, 13, tileH + 14);
    ctx.fillRect(px + tileW - 17, py - 18, 13, tileH + 14);
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(px + 4, py - 18, 13, 8);
    ctx.fillRect(px + tileW - 17, py - 18, 13, 8);

    // Energy Field Barrier
    const pulse = 0.65 + 0.25 * Math.sin(this.time * 0.1);
    ctx.fillStyle = `rgba(236, 72, 153, ${0.42 * pulse})`;
    ctx.fillRect(px + 17, py - 10, tileW - 34, tileH + 4);
    ctx.strokeStyle = '#f472b6';
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 17, py - 10, tileW - 34, tileH + 4);

    // Floating lesson character badge
    this.drawFloatingKeyBadge(cx, py - 20, gate.char, '#f472b6', true);
    ctx.restore();
  }

  // 2.5D Warp Goal Portal (Elven Glade)
  drawWarpPortal(goal, layout) {
    const ctx = this.ctx;
    const { tileW, tileH, offsetX, offsetY } = layout;
    const cx = offsetX + goal.x * tileW + tileW / 2;
    const cy = offsetY + goal.y * tileH + tileH / 2;
    const spin = this.time * 0.05;

    ctx.save();
    // Glowing ground aura
    if (typeof ctx.createRadialGradient === 'function') {
      const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, tileW * 0.48);
      g.addColorStop(0, 'rgba(52, 211, 153, 0.85)');
      g.addColorStop(0.6, 'rgba(6, 182, 212, 0.35)');
      g.addColorStop(1, 'rgba(6, 182, 212, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, tileW * 0.48, 0, Math.PI * 2);
      ctx.fill();
    }

    // Outer rune ring
    ctx.strokeStyle = '#34d399';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    this.drawEllipse(cx, cy, tileW * 0.38, tileH * 0.28);
    ctx.stroke();

    // Orbiting light diamonds
    for (let i = 0; i < 4; i++) {
      const a = spin + (Math.PI * 2 * i) / 4;
      const ox = cx + Math.cos(a) * tileW * 0.32;
      const oy = cy + Math.sin(a) * tileH * 0.22 - 6;
      ctx.fillStyle = '#a7f3d0';
      ctx.beginPath();
      ctx.arc(ox, oy, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Rising center star
    const bob = Math.sin(this.time * 0.09) * 4;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✦', cx, cy - 10 + bob);
    ctx.restore();
  }

  // 2.5D Relic Chest (Ancient Sun Temple)
  drawRelicChest(chest, layout, isMatched = false) {
    const ctx = this.ctx;
    const { tileW, tileH, offsetX, offsetY } = layout;

    // Smooth visual slide tracking
    let vis = this.chestVisuals.get(chest.id);
    if (!vis || Math.abs(vis.x - chest.x) > 2 || Math.abs(vis.y - chest.y) > 2) {
      vis = { x: chest.x, y: chest.y };
      this.chestVisuals.set(chest.id, vis);
    } else {
      vis.x += (chest.x - vis.x) * 0.32;
      vis.y += (chest.y - vis.y) * 0.32;
    }

    const px = offsetX + vis.x * tileW + tileW * 0.12;
    const py = offsetY + vis.y * tileH + tileH * 0.08;
    const w = tileW * 0.76;
    const h = tileH * 0.74;
    const lift = 10;

    ctx.save();
    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    this.drawRoundedRect(px + 3, py + h - 4, w, 10, 4);
    ctx.fill();

    // Golden aura if placed on matching magic circle
    if (isMatched) {
      ctx.fillStyle = 'rgba(52, 211, 153, 0.35)';
      ctx.beginPath();
      this.drawRoundedRect(px - 6, py - lift - 6, w + 12, h + lift + 10, 10);
      ctx.fill();
    }

    // Chest Front Face (Extruded 2.5D wood)
    ctx.fillStyle = chest.locked ? '#57534e' : '#78350f';
    ctx.beginPath();
    this.drawRoundedRect(px, py + h * 0.35 - lift, w, h * 0.65 + lift, 5);
    ctx.fill();

    // Chest Arched Lid Top Face
    ctx.fillStyle = chest.locked ? '#78716c' : '#b45309';
    ctx.beginPath();
    this.drawRoundedRect(px, py - lift, w, h * 0.48, 6);
    ctx.fill();

    // Ornate Gold Trim Bands
    const trimColor = isMatched ? '#34d399' : (chest.locked ? '#94a3b8' : '#fbbf24');
    ctx.strokeStyle = trimColor;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    this.drawRoundedRect(px, py - lift, w, h + lift, 6);
    ctx.stroke();

    // Center gold clasp
    ctx.fillStyle = trimColor;
    ctx.fillRect(px + w / 2 - 5, py + h * 0.32 - lift, 10, 9);

    // Character inscribed on front face
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.round(tileW * 0.34)}px "Sarabun", "Noto Sans Thai", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(chest.char, px + w / 2, py + h * 0.68 - lift / 2);

    // Arcane crimson chains when locked
    if (chest.locked) {
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(px + 2, py - lift + 2);
      ctx.lineTo(px + w - 2, py + h - 2);
      ctx.moveTo(px + w - 2, py - lift + 2);
      ctx.lineTo(px + 2, py + h - 2);
      ctx.stroke();
      ctx.setLineDash([]);

      this.drawFloatingKeyBadge(px + w / 2, py - lift - 16, chest.char, '#ef4444', true);
    }

    ctx.restore();
  }

  // 2.5D Chibi MMORPG Hero (themed per biome)
  drawHero25D(vx, vy, hopZ, dir, layout, biome) {
    const ctx = this.ctx;
    const { tileW, tileH, offsetX, offsetY } = layout;
    const cx = offsetX + vx * tileW + tileW / 2;
    const groundY = offsetY + vy * tileH + tileH * 0.66;
    const idleBob = hopZ > 0.5 ? 0 : Math.sin(this.time * 0.1) * 1.8;
    const cy = groundY - hopZ - idleBob;

    const styles = {
      elven_glade: { cloak: '#059669', armor: '#e2e8f0', trim: '#fbbf24', crest: '#34d399', hat: 'knight' },
      crystal_spire: { cloak: '#4338ca', armor: '#312e81', trim: '#c084fc', crest: '#38bdf8', hat: 'wizard' },
      sun_temple: { cloak: '#dc2626', armor: '#f59e0b', trim: '#fef08a', crest: '#fbbf24', hat: 'paladin' }
    };
    const st = styles[biome] || styles.elven_glade;

    ctx.save();
    // Ground contact shadow (shrinks slightly during hop)
    const shadowScale = Math.max(0.65, 1 - hopZ * 0.025);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
    ctx.beginPath();
    this.drawEllipse(cx, groundY + 4, tileW * 0.27 * shadowScale, tileH * 0.15 * shadowScale);
    ctx.fill();

    // Fluttering Cloak behind hero
    const capeWave = Math.sin(this.time * 0.14) * 2.5;
    ctx.fillStyle = st.cloak;
    ctx.beginPath();
    ctx.moveTo(cx - 12, cy - 16);
    ctx.lineTo(cx + 12, cy - 16);
    ctx.lineTo(cx + 16 + capeWave, cy + 2);
    ctx.lineTo(cx - 16 + capeWave, cy + 2);
    ctx.closePath();
    ctx.fill();

    // Boots
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.arc(cx - 6, cy + 1, 4.5, 0, Math.PI * 2);
    ctx.arc(cx + 6, cy + 1, 4.5, 0, Math.PI * 2);
    ctx.fill();

    // Armored Torso
    ctx.fillStyle = st.armor;
    ctx.strokeStyle = st.trim;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    this.drawRoundedRect(cx - 11, cy - 18, 22, 18, 7);
    ctx.fill();
    ctx.stroke();

    // Head
    ctx.fillStyle = '#fde68a';
    ctx.beginPath();
    ctx.arc(cx, cy - 26, 12, 0, Math.PI * 2);
    ctx.fill();

    // Hat / Helmet
    if (st.hat === 'wizard') {
      // Pointed Starlight Wizard Hat
      ctx.fillStyle = '#3730a3';
      ctx.beginPath();
      this.drawEllipse(cx, cy - 33, 17, 5);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx - 12, cy - 33);
      ctx.lineTo(cx + 12, cy - 33);
      ctx.lineTo(cx + 2, cy - 53);
      ctx.closePath();
      ctx.fill();
      // Gold hat band
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(cx - 10, cy - 36, 20, 3);
    } else {
      // Knight / Paladin Helmet dome + plume
      ctx.fillStyle = st.hat === 'paladin' ? '#f59e0b' : '#cbd5e1';
      ctx.beginPath();
      ctx.arc(cx, cy - 29, 13, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = st.crest;
      ctx.beginPath();
      this.drawEllipse(cx, cy - 43, 5, 7);
      ctx.fill();
    }

    // Eyes based on direction
    ctx.fillStyle = '#0f172a';
    if (dir === 'right') {
      ctx.fillRect(cx + 3, cy - 28, 3.5, 4);
      ctx.fillRect(cx + 8, cy - 28, 3, 4);
    } else if (dir === 'left') {
      ctx.fillRect(cx - 6.5, cy - 28, 3.5, 4);
      ctx.fillRect(cx - 11, cy - 28, 3, 4);
    } else if (dir !== 'up') {
      ctx.fillRect(cx - 5.5, cy - 27, 3.5, 4);
      ctx.fillRect(cx + 2.5, cy - 27, 3.5, 4);
    }

    // Tiny glowing weapon / staff on side
    const sideX = dir === 'left' ? cx - 15 : cx + 15;
    if (st.hat === 'wizard') {
      ctx.strokeStyle = '#92400e';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(sideX, cy - 2);
      ctx.lineTo(sideX, cy - 28);
      ctx.stroke();
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(sideX, cy - 30, 4.5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(sideX, cy - 4);
      ctx.lineTo(sideX + (dir === 'left' ? -4 : 4), cy - 22);
      ctx.stroke();
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(sideX - 3, cy - 8, 6, 3);
    }

    ctx.restore();
  }

  // -----------------------------------------------------------
  // Particles, Shockwave Rings & Floating Popups
  // -----------------------------------------------------------
  updateAndDrawFX() {
    const ctx = this.ctx;

    // Expanding magic rings
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.radius += (r.maxRadius - r.radius) * 0.16;
      r.life -= 0.045;
      if (r.life <= 0) {
        this.rings.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = r.life;
      ctx.lineWidth = 3 * r.life;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Sparkle & burst particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity;
      p.life -= p.decay;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.globalAlpha = Math.min(1, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * Math.min(1, p.life + 0.2), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Floating RPG text popups
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const pop = this.popups[i];
      pop.y += pop.vy;
      pop.life -= 0.022;
      if (pop.life <= 0) {
        this.popups.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.globalAlpha = Math.min(1, pop.life * 1.4);
      ctx.font = 'bold 15px "Sarabun", "Noto Sans Thai", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#0f172a';
      ctx.fillText(pop.text, pop.x + 1, pop.y + 1);
      ctx.fillStyle = pop.color;
      ctx.fillText(pop.text, pop.x, pop.y);
      ctx.restore();
    }
  }

  // -----------------------------------------------------------
  // Scene 1: Rune Coder (🌲 ป่าเอลฟ์โบราณ — Elven Glade)
  // -----------------------------------------------------------
  renderRuneCoder(game) {
    this.time++;
    const ctx = this.ctx;
    ctx.save();

    if (this.shakeTime > 0) {
      const sx = (Math.random() - 0.5) * this.shakeMag;
      const sy = (Math.random() - 0.5) * this.shakeMag;
      ctx.translate(sx, sy);
      this.shakeTime--;
    }

    this.drawBiomeBackdrop('elven_glade');
    const layout = this.computeBoardLayout(game.width, game.height, 112, 46);
    this.drawDioramaIsland(game.width, game.height, layout, 'elven_glade');

    // Decorative forest floor flowers/mushrooms
    if (game.decor) {
      game.decor.forEach(d => {
        const px = layout.offsetX + d.x * layout.tileW + layout.tileW * 0.5;
        const py = layout.offsetY + d.y * layout.tileH + layout.tileH * 0.55;
        ctx.fillStyle = d.kind === 'flower' ? '#f472b6' : d.kind === 'mushroom' ? '#fb7185' : '#94a3b8';
        ctx.beginPath();
        ctx.arc(px, py, d.kind === 'pebble' ? 3 : 4, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // Warp Portal on floor
    this.drawWarpPortal(game.goal, layout);

    // Sync smooth hero tween
    const hv = this.syncHeroTween(game);
    const gates = game.gates || (game.gate ? [game.gate] : []);

    // Y-Depth Sorted Draw List (Painter's Algorithm)
    const drawables = [];
    game.walls.forEach(w => {
      const [wx, wy] = w.split(',').map(Number);
      drawables.push({ sortY: wy, draw: () => this.drawElvenTree(wx, wy, layout) });
    });
    gates.forEach(g => {
      drawables.push({ sortY: g.y + 0.05, draw: () => this.drawRuneGate(g, layout) });
    });
    drawables.push({
      sortY: hv.y + 0.15,
      draw: () => this.drawHero25D(hv.x, hv.y, hv.hop, game.hero.dir, layout, 'elven_glade')
    });

    drawables.sort((a, b) => a.sortY - b.sortY);
    drawables.forEach(d => d.draw());

    this.updateAndDrawFX();

    // Bottom Scratch-style 2.5D Command Queue HUD
    const lockedChars = gates.filter(g => !g.unlocked).map(g => g.char);
    const promptChars = lockedChars.length ? lockedChars.join(', ') : game.targetChar;
    this.renderCommandQueueHUD(game.queue, promptChars, game.status);

    ctx.restore();
  }

  renderCommandQueueHUD(queue, targetChars, status) {
    const ctx = this.ctx;
    const hudH = 104;
    const hudY = this.logicalH - hudH;

    // Frosted RPG HUD tray
    ctx.fillStyle = 'rgba(10, 22, 24, 0.92)';
    ctx.fillRect(0, hudY, this.logicalW, hudH);
    ctx.strokeStyle = 'rgba(52, 211, 153, 0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, hudY);
    ctx.lineTo(this.logicalW, hudY);
    ctx.stroke();

    // Instruction header
    ctx.fillStyle = '#d1fae5';
    ctx.font = 'bold 13px "Sarabun", "Noto Sans Thai", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const statusText = status === 'failed'
      ? '⚠️ ชนสิ่งกีดขวางหรือยังไม่ได้ปลดรูน! กด [Spacebar] เพื่อแก้คำสั่งใหม่'
      : `⚔️ [ลูกศร ⬆⬇⬅➡] วางแผนเดิน • [พิมพ์ '${targetChars}'] ร่ายเวทปลดประตู • [Backspace] ลบ • [Spacebar] รันโปรแกรม 🚀`;
    ctx.fillStyle = status === 'failed' ? '#fca5a5' : '#d1fae5';
    ctx.fillText(statusText, 18, hudY + 24);

    // Scratch-like 2.5D Command Slots
    const slotSize = 46;
    const gap = 8;
    const slotStartX = 18;
    const slotY = hudY + 38;
    const visibleSlots = Math.min(14, Math.floor((this.logicalW - 36) / (slotSize + gap)));

    for (let i = 0; i < visibleSlots; i++) {
      const sx = slotStartX + i * (slotSize + gap);
      const isFilled = i < queue.length;
      const isActive = i === this.activeStepIndex;

      // Slot socket
      ctx.fillStyle = isActive ? '#065f46' : (isFilled ? '#1e293b' : 'rgba(30, 41, 59, 0.45)');
      ctx.strokeStyle = isActive ? '#34d399' : (isFilled ? '#475569' : 'rgba(71, 85, 105, 0.4)');
      ctx.lineWidth = isActive ? 2.5 : 1.5;
      ctx.beginPath();
      this.drawRoundedRect(sx, slotY, slotSize, slotSize, 8);
      ctx.fill();
      ctx.stroke();

      if (isFilled) {
        const item = queue[i];
        const isMove = item.type === 'move';
        const blockColor = isMove ? '#2563eb' : '#db2777';
        const blockShadow = isMove ? '#1e3a8a' : '#831843';

        // 2.5D raised Scratch block
        ctx.fillStyle = blockShadow;
        ctx.beginPath();
        this.drawRoundedRect(sx + 3, slotY + 6, slotSize - 6, slotSize - 8, 6);
        ctx.fill();

        ctx.fillStyle = isActive ? '#10b981' : blockColor;
        ctx.beginPath();
        this.drawRoundedRect(sx + 3, slotY + 3, slotSize - 6, slotSize - 9, 6);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 20px "Sarabun", "Noto Sans Thai", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (isMove) {
          const iconMap = {
            move_up: '⬆', move_down: '⬇', move_left: '⬅', move_right: '➡',
            forward: '⬆', backward: '⬇', left: '↩', right: '↪'
          };
          ctx.fillText(iconMap[item.cmd] || '⬆', sx + slotSize / 2, slotY + slotSize / 2 - 1);
        } else {
          ctx.fillText(item.char, sx + slotSize / 2, slotY + slotSize / 2 - 1);
        }
      }
    }
  }

  // -----------------------------------------------------------
  // Scene 2: Crystal Reflector (✨ หอคอยคริสตัลนภา — Astral Spire)
  // -----------------------------------------------------------
  renderCrystalReflector(game) {
    this.time++;
    const ctx = this.ctx;
    ctx.save();

    if (this.shakeTime > 0) {
      ctx.translate((Math.random() - 0.5) * this.shakeMag, (Math.random() - 0.5) * this.shakeMag);
      this.shakeTime--;
    }

    this.drawBiomeBackdrop('crystal_spire');
    const layout = this.computeBoardLayout(game.width, game.height, 76, 46);
    this.drawDioramaIsland(game.width, game.height, layout, 'crystal_spire');

    const hv = this.syncHeroTween(game);
    const beam = game.traceBeam();

    // Build Y-Depth Sorted Draw List
    const drawables = [];

    if (game.walls) {
      game.walls.forEach(w => {
        const [wx, wy] = w.split(',').map(Number);
        drawables.push({ sortY: wy, draw: () => this.drawCrystalSpireWall(wx, wy, layout) });
      });
    }

    // Laser Emitter Pedestal
    drawables.push({
      sortY: game.laser.y + 0.05,
      draw: () => this.drawLaserEmitter25D(game.laser, layout)
    });

    // Arcane Obelisk
    drawables.push({
      sortY: game.obelisk.y + 0.08,
      draw: () => this.drawArcaneObelisk25D(game.obelisk, layout, beam.hitsObelisk, game.isEnergized)
    });

    // 2.5D Rotating Sapphire Prism Mirrors
    game.mirrors.forEach((m, idx) => {
      const dist = Math.abs(game.hero.x - m.x) + Math.abs(game.hero.y - m.y);
      drawables.push({
        sortY: m.y + 0.06,
        draw: () => this.drawPrismMirror25D(m, idx, layout, dist <= 1)
      });
    });

    // Starlight Mage Hero
    drawables.push({
      sortY: hv.y + 0.15,
      draw: () => this.drawHero25D(hv.x, hv.y, hv.hop, game.hero.dir || 'down', layout, 'crystal_spire')
    });

    drawables.sort((a, b) => a.sortY - b.sortY);
    drawables.forEach(d => d.draw());

    // Draw Multi-Layer Glowing Optical Laser Beam on top
    this.drawOpticalBeam(beam, layout, game.isEnergized);

    this.updateAndDrawFX();

    // Bottom Guide Bar
    const hudY = this.logicalH - 58;
    ctx.fillStyle = 'rgba(15, 13, 40, 0.9)';
    ctx.fillRect(0, hudY, this.logicalW, 58);
    ctx.strokeStyle = 'rgba(167, 139, 250, 0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, hudY);
    ctx.lineTo(this.logicalW, hudY);
    ctx.stroke();

    ctx.font = 'bold 14px "Sarabun", "Noto Sans Thai", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (beam.hitsObelisk && !game.isEnergized) {
      ctx.fillStyle = '#fde047';
      ctx.fillText(`⚡ ลำแสงโดนเสาโอเบลิสก์แล้ว! รีบกดพิมพ์ตัวอักษร '${game.obelisk.char}' เพื่อปลดผนึก!`, this.logicalW / 2, hudY + 29);
    } else {
      ctx.fillStyle = '#e0e7ff';
      ctx.fillText(`🔮 [ลูกศร] เดินไปใกล้กระจก • [Spacebar] หมุนกระจก 45° • เมื่อแสงโดนเสาพิมพ์ '${game.obelisk.char}'`, this.logicalW / 2, hudY + 29);
    }

    ctx.restore();
  }

  drawLaserEmitter25D(laser, layout) {
    const ctx = this.ctx;
    const { tileW, tileH, offsetX, offsetY } = layout;
    const cx = offsetX + laser.x * tileW + tileW / 2;
    const cy = offsetY + laser.y * tileH + tileH * 0.52;
    const pulse = 0.8 + 0.2 * Math.sin(this.time * 0.14);

    ctx.save();
    // Base pedestal
    ctx.fillStyle = '#475569';
    ctx.beginPath();
    this.drawEllipse(cx, cy + 8, tileW * 0.34, tileH * 0.22);
    ctx.fill();
    ctx.fillStyle = '#b45309';
    ctx.beginPath();
    this.drawEllipse(cx, cy, tileW * 0.28, tileH * 0.18);
    ctx.fill();

    // Glowing Ruby Core Crystal
    ctx.fillStyle = '#e11d48';
    ctx.beginPath();
    ctx.arc(cx, cy - 12, 13 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fda4af';
    ctx.beginPath();
    ctx.arc(cx - 3, cy - 15, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawPrismMirror25D(mirror, idx, layout, isAdjacent) {
    const ctx = this.ctx;
    const { tileW, tileH, offsetX, offsetY } = layout;
    const cx = offsetX + mirror.x * tileW + tileW / 2;
    const cy = offsetY + mirror.y * tileH + tileH * 0.5;

    // Smooth angle interpolation
    let curAng = this.mirrorVisuals.get(idx);
    if (curAng === undefined) curAng = mirror.angle;
    let diff = ((mirror.angle - curAng + 540) % 360) - 180;
    curAng += diff * 0.28;
    this.mirrorVisuals.set(idx, curAng);

    ctx.save();
    // Interactive ring when Hero stands next to mirror
    if (isAdjacent) {
      const ringR = tileW * 0.42 + Math.sin(this.time * 0.15) * 3;
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      this.drawEllipse(cx, cy + 6, ringR, ringR * 0.65);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Bronze 2.5D Pedestal
    ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
    ctx.beginPath();
    this.drawEllipse(cx + 3, cy + 12, tileW * 0.28, tileH * 0.17);
    ctx.fill();

    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    this.drawEllipse(cx, cy + 8, tileW * 0.26, tileH * 0.16);
    ctx.fill();
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Floating Sapphire Mirror Bar rotated at visual angle
    // Note: in core.js 45 deg = '\' (top-left to bottom-right), 135 deg = '/'
    const rad = ((curAng - 45) * Math.PI) / 180;
    ctx.translate(cx, cy - 8);
    ctx.rotate(rad);

    const len = tileW * 0.62;
    // Mirror frame backing
    ctx.fillStyle = '#0369a1';
    ctx.beginPath();
    this.drawRoundedRect(-len / 2, -6, len, 12, 4);
    ctx.fill();

    // Reflective glass surface
    ctx.fillStyle = '#e0f2fe';
    ctx.beginPath();
    this.drawRoundedRect(-len / 2 + 2, -3, len - 4, 6, 3);
    ctx.fill();

    // Center crystal hub
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.restore();

    if (isAdjacent) {
      this.drawFloatingKeyBadge(cx, cy - 36, '⟳', '#38bdf8', false);
    }
  }

  drawArcaneObelisk25D(obelisk, layout, hitsObelisk, isEnergized) {
    const ctx = this.ctx;
    const { tileW, tileH, offsetX, offsetY } = layout;
    const cx = offsetX + obelisk.x * tileW + tileW / 2;
    const baseY = offsetY + obelisk.y * tileH + tileH * 0.68;

    ctx.save();
    // Energy Aura when beam hits or energized
    if (hitsObelisk || isEnergized) {
      const auraR = tileW * 0.58 + Math.sin(this.time * 0.16) * 5;
      if (typeof ctx.createRadialGradient === 'function') {
        const g = ctx.createRadialGradient(cx, baseY - 18, 4, cx, baseY - 18, auraR);
        g.addColorStop(0, isEnergized ? 'rgba(52, 211, 153, 0.85)' : 'rgba(250, 204, 21, 0.7)');
        g.addColorStop(1, 'rgba(168, 85, 247, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, baseY - 18, auraR, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
    ctx.beginPath();
    this.drawEllipse(cx + 4, baseY + 5, tileW * 0.34, tileH * 0.18);
    ctx.fill();

    // Tall 2.5D Obelisk Pillar
    ctx.fillStyle = isEnergized ? '#065f46' : '#3b0764';
    ctx.strokeStyle = isEnergized ? '#34d399' : (hitsObelisk ? '#fde047' : '#c084fc');
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx, baseY - 52);
    ctx.lineTo(cx + 18, baseY - 34);
    ctx.lineTo(cx + 16, baseY + 2);
    ctx.lineTo(cx - 16, baseY + 2);
    ctx.lineTo(cx - 18, baseY - 34);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Glowing etched character on obelisk
    ctx.fillStyle = isEnergized ? '#a7f3d0' : '#ffffff';
    ctx.font = 'bold 22px "Sarabun", "Noto Sans Thai", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(obelisk.char, cx, baseY - 16);

    if (hitsObelisk && !isEnergized) {
      this.drawFloatingKeyBadge(cx, baseY - 62, obelisk.char, '#facc15', true);
    }
    ctx.restore();
  }

  drawOpticalBeam(beam, layout, isEnergized) {
    if (!beam || !beam.path || beam.path.length < 2) return;
    const ctx = this.ctx;
    const { tileW, tileH, offsetX, offsetY } = layout;

    const pts = beam.path.map(p => ({
      x: offsetX + p.x * tileW + tileW / 2,
      y: offsetY + p.y * tileH + tileH * 0.5 - 8
    }));

    const tracePath = () => {
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        if (i === 0) ctx.moveTo(pts[i].x, pts[i].y);
        else ctx.lineTo(pts[i].x, pts[i].y);
      }
    };

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Outer neon bloom
    ctx.strokeStyle = isEnergized ? 'rgba(52, 211, 153, 0.35)' : 'rgba(244, 63, 94, 0.35)';
    ctx.lineWidth = 14 + Math.sin(this.time * 0.2) * 2;
    tracePath();
    ctx.stroke();

    // Mid laser glow
    ctx.strokeStyle = isEnergized ? '#34d399' : '#fb7185';
    ctx.lineWidth = 5.5;
    tracePath();
    ctx.stroke();

    // White-hot inner core
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.2;
    tracePath();
    ctx.stroke();

    // Sparkling star flare at every reflection & endpoint
    for (let i = 1; i < pts.length; i++) {
      const pt = pts[i];
      const r = 4.5 + Math.sin(this.time * 0.25 + i) * 1.8;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // -----------------------------------------------------------
  // Scene 3: Dungeon Relic (🏛️ วิหารทองคำโบราณ — Sun Temple)
  // -----------------------------------------------------------
  renderDungeonRelic(game) {
    this.time++;
    const ctx = this.ctx;
    ctx.save();

    if (this.shakeTime > 0) {
      ctx.translate((Math.random() - 0.5) * this.shakeMag, (Math.random() - 0.5) * this.shakeMag);
      this.shakeTime--;
    }

    this.drawBiomeBackdrop('sun_temple');
    const layout = this.computeBoardLayout(game.width, game.height, 76, 46);
    this.drawDioramaIsland(game.width, game.height, layout, 'sun_temple');

    // Solar Magic Circles (Targets) on floor
    game.targets.forEach(t => {
      const matched = game.chests.some(c => c.x === t.x && c.y === t.y && c.char === t.char);
      this.drawSolarTarget25D(t, layout, matched);
    });

    const hv = this.syncHeroTween(game);
    const torchSet = new Set((game.torches || []).map(t => `${t.x},${t.y}`));

    // Y-Depth Sorted Drawables
    const drawables = [];
    game.walls.forEach(w => {
      const [wx, wy] = w.split(',').map(Number);
      drawables.push({
        sortY: wy,
        draw: () => this.drawTempleWall(wx, wy, layout, torchSet.has(w))
      });
    });

    game.chests.forEach(c => {
      const matched = game.targets.some(t => t.x === c.x && t.y === c.y && t.char === c.char);
      drawables.push({
        sortY: c.y + 0.08,
        draw: () => this.drawRelicChest(c, layout, matched)
      });
    });

    drawables.push({
      sortY: hv.y + 0.15,
      draw: () => this.drawHero25D(hv.x, hv.y, hv.hop, game.hero.dir || 'down', layout, 'sun_temple')
    });

    drawables.sort((a, b) => a.sortY - b.sortY);
    drawables.forEach(d => d.draw());

    this.updateAndDrawFX();

    // Bottom Guide HUD
    const hudY = this.logicalH - 58;
    ctx.fillStyle = 'rgba(28, 15, 7, 0.92)';
    ctx.fillRect(0, hudY, this.logicalW, 58);
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, hudY);
    ctx.lineTo(this.logicalW, hudY);
    ctx.stroke();

    ctx.fillStyle = '#fef3c7';
    ctx.font = 'bold 14px "Sarabun", "Noto Sans Thai", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🏛️ [ลูกศร] เดินและผลักหีบเข้าวงเวท • [พิมพ์อักษรข้างหีบ] ปลดโซ่ตรวน • [Spacebar] ย้อนเวลา 1 ก้าว ⏪', this.logicalW / 2, hudY + 29);

    ctx.restore();
  }

  drawSolarTarget25D(target, layout, isMatched) {
    const ctx = this.ctx;
    const { tileW, tileH, offsetX, offsetY } = layout;
    const cx = offsetX + target.x * tileW + tileW / 2;
    const cy = offsetY + target.y * tileH + tileH / 2;

    ctx.save();
    const color = isMatched ? '#34d399' : '#fbbf24';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    this.drawEllipse(cx, cy, tileW * 0.4, tileH * 0.32);
    ctx.stroke();
    ctx.setLineDash([]);

    // Inner rune ring
    ctx.fillStyle = isMatched ? 'rgba(52, 211, 153, 0.25)' : 'rgba(251, 191, 36, 0.16)';
    ctx.beginPath();
    this.drawEllipse(cx, cy, tileW * 0.34, tileH * 0.26);
    ctx.fill();

    // Character target inscription
    ctx.fillStyle = isMatched ? '#a7f3d0' : '#fef08a';
    ctx.font = `bold ${Math.round(tileW * 0.34)}px "Sarabun", "Noto Sans Thai", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(target.char, cx, cy);
    ctx.restore();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ArcadeView;
}
if (typeof window !== 'undefined') {
  window.ArcadeView = ArcadeView;
}
