import { drawSpriteWithEffects, isHiddenByEffect, type RunningVisual, type VisualEffectItem } from '../asset-library/effects/visualEffectsModel';
import type { ChallengeVisual, SceneTheme } from '../design-board/studioModel';

export function drawChallengeEntity(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  visual: ChallengeVisual,
  time: number,
  spriteImg: HTMLImageElement | null,
  rotateDir: -1 | 0 | 1,
  baked: { canvas: HTMLCanvasElement; padRatio: number } | null = null,
  effects?: VisualEffectItem[],
  dimensions?: { width: number; height: number; rotation: number },
  sceneVisual?: { run: RunningVisual; time: number },
) {
  ctx.save();
  if (spriteImg) {
    const size = radius * 2.5;
    drawSpriteWithEffects(
      ctx,
      spriteImg,
      baked,
      x,
      y,
      dimensions?.width ?? size,
      dimensions?.height ?? size,
      effects,
      time,
      (dimensions?.rotation ?? 0) + rotateDir * time * 5.0,
      1,
      sceneVisual,
    );
    ctx.restore();
    return;
  }

  if (isHiddenByEffect(effects)) { ctx.restore(); return; }
  if (dimensions || rotateDir !== 0) {
    ctx.translate(x, y);
    ctx.rotate((dimensions?.rotation ?? 0) + rotateDir * time * (visual === 'rock' ? 3.2 : 5));
    if (dimensions) ctx.scale(dimensions.width / 30, dimensions.height / 30);
    x = 0;
    y = 0;
  }

  if (visual === 'coin') {
    const glow = ctx.createRadialGradient(x, y, 2, x, y, 22);
    glow.addColorStop(0, 'rgba(251, 197, 61, 0.85)');
    glow.addColorStop(1, 'rgba(251, 197, 61, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, 22, 0, Math.PI * 2);
    ctx.fill();

    const squeeze = 0.72 + 0.28 * Math.abs(Math.cos(time * 4));
    ctx.fillStyle = '#F59E0B';
    ctx.beginPath();
    ctx.ellipse(x, y, 10 * squeeze, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FEF08A';
    ctx.beginPath();
    ctx.ellipse(x, y, 5.5 * squeeze, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (visual === 'rock') {
    ctx.translate(x, y);
    ctx.fillStyle = '#64748B';
    ctx.beginPath();
    ctx.moveTo(-12, -5);
    ctx.lineTo(-4, -13);
    ctx.lineTo(9, -10);
    ctx.lineTo(13, 2);
    ctx.lineTo(5, 12);
    ctx.lineTo(-9, 10);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.fillStyle = '#475569';
    ctx.beginPath();
    ctx.arc(-3, -2, 3, 0, Math.PI * 2);
    ctx.arc(5, 4, 2.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (visual === 'creature') {
    const squish = Math.sin(time * 6) * 2;
    ctx.fillStyle = '#8B5CF6';
    ctx.beginPath();
    ctx.roundRect(x - 13, y - 10 - squish * 0.5, 26, 20 + squish * 0.5, [12, 12, 5, 5]);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(x - 4.5, y - 2, 3.2, 0, Math.PI * 2);
    ctx.arc(x + 4.5, y - 2, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0F172A';
    ctx.beginPath();
    ctx.arc(x - 5.2, y - 2, 1.5, 0, Math.PI * 2);
    ctx.arc(x + 3.8, y - 2, 1.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (visual === 'spike') {
    ctx.fillStyle = '#E11D48';
    for (let offset = -10; offset <= 10; offset += 10) {
      ctx.beginPath();
      ctx.moveTo(x + offset - 5, y + 10);
      ctx.lineTo(x + offset, y - 11);
      ctx.lineTo(x + offset + 5, y + 10);
      ctx.closePath();
      ctx.fill();
    }
  } else {
    // Default glowing fireball / spark
    const glow = ctx.createRadialGradient(x, y, 3, x, y, 22);
    glow.addColorStop(0, 'rgba(254, 240, 138, 0.95)');
    glow.addColorStop(0.55, 'rgba(249, 115, 22, 0.85)');
    glow.addColorStop(1, 'rgba(249, 115, 22, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FEF08A';
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fill();
    if (rotateDir !== 0) {
      ctx.fillStyle = '#F59E0B';
      ctx.beginPath();
      ctx.ellipse(x + 5, y - 3, 4.5, 2, -0.45, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

export function drawStageBackdrop(
  ctx: CanvasRenderingContext2D,
  theme: SceneTheme,
  worldW: number,
  worldH: number,
  groundY: number,
  time: number,
  flare: number,
  bgImg: HTMLImageElement | null,
  bgBaked: { canvas: HTMLCanvasElement; padRatio: number } | null = null,
  bgEffects?: VisualEffectItem[],
) {
  if (theme === 'meadow') {
    const sky = ctx.createLinearGradient(0, 0, 0, groundY);
    sky.addColorStop(0, '#60A5FA');
    sky.addColorStop(1, '#DBEAFE');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, worldW, worldH);

    // Sun
    ctx.fillStyle = '#FDE047';
    ctx.beginPath();
    ctx.arc(308, 42, 18, 0, Math.PI * 2);
    ctx.fill();

    // Soft clouds
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    const drift = (time * 8) % (worldW + 80);
    [60, 210].forEach((cx, idx) => {
      const x = ((cx + drift) % (worldW + 80)) - 40;
      const y = idx === 0 ? 44 : 68;
      ctx.beginPath();
      ctx.arc(x, y, 14, 0, Math.PI * 2);
      ctx.arc(x + 14, y - 4, 16, 0, Math.PI * 2);
      ctx.arc(x + 28, y, 12, 0, Math.PI * 2);
      ctx.fill();
    });

    // Distant hills
    ctx.fillStyle = '#86EFAC';
    ctx.beginPath();
    ctx.ellipse(90, groundY, 130, 38, 0, Math.PI, Math.PI * 2);
    ctx.ellipse(280, groundY, 150, 48, 0, Math.PI, Math.PI * 2);
    ctx.fill();

    if (bgImg) {
      drawSpriteWithEffects(
        ctx,
        bgImg,
        bgBaked,
        worldW / 2,
        groundY / 2,
        worldW,
        groundY,
        bgEffects,
        time,
        0,
        0.92,
      );
      ctx.fillStyle = 'rgba(15, 23, 42, 0.14)';
      ctx.fillRect(0, 0, worldW, groundY);
    }

    // Grassy ground
    ctx.fillStyle = '#16A34A';
    ctx.fillRect(0, groundY, worldW, 7);
    ctx.fillStyle = '#78350F';
    ctx.fillRect(0, groundY + 7, worldW, worldH - groundY - 7);
    return;
  }

  if (theme === 'space') {
    const sky = ctx.createLinearGradient(0, 0, 0, worldH);
    sky.addColorStop(0, '#020617');
    sky.addColorStop(1, '#1E1B4B');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, worldW, worldH);

    // Nebula glow
    const neb = ctx.createRadialGradient(110, 80, 10, 110, 80, 110);
    neb.addColorStop(0, 'rgba(139, 92, 246, 0.32)');
    neb.addColorStop(1, 'rgba(139, 92, 246, 0)');
    ctx.fillStyle = neb;
    ctx.fillRect(0, 0, worldW, groundY);

    // Stars
    for (let i = 0; i < 18; i++) {
      const sx = (i * 53 + 17) % worldW;
      const sy = (i * 29 + 11) % (groundY - 24);
      const twinkle = 0.35 + 0.65 * Math.sin(time * 2.8 + i);
      ctx.fillStyle = `rgba(224, 242, 254, ${twinkle.toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(sx, sy, i % 3 === 0 ? 1.6 : 1.0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Ringed planet
    ctx.fillStyle = '#38BDF8';
    ctx.beginPath();
    ctx.arc(296, 52, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(186, 230, 253, 0.75)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(296, 52, 28, 7, -0.25, 0, Math.PI * 2);
    ctx.stroke();

    if (bgImg) {
      drawSpriteWithEffects(
        ctx,
        bgImg,
        bgBaked,
        worldW / 2,
        groundY / 2,
        worldW,
        groundY,
        bgEffects,
        time,
        0,
        0.92,
      );
      ctx.fillStyle = 'rgba(2, 6, 23, 0.16)';
      ctx.fillRect(0, 0, worldW, groundY);
    }

    // Starship deck floor
    ctx.fillStyle = '#1E293B';
    ctx.fillRect(0, groundY, worldW, worldH - groundY);
    ctx.fillStyle = '#38BDF8';
    ctx.fillRect(0, groundY, worldW, 3);
    return;
  }

  if (theme === 'ocean') {
    const sea = ctx.createLinearGradient(0, 0, 0, worldH);
    sea.addColorStop(0, '#0284C7');
    sea.addColorStop(0.7, '#0369A1');
    sea.addColorStop(1, '#0C4A6E');
    ctx.fillStyle = sea;
    ctx.fillRect(0, 0, worldW, worldH);

    // Rising bubbles
    ctx.strokeStyle = 'rgba(186, 230, 253, 0.55)';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 8; i++) {
      const bx = 35 + i * 44;
      const by = groundY - (((time * 24 + i * 31) % (groundY - 12)) + 8);
      ctx.beginPath();
      ctx.arc(bx + Math.sin(time * 2 + i) * 4, by, 2.5 + (i % 3), 0, Math.PI * 2);
      ctx.stroke();
    }

    if (bgImg) {
      drawSpriteWithEffects(
        ctx,
        bgImg,
        bgBaked,
        worldW / 2,
        groundY / 2,
        worldW,
        groundY,
        bgEffects,
        time,
        0,
        0.92,
      );
      ctx.fillStyle = 'rgba(12, 74, 110, 0.15)';
      ctx.fillRect(0, 0, worldW, groundY);
    }

    // Sandy floor
    ctx.fillStyle = '#EAB308';
    ctx.fillRect(0, groundY, worldW, 6);
    ctx.fillStyle = '#CA8A04';
    ctx.fillRect(0, groundY + 6, worldW, worldH - groundY - 6);
    return;
  }

  if (theme === 'cavern') {
    const cav = ctx.createLinearGradient(0, 0, 0, worldH);
    cav.addColorStop(0, '#1C1917');
    cav.addColorStop(0.65, '#431407');
    cav.addColorStop(1, '#7C2D12');
    ctx.fillStyle = cav;
    ctx.fillRect(0, 0, worldW, worldH);

    if (bgImg) {
      drawSpriteWithEffects(
        ctx,
        bgImg,
        bgBaked,
        worldW / 2,
        groundY / 2,
        worldW,
        groundY,
        bgEffects,
        time,
        0,
        0.92,
      );
      ctx.fillStyle = 'rgba(28, 25, 23, 0.16)';
      ctx.fillRect(0, 0, worldW, groundY);
    }

    ctx.fillStyle = '#44403C';
    ctx.fillRect(0, groundY, worldW, worldH - groundY);
    ctx.fillStyle = '#EA580C';
    ctx.fillRect(0, groundY, worldW, 3);
    return;
  }

  if (theme === 'night') {
    const sky = ctx.createLinearGradient(0, 0, 0, worldH);
    sky.addColorStop(0, '#0B132B');
    sky.addColorStop(0.65, '#1C2E59');
    sky.addColorStop(1, '#263D73');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, worldW, worldH);

    const stars = [
      [42, 28],
      [98, 44],
      [168, 22],
      [232, 36],
      [295, 24],
      [334, 52],
    ];
    stars.forEach(([sx, sy], idx) => {
      const twinkle = 0.45 + 0.55 * Math.sin(time * 2.4 + idx * 1.3);
      ctx.fillStyle = `rgba(254, 243, 199, ${twinkle.toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(sx, sy, 1.4, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.fillStyle = '#FEF3C7';
    ctx.beginPath();
    ctx.arc(312, 42, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#142347';
    ctx.beginPath();
    ctx.arc(318, 38, 12, 0, Math.PI * 2);
    ctx.fill();

    if (bgImg) {
      drawSpriteWithEffects(
        ctx,
        bgImg,
        bgBaked,
        worldW / 2,
        groundY / 2,
        worldW,
        groundY,
        bgEffects,
        time,
        0,
        0.92,
      );
      ctx.fillStyle = 'rgba(11, 19, 43, 0.16)';
      ctx.fillRect(0, 0, worldW, groundY);
    }

    // Warm lanterns
    const lanterns = [62, 162, 262];
    lanterns.forEach((lx, idx) => {
      const sway = Math.sin(time * 2 + idx) * 2.5;
      const ly = 50 + Math.sin((lx / worldW) * Math.PI) * 8;
      const glowR = 18 + flare * 22;
      const grad = ctx.createRadialGradient(lx + sway, ly + 7, 2, lx + sway, ly + 7, glowR);
      grad.addColorStop(0, `rgba(251, 197, 61, ${Math.min(0.9, 0.45 + flare * 0.4)})`);
      grad.addColorStop(1, 'rgba(251, 197, 61, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(lx + sway, ly + 7, glowR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#F59E0B';
      ctx.beginPath();
      ctx.roundRect(lx + sway - 5, ly, 10, 14, 4);
      ctx.fill();
    });

    ctx.fillStyle = '#334155';
    ctx.fillRect(0, groundY, worldW, worldH - groundY);
    ctx.fillStyle = '#64748B';
    ctx.fillRect(0, groundY, worldW, 4);
    return;
  }

  // Default Neutral Clean Studio Stage (zero pre-baked Lantern Bridge clutter!)
  const bg = ctx.createLinearGradient(0, 0, 0, worldH);
  bg.addColorStop(0, '#1E293B');
  bg.addColorStop(1, '#334155');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, worldW, worldH);

  if (bgImg) {
    drawSpriteWithEffects(
      ctx,
      bgImg,
      bgBaked,
      worldW / 2,
      groundY / 2,
      worldW,
      groundY,
      bgEffects,
      time,
      0,
      0.92,
    );
    ctx.fillStyle = 'rgba(15, 23, 42, 0.14)';
    ctx.fillRect(0, 0, worldW, groundY);
  } else {
    // Subtle geometric studio grid lines when no custom background asset is bound
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let gx = 36; gx < worldW; gx += 36) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, groundY);
      ctx.stroke();
    }
    for (let gy = 36; gy < groundY; gy += 36) {
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(worldW, gy);
      ctx.stroke();
    }
  }

  // Clean crisp ground platform
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(0, groundY, worldW, worldH - groundY);
  ctx.fillStyle = '#475569';
  ctx.fillRect(0, groundY, worldW, 4);
}
