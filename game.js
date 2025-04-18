// ========== TELEGRAM INTEGRATION ==========
// In the Telegram game environment, TelegramGameProxy is injected automatically.
// When running locally, we stub it so the game is still playable and debuggable.
if (typeof window.TelegramGameProxy === "undefined") {
  window.TelegramGameProxy = {
    init: () => {},
    gameOver: (score) => {
      alert(`Game over! Your score: ${score}`);
    },
  };
  console.log("TelegramGameProxy stubbed (running outside Telegram).");
}

// ========== GAME CONFIGURATION ==========
const BASE_WIDTH = 800;
const BASE_HEIGHT = 600;

const config = {
  type: Phaser.CANVAS,
  parent: "game-container",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: BASE_WIDTH,
    height: BASE_HEIGHT,
  },
  backgroundColor: '#1d1d1d',
  physics: {
    default: 'arcade',
    arcade: { gravity: { y: 0 }, debug: false }
  },
  scene: {
    preload: preload,
    create: create,
    update: update,
  },
};

const game = new Phaser.Game(config);

let player;
let cursors;
let bullets;
let enemies;
let lastFired = 0;
let score = 0;
let scoreText;
let health = 5;
let healthText;
// === RPG / Leveling ===
let gems;
let xp = 0;
let level = 1;
let xpText;
const LEVEL_THRESHOLDS = [5, 15, 30, 50, 80];
let fireRate = 300; // will decrease as we level‑up
let bulletSpeed = 500; // will increase as we level‑up
let bulletDamage = 1;

// === Touch / Pointer control ===
let pointerDown = false;
let dragVector;
let dragStart;

// A tiny 1×1 PNG (white pixel) encoded as Base64. We'll tint it for different sprites.
const WHITE_PIXEL_BASE64 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==";

function preload() {
  // Load the white pixel texture once; we'll reuse it for all game objects.
  this.load.image("pixel", WHITE_PIXEL_BASE64);
}

function create() {
  // Create the player sprite and configure physics.
  player = this.physics.add.image(BASE_WIDTH / 2, BASE_HEIGHT / 2, "pixel");
  player.setDisplaySize(32, 32).setTint(0x00ff00);
  player.setCollideWorldBounds(true);

  // Groups
  bullets = this.physics.add.group({
    defaultKey: "pixel",
    maxSize: 200,
  });

  enemies = this.physics.add.group();

  // Experience gems
  gems = this.physics.add.group();

  // Input
  cursors = this.input.keyboard.createCursorKeys();
  this.input.keyboard.addKeys("W,S,A,D");

  // UI
  scoreText = this.add
    .text(10, 10, "Score: 0", { font: "20px Arial", fill: "#ffffff" })
    .setDepth(1);
  healthText = this.add
    .text(10, 35, "Health: 5", { font: "20px Arial", fill: "#ffffff" })
    .setDepth(1);
  xpText = this.add
    .text(10, 60, `XP: 0 / ${LEVEL_THRESHOLDS[0]}` , { font: "20px Arial", fill: "#ffffff" })
    .setDepth(1);

  // Spawn enemies continuously.
  this.time.addEvent({
    delay: 1000, // every second
    callback: spawnEnemy,
    callbackScope: this,
    loop: true,
  });

  // Collisions / Overlaps
  this.physics.add.overlap(bullets, enemies, bulletHitEnemy, null, this);
  this.physics.add.overlap(player, enemies, enemyHitPlayer, null, this);
  this.physics.add.overlap(player, gems, collectGem, null, this);

  // Touch / pointer controls
  dragVector = new Phaser.Math.Vector2(0, 0);
  this.input.on("pointerdown", (pointer) => {
    pointerDown = true;
    dragStart = new Phaser.Math.Vector2(pointer.x, pointer.y);
  });
  this.input.on("pointermove", (pointer) => {
    if (!pointerDown) return;
    dragVector.set(pointer.x - dragStart.x, pointer.y - dragStart.y);
  });
  this.input.on("pointerup", () => {
    pointerDown = false;
    dragVector.set(0, 0);
  });
}

function update(time, delta) {
  handlePlayerMovement.call(this);
  autoFire.call(this, time);
  enemies.getChildren().forEach((enemy) => {
    // Simple homing behaviour: move toward the player
    this.physics.moveToObject(enemy, player, enemy.getData("speed"));
  });

  bullets.getChildren().forEach((b) => {
    if (b.active && b.update) b.update(time, delta);
  });
}

/* =========================
 *  HELPER FUNCTIONS
 * ========================= */

function handlePlayerMovement() {
  const speed = 250;
  let vx = 0;
  let vy = 0;

  if (pointerDown && dragVector.lengthSq() > 4) {
    const dir = dragVector.clone().normalize();
    vx = dir.x * speed;
    vy = dir.y * speed;
  } else {
    // Older Safari versions (pre‑13.1) don't understand optional chaining (?.)
    const keys = this.input.keyboard.keys || {};
    const A = keys["A"] && keys["A"].isDown;
    const D = keys["D"] && keys["D"].isDown;
    const W = keys["W"] && keys["W"].isDown;
    const S = keys["S"] && keys["S"].isDown;

    if (cursors.left.isDown || A) vx = -speed;
    else if (cursors.right.isDown || D) vx = speed;
    if (cursors.up.isDown || W) vy = -speed;
    else if (cursors.down.isDown || S) vy = speed;
  }

  player.setVelocity(vx, vy);
}

