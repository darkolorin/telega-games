// ========== GAME CONSTANTS ==========
const BASE_WIDTH = 800;
const BASE_HEIGHT = 600;

// ========== GAME VARIABLES ==========
// Game state
let score = 0;
let health = 5;
let xp = 0;
let level = 1;
const LEVEL_THRESHOLDS = [5, 15, 30, 50, 80];
let lastFireTime = 0;
let fireRate = 300; // milliseconds between shots
let bulletSpeed = 500;
let bulletDamage = 1;

// Game objects
let player;
let bullets = [];
let enemies = [];
let gems = [];
let texts = {};

// Input handling
let keys = {};
let pointerDown = false;
let dragStart = { x: 0, y: 0 };
let dragVector = { x: 0, y: 0 };

// ========== TELEGRAM INTEGRATION ==========
// Stub TelegramGameProxy for testing outside of Telegram
if (typeof window.TelegramGameProxy === "undefined") {
  window.TelegramGameProxy = {
    init: () => {},
    gameOver: (score) => {
      alert(`Game over! Your score: ${score}`);
    },
  };
  console.log("TelegramGameProxy stubbed (running outside Telegram).");
}

// ========== PIXI SETUP ==========
// Create PixiJS application
const app = new PIXI.Application({
  width: BASE_WIDTH,
  height: BASE_HEIGHT,
  backgroundColor: 0x1d1d1d,
  antialias: true,
  resolution: window.devicePixelRatio || 1,
  autoDensity: true
});

// Add the canvas to the HTML document
document.getElementById('game-container').appendChild(app.view);

// Scale for different screen sizes
function resize() {
  const gameContainer = document.getElementById('game-container');
  const gameRatio = BASE_WIDTH / BASE_HEIGHT;
  const windowRatio = gameContainer.clientWidth / gameContainer.clientHeight;
  
  if (windowRatio > gameRatio) {
    // Window is wider than game ratio
    const scale = gameContainer.clientHeight / BASE_HEIGHT;
    app.renderer.resize(BASE_HEIGHT * windowRatio, BASE_HEIGHT);
    app.stage.scale.set(scale);
  } else {
    // Window is taller than game ratio
    const scale = gameContainer.clientWidth / BASE_WIDTH;
    app.renderer.resize(BASE_WIDTH, BASE_WIDTH / windowRatio);
    app.stage.scale.set(scale);
  }
}

// Handle window resize
window.addEventListener('resize', resize);

// ========== HELPER FUNCTIONS ==========
// Create a simple colored rectangle
function createRect(x, y, width, height, color) {
  const rect = new PIXI.Graphics();
  rect.beginFill(color);
  rect.drawRect(0, 0, width, height);
  rect.endFill();
  rect.x = x;
  rect.y = y;
  rect.width = width;
  rect.height = height;
  rect.pivot.x = width / 2;
  rect.pivot.y = height / 2;
  return rect;
}

// Create a simple colored circle
function createCircle(x, y, radius, color) {
  const circle = new PIXI.Graphics();
  circle.beginFill(color);
  circle.drawCircle(0, 0, radius);
  circle.endFill();
  circle.x = x;
  circle.y = y;
  circle.radius = radius;
  return circle;
}

// Check collision between two circular objects
function checkCollision(obj1, obj2) {
  if (!obj1 || !obj2 || !obj1.visible || !obj2.visible) return false;
  
  const dx = obj1.x - obj2.x;
  const dy = obj1.y - obj2.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const radius1 = obj1.radius || obj1.width / 2;
  const radius2 = obj2.radius || obj2.width / 2;
  
  return distance < radius1 + radius2;
}

// Generate a random position at the edge of the screen
function getRandomEdgePosition() {
  const edge = Math.floor(Math.random() * 4);
  let x, y;
  
  switch (edge) {
    case 0: // top
      x = Math.random() * BASE_WIDTH;
      y = 0;
      break;
    case 1: // right
      x = BASE_WIDTH;
      y = Math.random() * BASE_HEIGHT;
      break;
    case 2: // bottom
      x = Math.random() * BASE_WIDTH;
      y = BASE_HEIGHT;
      break;
    case 3: // left
      x = 0;
      y = Math.random() * BASE_HEIGHT;
      break;
  }
  
  return { x, y };
}

// ========== GAME OBJECT CREATION ==========
// Create a new bullet
function createBullet(x, y, targetX, targetY) {
  const bullet = createCircle(x, y, 4, 0xffff00);
  
  // Calculate direction and velocity
  const angle = Math.atan2(targetY - y, targetX - x);
  bullet.vx = Math.cos(angle) * bulletSpeed / 60;
  bullet.vy = Math.sin(angle) * bulletSpeed / 60;
  
  bullet.lifespan = 1000; // milliseconds
  bullet.damage = bulletDamage;
  app.stage.addChild(bullet);
  bullets.push(bullet);
  
  return bullet;
}

