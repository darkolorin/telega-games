// ========== TELEGRAM INTEGRATION ==========
// In the Telegram game environment, TelegramGameProxy is injected automatically.
// When running locally, we stub it so the game is still playable and debuggable.
// if (typeof window.TelegramGameProxy === "undefined") {
//   window.TelegramGameProxy = {
//     init: () => {},
//     gameOver: (score) => {
//       alert(`Game over! Your score: ${score}`);
//     },
//   };
//   console.log("TelegramGameProxy stubbed (running outside Telegram).");
// }

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
    default: 'matter',
    matter: { 
      gravity: { y: 0 },
      debug: false
    }
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

// === Category bits for Matter.js collision filtering ===
const CATEGORY = {
  PLAYER: 0x0001,
  ENEMY: 0x0002,
  BULLET: 0x0004,
  GEM: 0x0008
};

// A tiny 1×1 PNG (white pixel) encoded as Base64. We'll tint it for different sprites.
const WHITE_PIXEL_BASE64 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==";

function preload() {
  // Load the white pixel texture once; we'll reuse it for all game objects.
  this.load.image("pixel", WHITE_PIXEL_BASE64);
}

function create() {
  // Matter world bounds
  this.matter.world.setBounds(0, 0, BASE_WIDTH, BASE_HEIGHT);
  
  // Create the player sprite and configure physics.
  player = this.matter.add.image(BASE_WIDTH / 2, BASE_HEIGHT / 2, "pixel", null, {
    label: 'player',
    circleRadius: 16,
    frictionAir: 0.2,
    density: 0.001,
    collisionFilter: {
      category: CATEGORY.PLAYER,
      mask: CATEGORY.ENEMY | CATEGORY.GEM
    }
  });
  player.setDisplaySize(32, 32).setTint(0x00ff00);
  player.setFixedRotation();

  // Groups
  bullets = [];
  const maxBullets = 200;

  enemies = [];

  // Experience gems
  gems = [];

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

  // Matter.js collision handling
  this.matter.world.on('collisionstart', function (event, bodyA, bodyB) {
    const pairs = event.pairs;

    for (let i = 0; i < pairs.length; i++) {
      const bodyA = pairs[i].bodyA;
      const bodyB = pairs[i].bodyB;
      
      // Player hits an enemy
      if ((bodyA.gameObject === player && bodyB.label === 'enemy') ||
          (bodyB.gameObject === player && bodyA.label === 'enemy')) {
        const enemy = bodyA.label === 'enemy' ? bodyA.gameObject : bodyB.gameObject;
        enemyHitPlayer(player, enemy);
      }
      
      // Bullet hits an enemy
      if ((bodyA.label === 'bullet' && bodyB.label === 'enemy') ||
          (bodyB.label === 'bullet' && bodyA.label === 'enemy')) {
        const bullet = bodyA.label === 'bullet' ? bodyA.gameObject : bodyB.gameObject;
        const enemy = bodyA.label === 'enemy' ? bodyA.gameObject : bodyB.gameObject;
        bulletHitEnemy(bullet, enemy);
      }
      
      // Player hits a gem
      if ((bodyA.gameObject === player && bodyB.label === 'gem') ||
          (bodyB.gameObject === player && bodyA.label === 'gem')) {
        const gem = bodyA.label === 'gem' ? bodyA.gameObject : bodyB.gameObject;
        collectGem(player, gem);
      }
    }
  });

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
  // Move enemies toward player
  enemies.forEach((enemy) => {
    if (enemy && enemy.active) {
      const speed = enemy.getData("speed");
      const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, player.x, player.y);
      const vx = Math.cos(angle) * speed * 0.01;
      const vy = Math.sin(angle) * speed * 0.01;
      enemy.setVelocity(vx, vy);
    }
  });

  // Update bullets
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    if (b && b.active) {
      b.lifespan -= delta;
      if (b.lifespan <= 0) {
        b.destroy();
        bullets.splice(i, 1);
      }
    }
  }
}

/* =========================
 *  HELPER FUNCTIONS
 * ========================= */

function handlePlayerMovement() {
  const speed = 0.1;  // Adjust for Matter.js forces
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

  // Apply force to player
  player.setVelocity(vx * 10, vy * 10);
}