function autoFire(time) {
  if (time < lastFired + fireRate) return; // milliseconds between shots
  if (enemies.getLength() === 0) return;

  // Target the closest enemy.
  let closestEnemy = null;
  let minDist = Infinity;
  enemies.getChildren().forEach((enemy) => {
    const dist = Phaser.Math.Distance.Between(player.x, player.y, enemy.x, enemy.y);
    if (dist < minDist) {
      minDist = dist;
      closestEnemy = enemy;
    }
  });
  if (!closestEnemy) return;

  const bullet = bullets.get(player.x, player.y);
  if (!bullet) return; // None available (pool exhausted)

  bullet.setActive(true);
  bullet.setVisible(true);
  bullet.setDisplaySize(8, 8).setTint(0xffff00);
  bullet.body.reset(player.x, player.y);

  this.physics.moveToObject(bullet, closestEnemy, bulletSpeed);
  bullet.lifespan = 1000; // ms

  bullet.damage = bulletDamage;

  // We need a custom update for bullets to handle lifespan.
  bullet.update = function (time, delta) {
    this.lifespan -= delta;
    if (this.lifespan <= 0) {
      this.setActive(false);
      this.setVisible(false);
    }
  };

  lastFired = time;
}

function spawnEnemy() {
  const edge = Phaser.Math.Between(0, 3);
  let x, y;
  switch (edge) {
    case 0: // left
      x = 0;
      y = Phaser.Math.Between(0, BASE_HEIGHT);
      break;
    case 1: // right
      x = BASE_WIDTH;
      y = Phaser.Math.Between(0, BASE_HEIGHT);
      break;
    case 2: // top
      x = Phaser.Math.Between(0, BASE_WIDTH);
      y = 0;
      break;
    case 3: // bottom
      x = Phaser.Math.Between(0, BASE_WIDTH);
      y = BASE_HEIGHT;
      break;
  }

  const isBoss = score > 0 && score % 20 === 0;
  const enemy = enemies.create(x, y, "pixel");

  if (isBoss) {
    enemy.setDisplaySize(48, 48).setTint(0xff8800);
    enemy.setCircle(24);
    enemy.setData("health", 5 + Math.floor(score / 20));
    enemy.setData("speed", 80 + score * 2);
  } else {
    enemy.setDisplaySize(24, 24).setTint(0xff0000);
    enemy.setCircle(12);
    enemy.setData("health", 1);
    enemy.setData("speed", 100 + score * 3);
  }
}

function bulletHitEnemy(bullet, enemy) {
  bullet.setActive(false);
  bullet.setVisible(false);

  const remaining = (enemy.getData("health") || 1) - (bullet.damage || bulletDamage);

  if (remaining <= 0) {
    enemy.destroy();

    score += 1;
    scoreText.setText(`Score: ${score}`);

    // Spawn an XP gem
    const gem = gems.create(enemy.x, enemy.y, "pixel");
    gem.setDisplaySize(12, 12).setTint(0x00ffff);
    gem.setCircle(6);
    gem.setData("value", 1);
  } else {
    enemy.setData("health", remaining);
  }
}

function enemyHitPlayer(playerSprite, enemy) {
  enemy.destroy();
  health -= 1;
  healthText.setText(`Health: ${health}`);

  // Flash effect
  playerSprite.setTint(0xffaaaa);
  game.scene.scenes[0].time.addEvent({
    delay: 100,
    callback: () => playerSprite.clearTint(),
  });

  if (health <= 0) {
    endGame();
  }
}

function collectGem(playerSprite, gem) {
  xp += gem.getData("value") || 1;
  gem.destroy();
  xpText.setText(`XP: ${xp} / ${LEVEL_THRESHOLDS[level - 1] || "∞"}`);
  checkLevelUp.call(this);
}

function checkLevelUp() {
  if (level <= LEVEL_THRESHOLDS.length && xp >= LEVEL_THRESHOLDS[level - 1]) {
    level += 1;
    fireRate = Math.max(100, fireRate - 20);
    bulletSpeed += 50;
    if (level % 3 === 0) bulletDamage += 1;

    const popup = this.add
      .text(BASE_WIDTH / 2, BASE_HEIGHT / 2, `Level ${level}!`, {
        font: "32px Arial",
        fill: "#ffff00",
      })
      .setOrigin(0.5);

    this.tweens.add({
      targets: popup,
      alpha: 0,
      duration: 1500,
      ease: "Cubic.easeOut",
      onComplete: () => popup.destroy(),
    });
  }
}

function endGame() {
  game.scene.pause();
  TelegramGameProxy.gameOver(score);
  if (TelegramGameProxy && TelegramGameProxy.shareScore) {
    TelegramGameProxy.shareScore(score, () => {});
  }
}

// Resize the game if the iPhone rotates or the window size changes.
window.addEventListener("resize", () => {
  game.scale.refresh();
});

// Telegram WebApp (mini‑app) initialization
if (window.Telegram && Telegram.WebApp && Telegram.WebApp.ready && Telegram.WebApp.expand) {
  Telegram.WebApp.ready();
  Telegram.WebApp.expand();
  console.log("Telegram WebApp initialized.");
} else {
  console.log("Telegram WebApp API not found or not ready.");
} 