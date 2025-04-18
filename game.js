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
let particles = [];
let particleEmitters = [];
let backgroundStars = [];
let gameContainer;

// Input handling
let keys = {};
let pointerDown = false;
let dragStart = { x: 0, y: 0 };
let dragVector = { x: 0, y: 0 };

// Assets and resources
const COLORS = {
  PLAYER: 0x44aaff,
  PLAYER_GLOW: 0x0066cc,
  BULLET: 0xffff00,
  BULLET_GLOW: 0xff6600,
  ENEMY: 0xff3333,
  ENEMY_GLOW: 0xcc0000,
  BOSS: 0xff6600,
  BOSS_GLOW: 0xcc3300,
  GEM: 0x00ffff,
  GEM_GLOW: 0x00cccc,
  TEXT: 0xffffff,
  LEVEL_UP: 0xffff00,
  DAMAGE: 0xff0000,
  BACKGROUND: 0x111122
};

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
  backgroundColor: COLORS.BACKGROUND,
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
// Create a starfield background
function createStarfield() {
  const stars = new PIXI.Container();
  app.stage.addChild(stars);
  
  // Create 3 layers of stars with different speeds and sizes
  for (let layer = 0; layer < 3; layer++) {
    const count = 50 - layer * 15; // Fewer stars in closer layers
    const speed = 0.2 + layer * 0.3; // Closer layers move faster
    const size = 1 + layer * 1; // Closer layers have bigger stars
    const alpha = 0.5 + layer * 0.2; // Closer layers are brighter
    
    for (let i = 0; i < count; i++) {
      const star = new PIXI.Graphics();
      star.beginFill(0xffffff, alpha);
      star.drawCircle(0, 0, size);
      star.endFill();
      star.x = Math.random() * BASE_WIDTH;
      star.y = Math.random() * BASE_HEIGHT;
      star.speed = speed;
      star.layer = layer;
      
      stars.addChild(star);
      backgroundStars.push(star);
    }
  }
  
  return stars;
}

// Update starfield animation
function updateStarfield(delta) {
  backgroundStars.forEach(star => {
    star.y += star.speed * delta;
    if (star.y > BASE_HEIGHT) {
      star.y = -5;
      star.x = Math.random() * BASE_WIDTH;
    }
  });
}

// Create an enhanced sprite with glow effect
function createEnhancedSprite(x, y, radius, mainColor, glowColor, type = 'circle') {
  const container = new PIXI.Container();
  container.x = x;
  container.y = y;
  
  // Main sprite
  const sprite = new PIXI.Graphics();
  
  // Add glow/shadow first (drawn underneath)
  sprite.beginFill(glowColor, 0.4);
  if (type === 'circle') {
    sprite.drawCircle(0, 0, radius * 1.2);
  } else if (type === 'triangle') {
    drawPolygon(sprite, 3, radius * 1.2, 0);
  } else if (type === 'square') {
    sprite.drawRect(-radius * 1.2, -radius * 1.2, radius * 2.4, radius * 2.4);
  } else if (type === 'diamond') {
    drawPolygon(sprite, 4, radius * 1.2, Math.PI/4);
  } else if (type === 'pentagon') {
    drawPolygon(sprite, 5, radius * 1.2, 0);
  }
  sprite.endFill();
  
  // Main shape
  sprite.beginFill(mainColor);
  if (type === 'circle') {
    sprite.drawCircle(0, 0, radius);
  } else if (type === 'triangle') {
    drawPolygon(sprite, 3, radius, 0);
  } else if (type === 'square') {
    sprite.drawRect(-radius, -radius, radius * 2, radius * 2);
  } else if (type === 'diamond') {
    drawPolygon(sprite, 4, radius, Math.PI/4);
  } else if (type === 'pentagon') {
    drawPolygon(sprite, 5, radius, 0);
  }
  sprite.endFill();
  
  // Inner detail
  sprite.beginFill(0xffffff, 0.5);
  if (type === 'circle') {
    sprite.drawCircle(-radius/4, -radius/4, radius/4);
  } else if (type === 'triangle' || type === 'square' || type === 'diamond' || type === 'pentagon') {
    sprite.drawCircle(-radius/4, -radius/4, radius/5);
  }
  sprite.endFill();
  
  container.addChild(sprite);
  container.radius = radius;
  container.mainSprite = sprite;
  
  // Add pulse animation
  container.pulseTime = Math.random() * Math.PI * 2;
  
  return container;
}

