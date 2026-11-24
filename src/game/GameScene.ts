import * as Phaser from "phaser";
import { PLAYER_H, TILE } from "@/shared/constants";
import type { LevelData, NetState } from "@/shared/types";
import { generateTextures } from "./textures";
import type { GameView, ViewEvent } from "./views";

export const VIEW_W = 960;
export const VIEW_H = 540;

/**
 * Pure renderer: draws whatever the GameView says. Server (or the local sim)
 * decides positions and outcomes; this scene only sends input intent.
 */
export class GameScene extends Phaser.Scene {
  private view!: GameView;
  private builtKey = -1;
  private world!: Phaser.GameObjects.Container;
  private bgFar!: Phaser.GameObjects.TileSprite;
  private bgNear!: Phaser.GameObjects.TileSprite;
  private clouds: Phaser.GameObjects.Image[] = [];
  private player!: Phaser.GameObjects.Image;
  private nameText!: Phaser.GameObjects.Text;
  private platSprites: Phaser.GameObjects.TileSprite[] = [];
  private hiddenSprites: Phaser.GameObjects.Image[] = [];
  private hiddenShown: boolean[] = [];
  private pitSprites: Phaser.GameObjects.Image[] = [];
  private exitGlow?: Phaser.GameObjects.Ellipse;
  private rx = 0;
  private ry = 0;
  private rpl: number[] = [];
  private keys!: {
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
    a: Phaser.Input.Keyboard.Key;
    d: Phaser.Input.Keyboard.Key;
    up: Phaser.Input.Keyboard.Key;
    w: Phaser.Input.Keyboard.Key;
    space: Phaser.Input.Keyboard.Key;
  };
  private animT = 0;
  private dead = false;
  private level: LevelData | null = null;

  constructor() {
    super("game");
  }

  init(data: { view: GameView }) {
    this.view = data.view;
    this.builtKey = -1;
  }

  create() {
    generateTextures(this);
    const sky = this.add.image(0, 0, "sky").setOrigin(0).setScrollFactor(0).setDepth(-100);
    sky.setDisplaySize(VIEW_W, VIEW_H);
    for (let i = 0; i < 70; i++) {
      const s = this.add
        .image(Math.random() * VIEW_W, Math.random() * VIEW_H * 0.7, "px")
        .setScrollFactor(0)
        .setDepth(-99)
        .setScale(Math.random() > 0.8 ? 0.5 : 0.25)
        .setAlpha(0.3 + Math.random() * 0.7);
      this.tweens.add({
        targets: s,
        alpha: { from: 0.2, to: 1 },
        duration: 700 + Math.random() * 2200,
        yoyo: true,
        repeat: -1,
        delay: Math.random() * 1500,
      });
    }
    this.add.image(780, 90, "moon").setScrollFactor(0.02).setDepth(-98).setScale(1.5);
    for (let i = 0; i < 4; i++) {
      const c = this.add
        .image(Math.random() * VIEW_W, 60 + Math.random() * 160, "cloud")
        .setScrollFactor(0.1)
        .setDepth(-97)
        .setScale(1.5 + Math.random());
      this.clouds.push(c);
    }
    this.bgFar = this.add
      .tileSprite(0, VIEW_H - 320, VIEW_W, 320, "bg_far")
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(-96);
    this.bgNear = this.add
      .tileSprite(0, VIEW_H - 220, VIEW_W, 220, "bg_near")
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(-95);

    this.world = this.add.container(0, 0);
    this.player = this.add.image(0, 0, "player_idle").setOrigin(0.5, 1).setDepth(20).setVisible(false);
    this.nameText = this.add
      .text(0, 0, "", { fontFamily: "monospace", fontSize: "12px", color: "#e9d5ff", stroke: "#0b0d1f", strokeThickness: 3 })
      .setOrigin(0.5, 1)
      .setDepth(21);

    const kb = this.input.keyboard!;
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = {
      left: kb.addKey(K.LEFT),
      right: kb.addKey(K.RIGHT),
      a: kb.addKey(K.A),
      d: kb.addKey(K.D),
      up: kb.addKey(K.UP),
      w: kb.addKey(K.W),
      space: kb.addKey(K.SPACE),
    };
    kb.addCapture([K.SPACE, K.LEFT, K.RIGHT, K.UP, K.DOWN]);
    this.cameras.main.setRoundPixels(true);
  }

  // ---------- level construction ----------
  private clearLevel() {
    this.world.removeAll(true);
    this.platSprites = [];
    this.hiddenSprites = [];
    this.hiddenShown = [];
    this.pitSprites = [];
    this.exitGlow = undefined;
  }