// Create a new enemy
function createEnemy() {
  const pos = getRandomEdgePosition();
  const isBoss = score > 0 && score % 20 === 0;
  
  const size = isBoss ? 24 : 12;
  const color = isBoss ? 0xff8800 : 0xff0000;
  const enemy = createCircle(pos.x, pos.y, size, color);
  
  enemy.health = isBoss ? 5 + Math.floor(score / 20) : 1;
  enemy.speed = (isBoss ? 80 : 100) + score * 3;
  
  app.stage.addChild(enemy);
  enemies.push(enemy);
  
  return enemy;
}

// Create an XP gem at given position
function createGem(x, y) {
  const gem = createCircle(x, y, 6, 0x00ffff);
  gem.value = 1;
  
  app.stage.addChild(gem);
  gems.push(gem);
  
  return gem;
}

// ========== GAME LOGIC ==========
// Handle player movement input
function handlePlayerMovement(delta) {
  const speed = 250 / 60 * delta;
  let vx = 0;
  let vy = 0;
  
  // Handle touch/drag controls
  if (pointerDown && (Math.abs(dragVector.x) > 2 || Math.abs(dragVector.y) > 2)) {
    const length = Math.sqrt(dragVector.x * dragVector.x + dragVector.y * dragVector.y);
    vx = dragVector.x / length * speed;
    vy = dragVector.y / length * speed;
  } 
  // Handle keyboard controls
  else {
    if (keys['ArrowLeft'] || keys['a'] || keys['A']) vx -= speed;
    if (keys['ArrowRight'] || keys['d'] || keys['D']) vx += speed;
    if (keys['ArrowUp'] || keys['w'] || keys['W']) vy -= speed;
    if (keys['ArrowDown'] || keys['s'] || keys['S']) vy += speed;
  }
  
  // Apply movement
  if (vx !== 0 || vy !== 0) {
    player.x += vx;
    player.y += vy;
    
    // Keep player inside bounds
    player.x = Math.max(player.radius, Math.min(BASE_WIDTH - player.radius, player.x));
    player.y = Math.max(player.radius, Math.min(BASE_HEIGHT - player.radius, player.y));
  }
}

// Auto-fire at nearest enemy
function autoFire(timestamp) {
  if (timestamp < lastFireTime + fireRate || enemies.length === 0) return;
  
  // Find closest enemy
  let closestEnemy = null;
  let minDist = Infinity;
  
  for (let enemy of enemies) {
    if (!enemy.visible) continue;
    
    const dx = enemy.x - player.x;
    const dy = enemy.y - player.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist < minDist) {
      minDist = dist;
      closestEnemy = enemy;
    }
  }
  
  if (closestEnemy) {
    createBullet(player.x, player.y, closestEnemy.x, closestEnemy.y);
    lastFireTime = timestamp;
  }
}

// Update all bullets
function updateBullets(delta, timestamp) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const bullet = bullets[i];
    
    if (!bullet.visible) continue;
    
    // Move bullet
    bullet.x += bullet.vx * delta;
    bullet.y += bullet.vy * delta;
    
    // Check if bullet is out of bounds
    if (bullet.x < -bullet.radius || bullet.x > BASE_WIDTH + bullet.radius || 
        bullet.y < -bullet.radius || bullet.y > BASE_HEIGHT + bullet.radius) {
      bullet.visible = false;
      app.stage.removeChild(bullet);
      bullets.splice(i, 1);
      continue;
    }
    
    // Check if bullet hit an enemy
    for (let j = enemies.length - 1; j >= 0; j--) {
      const enemy = enemies[j];
      if (!enemy.visible) continue;
      
      if (checkCollision(bullet, enemy)) {
        bullet.visible = false;
        app.stage.removeChild(bullet);
        bullets.splice(i, 1);
        
        enemy.health -= bullet.damage;
        
        if (enemy.health <= 0) {
          // Create gem at enemy position
          createGem(enemy.x, enemy.y);
          
          // Increase score
          score++;
          texts.score.text = `Score: ${score}`;
          
          // Remove enemy
          enemy.visible = false;
          app.stage.removeChild(enemy);
          enemies.splice(j, 1);
        }
        
        break;
      }
    }
    
    // Update bullet lifespan
    bullet.lifespan -= delta * 16.67; // Convert from frames to ms
    if (bullet.lifespan <= 0) {
      bullet.visible = false;
      app.stage.removeChild(bullet);
      bullets.splice(i, 1);
    }
  }
}

// Update all enemies
function updateEnemies(delta) {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i];
    if (!enemy.visible) continue;
    
    // Move enemy towards player
    const speed = enemy.speed / 60 * delta;
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist > 0) {
      enemy.x += (dx / dist) * speed;
      enemy.y += (dy / dist) * speed;
    }
    
    // Check if enemy collides with player
    if (checkCollision(enemy, player)) {
      health--;
      texts.health.text = `Health: ${health}`;
      
      // Flash effect
      player.tint = 0xffaaaa;
      setTimeout(() => { player.tint = 0x00ff00; }, 100);
      
      // Remove enemy
      enemy.visible = false;
      app.stage.removeChild(enemy);
      enemies.splice(i, 1);
      
      if (health <= 0) {
        endGame();
      }
    }
  }
}