// Draw a regular polygon
function drawPolygon(graphics, sides, radius, startAngle = 0) {
  const points = [];
  for (let i = 0; i < sides; i++) {
    const angle = startAngle + (i / sides) * Math.PI * 2;
    points.push(
      Math.cos(angle) * radius,
      Math.sin(angle) * radius
    );
  }
  graphics.drawPolygon(points);
}

// Create text with enhanced styling
function createStyledText(text, x, y, options = {}) {
  const style = {
    fontFamily: 'Arial, sans-serif',
    fontSize: options.fontSize || 20,
    fontWeight: options.bold ? 'bold' : 'normal',
    fill: options.color || COLORS.TEXT,
    align: options.align || 'left',
    stroke: options.strokeColor || COLORS.BACKGROUND,
    strokeThickness: options.strokeThickness || 3,
    dropShadow: options.dropShadow !== undefined ? options.dropShadow : true,
    dropShadowColor: options.dropShadowColor || '#000000',
    dropShadowBlur: options.dropShadowBlur || 4,
    dropShadowAngle: Math.PI / 6,
    dropShadowDistance: 3,
  };
  
  const textSprite = new PIXI.Text(text, style);
  textSprite.x = x;
  textSprite.y = y;
  
  if (options.anchor) {
    textSprite.anchor.set(options.anchor.x || 0, options.anchor.y || 0);
  }
  
  return textSprite;
}

// Create a particle effect
function createParticles(x, y, options = {}) {
  const count = options.count || 10;
  const color = options.color || 0xffffff;
  const speed = options.speed || 2;
  const size = options.size || 2;
  const lifetime = options.lifetime || 30;
  
  for (let i = 0; i < count; i++) {
    const particle = new PIXI.Graphics();
    particle.beginFill(color);
    particle.drawCircle(0, 0, size);
    particle.endFill();
    
    particle.x = x;
    particle.y = y;
    
    // Random direction
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * speed;
    
    particle.vx = Math.cos(angle) * distance;
    particle.vy = Math.sin(angle) * distance;
    particle.lifetime = lifetime;
    particle.alpha = 1;
    
    app.stage.addChild(particle);
    particles.push(particle);
  }
}

// Update particles
function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const particle = particles[i];
    
    particle.x += particle.vx;
    particle.y += particle.vy;
    particle.lifetime--;
    particle.alpha = particle.lifetime / 30;
    
    if (particle.lifetime <= 0) {
      app.stage.removeChild(particle);
      particles.splice(i, 1);
    }
  }
}

// Apply pulse animation to a sprite
function pulseSprite(sprite, time) {
  if (!sprite || !sprite.pulseTime) return;
  
  sprite.pulseTime += 0.05;
  const scale = 1 + Math.sin(sprite.pulseTime) * 0.05;
  sprite.scale.set(scale);
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
      y = -20;
      break;
    case 1: // right
      x = BASE_WIDTH + 20;
      y = Math.random() * BASE_HEIGHT;
      break;
    case 2: // bottom
      x = Math.random() * BASE_WIDTH;
      y = BASE_HEIGHT + 20;
      break;
    case 3: // left
      x = -20;
      y = Math.random() * BASE_HEIGHT;
      break;
  }
  
  return { x, y };
}

// ========== GAME OBJECT CREATION ==========
// Create a new bullet
function createBullet(x, y, targetX, targetY) {
  const bullet = createEnhancedSprite(x, y, 4, COLORS.BULLET, COLORS.BULLET_GLOW, 'circle');
  
  // Calculate direction and velocity
  const angle = Math.atan2(targetY - y, targetX - x);
  bullet.vx = Math.cos(angle) * bulletSpeed / 60;
  bullet.vy = Math.sin(angle) * bulletSpeed / 60;
  
  bullet.lifespan = 1000; // milliseconds
  bullet.damage = bulletDamage;
  gameContainer.addChild(bullet);
  bullets.push(bullet);
  
  // Create muzzle flash effect
  createParticles(x, y, {
    count: 5,
    color: COLORS.BULLET,
    speed: 1,
    size: 2,
    lifetime: 10
  });
  
  return bullet;
}