  private buildLevel(level: LevelData) {
    this.clearLevel();
    this.level = level;
    const { width, height } = level;
    const solid = new Uint8Array(width * height);
    for (const r of level.solids)
      for (let y = r.y; y < r.y + r.h; y++)
        for (let x = r.x; x < r.x + r.w; x++) if (x < width && y < height) solid[y * width + x] = 1;
    const isSolid = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && solid[y * width + x] === 1;
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.world.add(o);
      return o;
    };

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!isSolid(x, y)) continue;
        const above = isSolid(x, y - 1);
        // tall ground columns use grass/dirt; floating single blocks use brick style
        const floating = !above && !isSolid(x, y + 1);
        const key = floating ? "solid_block" : above ? "dirt" : "grass";
        add(this.add.image(x * TILE, y * TILE, key).setOrigin(0));
      }
    }
    for (const p of level.pits) {
      const s = this.add.image(p.x * TILE, p.y * TILE, "pit0").setOrigin(0).setDepth(2);
      this.pitSprites.push(add(s));
    }
    for (const s of level.spikes) add(this.add.image(s.x * TILE, s.y * TILE, "spike").setOrigin(0).setDepth(3));
    level.hidden.forEach((h) => {
      const sp = this.add.image(h.x * TILE, h.y * TILE + 18, "spike").setOrigin(0).setAlpha(0).setDepth(3);
      this.hiddenSprites.push(add(sp));
      this.hiddenShown.push(false);
    });
    for (const d of level.fakeDoors) add(this.add.image(d.x * TILE, (d.y - 1) * TILE, "fakedoor").setOrigin(0).setDepth(4));
    const ex = level.exit;
    this.exitGlow = add(
      this.add.ellipse(ex.x * TILE + 16, ex.y * TILE, 80, 110, 0x22d3ee, 0.18).setDepth(3),
    );
    this.tweens.add({ targets: this.exitGlow, scaleX: 1.25, scaleY: 1.15, alpha: 0.32, yoyo: true, repeat: -1, duration: 900 });
    add(this.add.image(ex.x * TILE, (ex.y - 1) * TILE, "door").setOrigin(0).setDepth(4));
    add(this.add.image(level.spawn.x * TILE, (level.spawn.y + 1) * TILE - 8, "pad").setOrigin(0).setDepth(1));

    for (const m of level.movers) {
      this.platSprites.push(add(this.add.tileSprite(m.x * TILE, m.y * TILE, m.w * TILE, 16, "mover").setOrigin(0).setDepth(5)));
    }
    for (const f of level.fallers) {
      this.platSprites.push(add(this.add.tileSprite(f.x * TILE, f.y * TILE, f.w * TILE, 16, "faller").setOrigin(0).setDepth(5)));
    }
    this.rpl = [];
    this.cameras.main.setBounds(0, 0, width * TILE, Math.max(VIEW_H, height * TILE));
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.cameras.main.setDeadzone(60, 40);
    this.dead = false;
    this.player.setVisible(true).setAlpha(1).setAngle(0);
    this.rx = level.spawn.x * TILE + 16;
    this.ry = (level.spawn.y + 1) * TILE;
    this.player.setPosition(this.rx, this.ry);
    this.cameras.main.centerOn(this.rx, this.ry - 60);
  }

  // ---------- effects ----------
  private burst(x: number, y: number, color: number, n = 16, speed = 160) {
    for (let i = 0; i < n; i++) {
      const p = this.add.image(x, y, "px").setTint(color).setDepth(30).setScale(0.5 + Math.random() * 1.2);
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random());
      this.tweens.add({
        targets: p,
        x: x + Math.cos(a) * v * 0.6,
        y: y + Math.sin(a) * v * 0.6 - 20,
        alpha: 0,
        duration: 500 + Math.random() * 400,
        onComplete: () => p.destroy(),
      });
    }
  }

  private handleEvent(e: ViewEvent) {
    const cam = this.cameras.main;
    if (e.type === "died") {
      this.dead = true;
      this.burst(this.rx, this.ry - 14, 0xf43f5e, 26, 220);
      this.burst(this.rx, this.ry - 14, 0xa855f7, 14, 160);
      cam.shake(220, 0.012);
      cam.flash(120, 244, 63, 94);
    } else if (e.type === "respawned") {
      this.dead = false;
      this.player.setAlpha(0);
      this.tweens.add({ targets: this.player, alpha: 1, duration: 250, ease: "Linear" });
      this.burst(this.rx, this.ry - 14, 0x38bdf8, 14, 120);
    } else if (e.type === "won") {
      const lvl = this.level;
      if (lvl) this.burst(lvl.exit.x * TILE + 16, lvl.exit.y * TILE - 20, 0xfde047, 40, 280);
      cam.flash(250, 34, 211, 238);
    }
  }

  // ---------- frame update ----------
  update(_time: number, delta: number) {
    const view = this.view;
    if (!view) return;

    // input intent (merged keyboard + touch). Only the active player's view forwards it.
    const k = this.keys;
    const t = view.touch;
    view.setInput({
      left: k.left.isDown || k.a.isDown || t.left,
      right: k.right.isDown || k.d.isDown || t.right,
      jump: k.space.isDown || k.up.isDown || k.w.isDown || t.jump,
    });

    view.update(delta);
    if (!view.level && this.builtKey !== -1) {
      this.builtKey = -1;
      this.level = null;
      this.clearLevel();
      this.cameras.main.stopFollow();
      this.cameras.main.setScroll(0, 0);
      this.player.setVisible(false);
      this.nameText.setVisible(false);
    }
    if (view.level && view.levelKey !== this.builtKey) {
      this.builtKey = view.levelKey;
      this.buildLevel(view.level);
    }
    for (const e of view.drainEvents()) this.handleEvent(e);

    const net = view.net;
    if (net && this.level) this.applyNet(net, delta);

    const cam = this.cameras.main;
    this.bgFar.tilePositionX = cam.scrollX * 0.15;
    this.bgFar.tilePositionY = cam.scrollY * 0.05;
    this.bgNear.tilePositionX = cam.scrollX * 0.35;
    this.bgNear.tilePositionY = cam.scrollY * 0.1;
    for (const c of this.clouds) {
      c.x -= delta * 0.012;
      if (c.x < -150) c.x = VIEW_W + 150;
    }
    this.animT += delta;
    const pitFrame = Math.floor(this.animT / 350) % 2 === 0 ? "pit0" : "pit1";
    for (const p of this.pitSprites) p.setTexture(pitFrame);
  }

  private applyNet(net: NetState, delta: number) {
    const k = this.view.smooth ? 1 - Math.exp(-delta / 40) : 1;
    if (Math.abs(net.x - this.rx) > 120 || Math.abs(net.y - this.ry) > 120) {
      this.rx = net.x;
      this.ry = net.y;
    } else {
      this.rx += (net.x - this.rx) * k;
      this.ry += (net.y - this.ry) * k;
    }
    this.player.setPosition(Math.round(this.rx), Math.round(this.ry));
    this.player.setFlipX(net.f < 0);
    let frame = "player_idle";
    if (!net.g) frame = "player_run2";
    else if (Math.abs(net.vx) > 20) frame = Math.floor(this.animT / 110) % 2 === 0 ? "player_run1" : "player_run2";
    this.player.setTexture(frame);
    this.player.setVisible(net.st !== 1);
    this.nameText.setText(this.view.playerName);
    this.nameText.setPosition(Math.round(this.rx), Math.round(this.ry) - PLAYER_H - 6);
    this.nameText.setVisible(this.player.visible && this.view.mode === "live");

    // platforms (movers then fallers)
    const lvl = this.level!;
    const movers = lvl.movers.length;
    for (let i = 0; i < this.platSprites.length; i++) {
      const tx = net.pl[i * 2];
      const ty = net.pl[i * 2 + 1];
      if (tx === undefined) continue;
      const s = this.platSprites[i];
      let nx = this.rpl[i * 2] ?? tx;
      let ny = this.rpl[i * 2 + 1] ?? ty;
      if (Math.abs(tx - nx) > 150 || Math.abs(ty - ny) > 150) {
        nx = tx;
        ny = ty;
      } else {
        nx += (tx - nx) * k;
        ny += (ty - ny) * k;
      }
      this.rpl[i * 2] = nx;
      this.rpl[i * 2 + 1] = ny;
      let shake = 0;
      if (i >= movers) {
        const timer = net.ft[i - movers] ?? 0;
        if (timer > 0 && ny < (lvl.height + 1) * TILE && Math.abs(ty - lvl.fallers[i - movers].y * TILE) < 2) {
          shake = (Math.random() - 0.5) * 3;
        }
        s.setVisible(ty < (lvl.height + 5) * TILE);
      }
      s.setPosition(Math.round(nx + shake), Math.round(ny));
    }

    // hidden traps pop up once the server reveals them
    const revealed = new Set(net.hd);
    this.hiddenSprites.forEach((sp, i) => {
      const should = revealed.has(i);
      if (should && !this.hiddenShown[i]) {
        this.hiddenShown[i] = true;
        sp.setAlpha(1);
        this.tweens.add({ targets: sp, y: lvl.hidden[i].y * TILE, duration: 90, ease: "Back.Out" });
        this.cameras.main.shake(100, 0.004);
      } else if (!should && this.hiddenShown[i]) {
        this.hiddenShown[i] = false;
        this.tweens.killTweensOf(sp);
        sp.setAlpha(0).setY(lvl.hidden[i].y * TILE + 18);
      }
    });
  }
}