function autoFire(time) {
  if (time < lastFired + fireRate) return; // milliseconds between shots
  if (enemies.length === 0) return;

  // Target the closest enemy.
  let closestEnemy = null;
  let minDist = Infinity;
  enemies.forEach((enemy) => {
    if (!enemy || !enemy.active) return;
    const dist = Phaser.Math.Distance.Between(player.x, player.y, enemy.x, enemy.y);
    if (dist < minDist) {
      minDist = dist;
      closestEnemy = enemy;
    }
  });
  if (!closestEnemy) return;

  // Create bullet with Matter.js
  const angle = Phaser.Math.Angle.Between(
    player.x, player.y, closestEnemy.x, closestEnemy.y
  );
  
  const bullet = this.matter.add.image(player.x, player.y, "pixel", null, {
    label: 'bullet',
    circleRadius: 4,
    frictionAir: 0,
    density: 0.001,
    collisionFilter: {
      category: CATEGORY.BULLET,
      mask: CATEGORY.ENEMY
    }
  });
  
  bullet.setDisplaySize(8, 8).setTint(0xffff00);
  bullet.setVelocity(
    Math.cos(angle) * bulletSpeed * 0.05,
    Math.sin(angle) * bulletSpeed * 0.05
  );
  bullet.setFixedRotation();
  bullet.lifespan = 1000; // ms
  bullet.damage = bulletDamage;
  bullets.push(bullet);

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
  const size = isBoss ? 48 : 24;
  const radius = size / 2;
  const health = isBoss ? 5 + Math.floor(score / 20) : 1;
  const speed = isBoss ? 80 + score * 2 : 100 + score * 3;
  
  const enemy = this.matter.add.image(x, y, "pixel", null, {
    label: 'enemy',
    circleRadius: radius,
    frictionAir: 0.1,
    density: 0.002,
    collisionFilter: {
      category: CATEGORY.ENEMY,
      mask: CATEGORY.PLAYER | CATEGORY.BULLET
    }
  });

  if (isBoss) {
    enemy.setDisplaySize(48, 48).setTint(0xff8800);
    enemy.setData("health", health);
    enemy.setData("speed", speed);
  } else {
    enemy.setDisplaySize(24, 24).setTint(0xff0000);
    enemy.setData("health", health);
    enemy.setData("speed", speed);
  }
  
  enemy.setFixedRotation();
  enemies.push(enemy);
}

function bulletHitEnemy(bullet, enemy) {
  if (!bullet || !bullet.active || !enemy || !enemy.active) return;
  
  // Remove bullet
  bullet.destroy();
  const bulletIndex = bullets.indexOf(bullet);
  if (bulletIndex !== -1) bullets.splice(bulletIndex, 1);

  const remaining = (enemy.getData("health") || 1) - (bullet.damage || bulletDamage);

  if (remaining <= 0) {
    // Remove enemy
    const enemyPos = { x: enemy.x, y: enemy.y };
    enemy.destroy();
    const enemyIndex = enemies.indexOf(enemy);
    if (enemyIndex !== -1) enemies.splice(enemyIndex, 1);

    score += 1;
    scoreText.setText(`Score: ${score}`);

    // Spawn an XP gem
    const gem = this.matter.add.image(enemyPos.x, enemyPos.y, "pixel", null, {
      label: 'gem',
      circleRadius: 6,
      frictionAir: 0.1,
      isSensor: true, // Makes it not physically collide but still trigger collision events
      collisionFilter: {
        category: CATEGORY.GEM,
        mask: CATEGORY.PLAYER
      }
    });
    gem.setDisplaySize(12, 12).setTint(0x00ffff);
    gem.setData("value", 1);
    gems.push(gem);
  } else {
    enemy.setData("health", remaining);
  }
}

function enemyHitPlayer(playerSprite, enemy) {
  if (!enemy || !enemy.active) return;
  
  // Remove enemy
  enemy.destroy();
  const enemyIndex = enemies.indexOf(enemy);
  if (enemyIndex !== -1) enemies.splice(enemyIndex, 1);
  
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
  if (!gem || !gem.active) return;
  
  xp += gem.getData("value") || 1;
  
  // Remove gem
  gem.destroy();
  const gemIndex = gems.indexOf(gem);
  if (gemIndex !== -1) gems.splice(gemIndex, 1);
  
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
  // TelegramGameProxy.gameOver(score); // Commented out
  // if (TelegramGameProxy && TelegramGameProxy.shareScore) { // Commented out
  //   TelegramGameProxy.shareScore(score, () => {}); // Commented out
  // }
  alert(`Game over! Your score: ${score}`); // Simple alert fallback
}

// Resize the game if the iPhone rotates or the window size changes.
window.addEventListener("resize", () => {
  game.scale.refresh();
});

// Telegram WebApp (mini‑app) initialization
// if (window.Telegram && Telegram.WebApp && Telegram.WebApp.ready && Telegram.WebApp.expand) {
//   Telegram.WebApp.ready();
//   Telegram.WebApp.expand();
//   console.log("Telegram WebApp initialized.");
// } else {
//   console.log("Telegram WebApp API not found or not ready.");
// } 