// Create a new enemy
function createEnemy() {
  const pos = getRandomEdgePosition();
  const isBoss = score > 0 && score % 20 === 0;
  
  // Choose type based on score and boss status
  let enemyType = 'circle';
  if (isBoss) {
    enemyType = 'pentagon';
  } else if (score > 50) {
    const types = ['circle', 'triangle', 'square', 'diamond'];
    enemyType = types[Math.floor(Math.random() * types.length)];
  } else if (score > 20) {
    const types = ['circle', 'triangle', 'square'];
    enemyType = types[Math.floor(Math.random() * types.length)];
  } else if (score > 5) {
    const types = ['circle', 'triangle'];
    enemyType = types[Math.floor(Math.random() * types.length)];
  }
  
  const size = isBoss ? 24 : 12;
  const color = isBoss ? COLORS.BOSS : COLORS.ENEMY;
  const glowColor = isBoss ? COLORS.BOSS_GLOW : COLORS.ENEMY_GLOW;
  
  const enemy = createEnhancedSprite(pos.x, pos.y, size, color, glowColor, enemyType);
  
  enemy.health = isBoss ? 5 + Math.floor(score / 20) : 1;
  enemy.speed = (isBoss ? 80 : 100) + score * 3;
  enemy.maxHealth = enemy.health;
  enemy.isBoss = isBoss;
  
  // Add health bar for bosses
  if (isBoss) {
    const healthBar = new PIXI.Container();
    healthBar.y = -size - 10;
    
    const barBack = new PIXI.Graphics();
    barBack.beginFill(0x000000, 0.5);
    barBack.drawRect(-size, 0, size * 2, 5);
    barBack.endFill();
    
    const barFill = new PIXI.Graphics();
    barFill.beginFill(0xff0000);
    barFill.drawRect(-size, 0, size * 2, 5);
    barFill.endFill();
    
    healthBar.addChild(barBack);
    healthBar.addChild(barFill);
    healthBar.barFill = barFill;
    
    enemy.addChild(healthBar);
    enemy.healthBar = healthBar;
  }
  
  gameContainer.addChild(enemy);
  enemies.push(enemy);
  
  return enemy;
}