// Update all gems
function updateGems() {
  for (let i = gems.length - 1; i >= 0; i--) {
    const gem = gems[i];
    if (!gem.visible) continue;
    
    // Check if player collects gem
    if (checkCollision(gem, player)) {
      xp += gem.value;
      texts.xp.text = `XP: ${xp} / ${LEVEL_THRESHOLDS[level - 1] || "∞"}`;
      
      // Remove gem
      gem.visible = false;
      app.stage.removeChild(gem);
      gems.splice(i, 1);
      
      // Check for level up
      checkLevelUp();
    }
  }
}

// Check if player level up
function checkLevelUp() {
  if (level <= LEVEL_THRESHOLDS.length && xp >= LEVEL_THRESHOLDS[level - 1]) {
    level++;
    
    // Improve player stats
    fireRate = Math.max(100, fireRate - 20);
    bulletSpeed += 50;
    if (level % 3 === 0) bulletDamage += 1;
    
    // Show level up text
    const levelText = new PIXI.Text(`Level ${level}!`, { 
      fontFamily: 'Arial', 
      fontSize: 32, 
      fill: 0xffff00 
    });
    levelText.anchor.set(0.5);
    levelText.x = BASE_WIDTH / 2;
    levelText.y = BASE_HEIGHT / 2;
    app.stage.addChild(levelText);
    
    // Fade out level text
    let alpha = 1;
    const fadeInterval = setInterval(() => {
      alpha -= 0.05;
      levelText.alpha = alpha;
      
      if (alpha <= 0) {
        clearInterval(fadeInterval);
        app.stage.removeChild(levelText);
      }
    }, 100);
  }
}

// End the game
function endGame() {
  app.ticker.stop();
  
  TelegramGameProxy.gameOver(score);
  if (TelegramGameProxy.shareScore) {
    TelegramGameProxy.shareScore(score, () => {});
  }
}

// ========== SETUP & INITIALIZATION ==========
// Initialize game
function init() {
  // Create player
  player = createCircle(BASE_WIDTH / 2, BASE_HEIGHT / 2, 16, 0x00ff00);
  app.stage.addChild(player);
  
  // Create UI text
  texts.score = new PIXI.Text(`Score: ${score}`, { fontFamily: 'Arial', fontSize: 20, fill: 0xffffff });
  texts.score.x = 10;
  texts.score.y = 10;
  app.stage.addChild(texts.score);
  
  texts.health = new PIXI.Text(`Health: ${health}`, { fontFamily: 'Arial', fontSize: 20, fill: 0xffffff });
  texts.health.x = 10;
  texts.health.y = 35;
  app.stage.addChild(texts.health);
  
  texts.xp = new PIXI.Text(`XP: ${xp} / ${LEVEL_THRESHOLDS[0]}`, { fontFamily: 'Arial', fontSize: 20, fill: 0xffffff });
  texts.xp.x = 10;
  texts.xp.y = 60;
  app.stage.addChild(texts.xp);
  
  // Setup keyboard input
  window.addEventListener('keydown', (e) => { keys[e.key] = true; });
  window.addEventListener('keyup', (e) => { keys[e.key] = false; });
  
  // Setup touch/mouse input
  app.view.addEventListener('pointerdown', (e) => {
    pointerDown = true;
    dragStart.x = e.clientX;
    dragStart.y = e.clientY;
  });
  
  app.view.addEventListener('pointermove', (e) => {
    if (pointerDown) {
      dragVector.x = e.clientX - dragStart.x;
      dragVector.y = e.clientY - dragStart.y;
    }
  });
  
  app.view.addEventListener('pointerup', () => {
    pointerDown = false;
    dragVector.x = 0;
    dragVector.y = 0;
  });
  
  // Spawn enemies on interval
  setInterval(() => {
    createEnemy();
  }, 1000);
  
  // Main game loop
  let lastTimestamp = 0;
  app.ticker.add((delta) => {
    const timestamp = Date.now();
    
    // Handle input & movement
    handlePlayerMovement(delta);
    
    // Auto fire at enemies
    autoFire(timestamp);
    
    // Update game objects
    updateBullets(delta, timestamp);
    updateEnemies(delta);
    updateGems();
    
    lastTimestamp = timestamp;
  });
  
  // Initialize Telegram WebApp
  if (window.Telegram && Telegram.WebApp) {
    if (Telegram.WebApp.ready) Telegram.WebApp.ready();
    if (Telegram.WebApp.expand) Telegram.WebApp.expand();
  }
  
  // Resize to fit screen
  resize();
}

// Start the game when the document is loaded
window.onload = init; 