// Create an XP gem at given position
function createGem(x, y) {
  const gem = createEnhancedSprite(x, y, 6, COLORS.GEM, COLORS.GEM_GLOW, 'diamond');
  gem.value = 1;
  
  // Add floating animation
  gem.floatTime = Math.random() * Math.PI * 2;
  gem.baseY = y;
  
  gameContainer.addChild(gem);
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
    
    // Create movement particles
    if (Math.random() > 0.8) {
      createParticles(
        player.x - vx * 2, 
        player.y - vy * 2, 
        {
          count: 1,
          color: COLORS.PLAYER_GLOW,
          speed: 0.5,
          size: 3,
          lifetime: 20
        }
      );
    }
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
    
    // Create trail particles occasionally
    if (Math.random() > 0.7) {
      createParticles(bullet.x, bullet.y, {
        count: 1,
        color: COLORS.BULLET_GLOW,
        speed: 0.2,
        size: 2,
        lifetime: 10
      });
    }
    
    // Pulse animation
    pulseSprite(bullet, timestamp);
    
    // Check if bullet is out of bounds
    if (bullet.x < -bullet.radius || bullet.x > BASE_WIDTH + bullet.radius || 
        bullet.y < -bullet.radius || bullet.y > BASE_HEIGHT + bullet.radius) {
      bullet.visible = false;
      gameContainer.removeChild(bullet);
      bullets.splice(i, 1);
      continue;
    }
    
    // Check if bullet hit an enemy
    for (let j = enemies.length - 1; j >= 0; j--) {
      const enemy = enemies[j];
      if (!enemy.visible) continue;
      
      if (checkCollision(bullet, enemy)) {
        bullet.visible = false;
        gameContainer.removeChild(bullet);
        bullets.splice(i, 1);
        
        // Create hit effect
        createParticles(bullet.x, bullet.y, {
          count: 10,
          color: COLORS.BULLET,
          speed: 3,
          size: 2,
          lifetime: 20
        });
        
        enemy.health -= bullet.damage;
        
        // Show damage number
        const damageText = createStyledText(`-${bullet.damage}`, enemy.x, enemy.y - 20, {
          fontSize: 14,
          color: COLORS.DAMAGE,
          bold: true,
          anchor: { x: 0.5, y: 0.5 }
        });
        
        app.stage.addChild(damageText);
        
        // Animate damage text
        damageText.vy = -2;
        damageText.lifetime = 20;
        const updateDamageText = () => {
          damageText.y += damageText.vy;
          damageText.lifetime--;
          damageText.alpha = damageText.lifetime / 20;
          
          if (damageText.lifetime <= 0) {
            app.stage.removeChild(damageText);
            app.ticker.remove(updateDamageText);
          }
        };
        
        app.ticker.add(updateDamageText);
        
        // Update boss health bar
        if (enemy.isBoss && enemy.healthBar) {
          const healthPercent = enemy.health / enemy.maxHealth;
          enemy.healthBar.barFill.width = enemy.radius * 2 * healthPercent;
        }
        
        if (enemy.health <= 0) {
          // Create death explosion effect
          createParticles(enemy.x, enemy.y, {
            count: 30,
            color: enemy.isBoss ? COLORS.BOSS : COLORS.ENEMY,
            speed: 5,
            size: 3,
            lifetime: 40
          });
          
          // Create gem at enemy position
          createGem(enemy.x, enemy.y);
          
          // Increase score
          score++;
          texts.score.text = `Score: ${score}`;
          
          // Remove enemy
          enemy.visible = false;
          gameContainer.removeChild(enemy);
          enemies.splice(j, 1);
        }
        
        break;
      }
    }
    
    // Update bullet lifespan
    bullet.lifespan -= delta * 16.67; // Convert from frames to ms
    if (bullet.lifespan <= 0) {
      bullet.visible = false;
      gameContainer.removeChild(bullet);
      bullets.splice(i, 1);
    }
  }
}

// Update all enemies
function updateEnemies(delta, timestamp) {
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
      
      // Create trail particles occasionally for bosses
      if (enemy.isBoss && Math.random() > 0.9) {
        createParticles(enemy.x, enemy.y, {
          count: 1,
          color: COLORS.BOSS_GLOW,
          speed: 0.2,
          size: 3,
          lifetime: 20
        });
      }
    }
    
    // Pulse animation
    pulseSprite(enemy, timestamp);
    
    // Check if enemy collides with player
    if (checkCollision(enemy, player)) {
      health--;
      texts.health.text = `Health: ${health}`;
      
      // Create hit effect
      createParticles(player.x, player.y, {
        count: 20,
        color: COLORS.DAMAGE,
        speed: 3,
        size: 2,
        lifetime: 30
      });
      
      // Flash effect
      player.alpha = 0.5;
      setTimeout(() => { player.alpha = 1; }, 100);
      
      // Remove enemy
      enemy.visible = false;
      gameContainer.removeChild(enemy);
      enemies.splice(i, 1);
      
      if (health <= 0) {
        endGame();
      }
    }
  }
}

// Update all gems
function updateGems(delta, timestamp) {
  for (let i = gems.length - 1; i >= 0; i--) {
    const gem = gems[i];
    if (!gem.visible) continue;
    
    // Floating animation
    gem.floatTime += 0.05;
    gem.y = gem.baseY + Math.sin(gem.floatTime) * 2;
    
    // Pulse animation
    pulseSprite(gem, timestamp);
    
    // Check if player collects gem
    if (checkCollision(gem, player)) {
      xp += gem.value;
      texts.xp.text = `XP: ${xp} / ${LEVEL_THRESHOLDS[level - 1] || "∞"}`;
      
      // Create collection effect
      createParticles(gem.x, gem.y, {
        count: 15,
        color: COLORS.GEM,
        speed: 2,
        size: 2,
        lifetime: 20
      });
      
      // Remove gem
      gem.visible = false;
      gameContainer.removeChild(gem);
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
    
    // Create level up particles
    createParticles(player.x, player.y, {
      count: 50,
      color: COLORS.LEVEL_UP,
      speed: 5,
      size: 3,
      lifetime: 60
    });
    
    // Show level up text
    const levelText = createStyledText(`Level ${level}!`, BASE_WIDTH / 2, BASE_HEIGHT / 2, {
      fontSize: 40,
      color: COLORS.LEVEL_UP,
      bold: true,
      anchor: { x: 0.5, y: 0.5 },
      strokeThickness: 5
    });
    
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
  // Create big explosion
  createParticles(player.x, player.y, {
    count: 100,
    color: COLORS.PLAYER,
    speed: 8,
    size: 4,
    lifetime: 80
  });
  
  // Show game over text
  const gameOverText = createStyledText("GAME OVER", BASE_WIDTH / 2, BASE_HEIGHT / 2 - 40, {
    fontSize: 60,
    color: COLORS.DAMAGE,
    bold: true,
    anchor: { x: 0.5, y: 0.5 },
    strokeThickness: 8
  });
  
  const scoreText = createStyledText(`Final Score: ${score}`, BASE_WIDTH / 2, BASE_HEIGHT / 2 + 30, {
    fontSize: 30,
    color: COLORS.TEXT,
    bold: true,
    anchor: { x: 0.5, y: 0.5 }
  });
  
  app.stage.addChild(gameOverText);
  app.stage.addChild(scoreText);
  
  // Stop the game but keep showing the explosion
  const finalParticleUpdate = () => {
    updateParticles();
    
    // Once all particles are gone, completely stop
    if (particles.length === 0) {
      app.ticker.remove(finalParticleUpdate);
      app.ticker.stop();
      
      // Send score to Telegram after a short delay
      setTimeout(() => {
        TelegramGameProxy.gameOver(score);
        if (TelegramGameProxy.shareScore) {
          TelegramGameProxy.shareScore(score, () => {});
        }
      }, 1000);
    }
  };
  
  // Remove player and disable controls
  gameContainer.removeChild(player);
  player.visible = false;
  pointerDown = false;
  keys = {};
  
  // Switch to just updating particles
  app.ticker.remove(gameLoop);
  app.ticker.add(finalParticleUpdate);
}

// ========== SETUP & INITIALIZATION ==========
// Main game loop
function gameLoop(delta) {
  const timestamp = Date.now();
  
  // Update background
  updateStarfield(delta);
  
  // Handle input & movement
  handlePlayerMovement(delta);
  
  // Auto fire at enemies
  autoFire(timestamp);
  
  // Update game objects
  updateBullets(delta, timestamp);
  updateEnemies(delta, timestamp);
  updateGems(delta, timestamp);
  updateParticles();
  
  // Pulse animation for player
  pulseSprite(player, timestamp);
}

// Initialize game
function init() {
  // Create main game container
  gameContainer = new PIXI.Container();
  app.stage.addChild(gameContainer);
  
  // Create starfield background
  createStarfield();
  
  // Create player
  player = createEnhancedSprite(BASE_WIDTH / 2, BASE_HEIGHT / 2, 16, COLORS.PLAYER, COLORS.PLAYER_GLOW, 'triangle');
  gameContainer.addChild(player);
  
  // Create game UI container
  const uiContainer = new PIXI.Container();
  app.stage.addChild(uiContainer);
  
  // Create UI text
  texts.score = createStyledText(`Score: ${score}`, 10, 10);
  uiContainer.addChild(texts.score);
  
  texts.health = createStyledText(`Health: ${health}`, 10, 40);
  uiContainer.addChild(texts.health);
  
  texts.xp = createStyledText(`XP: ${xp} / ${LEVEL_THRESHOLDS[0]}`, 10, 70);
  uiContainer.addChild(texts.xp);
  
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
    if (enemies.length < 50) { // Limit maximum enemies
      createEnemy();
    }
  }, 1000);
  
  // Start game loop
  app.ticker.add(gameLoop);
  
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