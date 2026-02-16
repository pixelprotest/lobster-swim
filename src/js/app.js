/**
 * app.js - Main application (uses regular DOM, modular entities)
 */

import { Lobster, Hook, Cage, Bubble, GoldenFish, Net, Fork, Pearl, Seagull, BeachBall, Jellyfish, Starfish, Eel } from './entities/index.js';
import { Particle } from './entities/effects/particle/actor/Particle.js';
import { Audio } from './audio-module.js';
import { OceanCurrent } from './entities/mechanics/ocean-current/actor/OceanCurrent.js';
import { Ocean } from './entities/environments/ocean/actor/Ocean.js';
import { Tank } from './entities/environments/tank/actor/Tank.js';
import { Kitchen } from './entities/environments/kitchen/actor/Kitchen.js';

// Constants
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const INVINCIBLE_DURATION = 120;

// Level entities — ordered by scoreThreshold descending for checkLevelUp iteration
const LEVEL_ENTITIES = [new Ocean(), new Tank(), new Kitchen()];
const LEVELS = Object.fromEntries(LEVEL_ENTITIES.map((lvl, i) => [i + 1, lvl.constructor.config]));


const DIFFICULTY = {
    THRESHOLDS: [100, 200, 500, 1000],
    SPEED_MULT: [1.0, 1.2, 1.4, 1.6, 2.0],
    HOOK_COUNTS: [2, 2, 3, 3, 4],
    TIER_NAMES: ['', 'WARM', 'MEDIUM', 'HARD', 'HELL']
};

const DEATH_QUOTES = [
    "The void claims all eventually...",
    "Even the mightiest lobster falls...",
    "The kitchen always wins...",
    "Butter and garlic await...",
    "Another one for the pot..."
];

// Combo system constants
const COMBO_TIMEOUT = 90; // ~1.5 seconds at 60fps
const COMBO_MAX = 10;
const COMBO_MESSAGES = ['', 'Nice!', 'Great!', 'Awesome!', 'Amazing!', 'INCREDIBLE!', 'UNSTOPPABLE!', 'GODLIKE!', 'LEGENDARY!', 'TRANSCENDENT!'];

// Game state
let canvas, ctx, audio;
let player, bubbles, hooks, cages, nets, forks, seagulls, fish, pearl, starfish, oceanCurrent, beachBalls, jellyfish, eels;
let stunTimer = 0; // Jellyfish sting stun
let gameSessionId = null;
let score = 0, lives = 3, highScore = 0;
let gameOver = false, gameStarted = false, paused = false;
let newBestTimer = 0; // For "NEW BEST!" celebration
let deathAnimating = false, deathTimer = 0, deathRotation = 0; // Death animation state
let levelTransition = false, levelTransitionTimer = 0, transitionLevel = 0; // Level transition state

// Combo state
let comboCount = 0;
let comboTimer = 0;
let comboPopups = []; // {x, y, text, timer, color}
let scorePopups = []; // {x, y, text, timer, color, startY}

// Screen flash for combo milestones
let comboFlash = 0; // Timer for screen flash
    stunTimer = 0;
let comboFlashColor = '#ffff00'; // Color of flash
const COMBO_FLASH_MILESTONES = [5, 8, 10]; // Combos that trigger flash
const COMBO_FLASH_COLORS = { 5: '#ffff00', 8: '#ff8800', 10: '#ff00ff' };

let currentLevel = 1, invincible = true, invincibleTimer = INVINCIBLE_DURATION;
let caught = false, caughtY = 0, screenShake = 0;
let keys = {}, joystickDx = 0, joystickDy = 0, hasTarget = false;
let bgScrollX = 0, lastHookThreshold = 0, fishSpawnTimer = 0, pearlSpawnTimer = 0, starfishSpawnTimer = 0, eelSpawnTimer = 0;
let starfishMultiplier = 1, starfishMultiplierTimer = 0;
const STARFISH_MULTIPLIER_DURATION = 480; // 8 seconds at 60fps
let particles = [];
// DOM Elements
let titleScreen, playBtn, scoreDisplay, livesDisplay, levelDisplay, difficultyDisplay;
let leaderboard, nameInput, finalScoreDisplay, playerNameInput, submitBtn, skipBtn;

// Initialize
function init() {
    canvas = document.getElementById('game');
    ctx = canvas.getContext('2d');
    audio = new Audio();
    
    // Get DOM elements
    titleScreen = document.getElementById('title-screen');
    playBtn = document.getElementById('play-btn');
    scoreDisplay = document.getElementById('score');
    livesDisplay = document.getElementById('lives');
    levelDisplay = document.getElementById('level-name');
    difficultyDisplay = document.getElementById('difficulty');
    leaderboard = document.getElementById('scores-list');
    nameInput = document.getElementById('name-input');
    finalScoreDisplay = document.getElementById('final-score-display');
    playerNameInput = document.getElementById('player-name');
    submitBtn = document.getElementById('submit-score-btn');
    skipBtn = document.getElementById('skip-btn');
    
    // Load high score
    highScore = parseInt(localStorage.getItem('lobsterHighScore') || '0');
    document.getElementById('title-hs').textContent = highScore;
    
    // Setup events
    setupEvents();
    
    // Load leaderboard
    fetchLeaderboard();
    
    console.log('🦞 Lobster Swim initialized');
}

function setupEvents() {
    // Play button
    playBtn.addEventListener('click', startGame);
    
    // Keyboard
    document.addEventListener('keydown', e => keys[e.key] = true);
    document.addEventListener('keyup', e => keys[e.key] = false);
    
    // Canvas mouse/touch - hold-down drag support
    let mouseIsDown = false;
    canvas.addEventListener('mousedown', (e) => {
        mouseIsDown = true;
        handleCanvasClick(e);
    });
    document.addEventListener('mouseup', () => {
        mouseIsDown = false;
    });
    canvas.addEventListener('mousemove', (e) => {
        if (mouseIsDown) handleCanvasClick(e);
    });
    canvas.addEventListener('touchstart', handleCanvasTouch, { passive: false });
    canvas.addEventListener('touchmove', handleCanvasTouch, { passive: false });
    
    // Joystick
    setupJoystick();
    
    // Music/SFX toggles
    document.getElementById('music-btn').addEventListener('click', () => {
        const enabled = audio.toggleMusic();
        document.getElementById('music-btn').style.opacity = enabled ? '0.8' : '0.4';
    });
    document.getElementById('sfx-btn').addEventListener('click', () => {
        const enabled = audio.toggleSfx();
        document.getElementById('sfx-btn').style.opacity = enabled ? '0.8' : '0.4';
    });
    
    // Game over buttons
    submitBtn.addEventListener('click', submitScore);
    skipBtn.addEventListener('click', returnToTitle);
    playerNameInput.addEventListener('keypress', e => {
        if (e.key === 'Enter') submitScore();
    });
}

function setupJoystick() {
    const base = document.getElementById('joystick-base');
    const knob = document.getElementById('joystick-knob');
    if (!base || !knob) return;
    
    let active = false;
    
    const update = (clientX, clientY) => {
        const rect = base.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const maxDist = rect.width / 2 - 25;
        
        let dx = clientX - centerX;
        let dy = clientY - centerY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist > maxDist) {
            dx = (dx / dist) * maxDist;
            dy = (dy / dist) * maxDist;
        }
        
        knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        joystickDx = dx / maxDist;
        joystickDy = dy / maxDist;
    };
    
    base.addEventListener('touchstart', e => {
        e.preventDefault();
        active = true;
        update(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: false });
    
    document.addEventListener('touchmove', e => {
        if (active && e.touches.length > 0) {
            update(e.touches[0].clientX, e.touches[0].clientY);
        }
    }, { passive: false });
    
    document.addEventListener('touchend', () => {
        active = false;
        knob.style.transform = 'translate(-50%, -50%)';
        joystickDx = 0;
        joystickDy = 0;
    });
}

function handleCanvasClick(e) {
    if (!gameStarted || gameOver) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    player.targetX = (e.clientX - rect.left) * scaleX;
    player.targetY = (e.clientY - rect.top) * scaleY;
    hasTarget = true;
}

function handleCanvasTouch(e) {
    if (!gameStarted || gameOver) return;
    e.preventDefault();
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    player.targetX = (touch.clientX - rect.left) * scaleX;
    player.targetY = (touch.clientY - rect.top) * scaleY;
    hasTarget = true;
}

async function startGame() {
    // Get anti-cheat session
    try {
        const res = await fetch("/api/scores/start");
        const data = await res.json();
        gameSessionId = data.session;
    } catch(e) { gameSessionId = null; }
    titleScreen.classList.add('hidden');
    audio.init();
    audio.startLevelMusic(LEVELS[1].musicTrack);
    
    // Reset game state
    score = 0;
    lives = 3;
    gameOver = false;
    gameStarted = true;
    currentLevel = 1;
    invincible = true;
    invincibleTimer = INVINCIBLE_DURATION;
    caught = false;
    lastHookThreshold = 0;
    fishSpawnTimer = 0;
    particles = [];
    paused = false;
    deathAnimating = false;
    deathTimer = 0;
    deathRotation = 0;
    newBestTimer = 0;
    levelTransition = false;
    levelTransitionTimer = 0;
    transitionLevel = 0;
    
    // Reset combo
    comboCount = 0;
    comboTimer = 0;
    comboPopups = [];
    scorePopups = [];
    comboFlash = 0;
    stunTimer = 0;
    
    // Create entities
    player = new Lobster(400, 300);
    bubbles = Bubble.create(8, CANVAS_WIDTH, CANVAS_HEIGHT);
    cages = Cage.create(2, CANVAS_WIDTH, CANVAS_HEIGHT);
    hooks = Hook.create(CANVAS_WIDTH, 2);
    nets = [];
    forks = [];
    seagulls = Seagull.create(CANVAS_WIDTH, CANVAS_HEIGHT, 2); // Diving seagulls
    beachBalls = BeachBall.create(LEVELS[1].enemies.beachBalls || 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    jellyfish = Jellyfish.create(3, CANVAS_WIDTH, CANVAS_HEIGHT);
    eels = [];
    eelSpawnTimer = 0;
    fish = null;
    pearl = null;
    starfish = null;
    starfishSpawnTimer = 0;
    starfishMultiplier = 1;
    starfishMultiplierTimer = 0;
    pearlSpawnTimer = 0;
    oceanCurrent = new OceanCurrent(0.4); // Ocean currents push player gently
    
    updateUI();
    gameLoop();
}

function getDifficulty() {
    let tier = 0;
    for (let i = 0; i < DIFFICULTY.THRESHOLDS.length; i++) {
        if (score >= DIFFICULTY.THRESHOLDS[i]) tier = i + 1;
    }
    return {
        tier,
        name: DIFFICULTY.TIER_NAMES[tier],
        speedMult: DIFFICULTY.SPEED_MULT[tier],
        hookCount: DIFFICULTY.HOOK_COUNTS[tier]
    };
}

function checkLevelUp() {
    for (let lvl = 3; lvl >= 1; lvl--) {
        const config = LEVELS[lvl];
        if (score >= config.scoreThreshold && currentLevel < lvl) {
            currentLevel = lvl;
            document.body.style.background = config.background;
            levelDisplay.textContent = config.name;
            // Spawn enemies defined in spawnOnEnter
            const spawn = config.spawnOnEnter;
            if (spawn.nets) nets = Net.create(spawn.nets, CANVAS_WIDTH, CANVAS_HEIGHT);
            if (spawn.forks) forks = Fork.create(spawn.forks, CANVAS_WIDTH, CANVAS_HEIGHT);
            audio.startLevelMusic(config.musicTrack);
            audio.playLevelUp();

            // Trigger level transition effect
            levelTransition = true;
            levelTransitionTimer = 120; // 2 seconds at 60fps
            transitionLevel = lvl;
            break;
        }
    }
}

// Get combo multiplier (1x, 1.5x, 2x, 2.5x, etc)
function getComboMultiplier() {
    if (comboCount <= 1) return 1;
    return 1 + (comboCount - 1) * 0.5;
}

// Get combo color based on level
function getComboColor() {
    if (comboCount <= 1) return '#00ffff';
    if (comboCount <= 3) return '#00ff00';
    if (comboCount <= 5) return '#ffff00';
    if (comboCount <= 7) return '#ff8800';
    return '#ff00ff';
}

function loseLife() {
    particles.push(...Particle.spawnDeathParticles(player.x, player.y));
    screenShake = 12;
    lives--;
    
    // Reset combo on death
    comboCount = 0;
    comboTimer = 0;
    
    updateLives();
    
    if (lives <= 0) {
        audio.playDeath();
        // Start death animation instead of immediate game over
        deathAnimating = true;
        deathTimer = 120; // 2 seconds at 60fps
        deathRotation = 0;
        screenShake = 20;
        // Reset player to visible position for death animation
        player.x = CANVAS_WIDTH / 2;
        player.y = CANVAS_HEIGHT / 3;
        // Check for new high score
        if (score > highScore) {
            highScore = score;
            localStorage.setItem('lobsterHighScore', highScore.toString());
            newBestTimer = 180; // Show "NEW BEST!" for 3 seconds
        }
    } else {
        audio.playHit();
        player.reset(400, 300);
        hasTarget = false;
        caught = false;
        invincible = true;
        invincibleTimer = INVINCIBLE_DURATION;
    }
}

function update() {
    if (gameOver) return;
    
    // Death animation
    if (deathAnimating) {
        deathTimer--;
        deathRotation += 0.15; // Slower spin
        player.y += 1.5; // Slower fall
        player.x += Math.sin(deathTimer * 0.1) * 2; // Wobble side to side
        // Spawn trailing particles
        if (deathTimer % 8 === 0) {
            particles.push(...Particle.spawnDeathParticles(player.x, player.y).slice(0, 2));
        }
        if (deathTimer <= 0) {
            deathAnimating = false;
            gameOver = true;
            showGameOver();
        }
        // Update particles during death animation
        particles = particles.filter(p => p.update());
        return;
    }
    
    // New best celebration timer
    if (newBestTimer > 0) newBestTimer--;
    
    // Level transition timer
    if (levelTransitionTimer > 0) {
        levelTransitionTimer--;
        if (levelTransitionTimer <= 0) levelTransition = false;
    }
    
    // Combo timer decay
    if (comboTimer > 0) {
        comboTimer--;
        if (comboTimer <= 0) {
            comboCount = 0; // Combo expired
        }
    }
    
    // Combo flash decay
    if (comboFlash > 0) comboFlash--;
    
    // Update combo popups
    comboPopups = comboPopups.filter(p => {
        p.timer--;
        p.y -= 1.5; // Float up
        return p.timer > 0;
    });
    
    // Update score popups
    scorePopups = scorePopups.filter(p => {
        p.timer--;
        p.y -= 2; // Float up faster
        return p.timer > 0;
    });
    
    const diff = getDifficulty();
    
    // Invincibility
    if (invincible) {
        invincibleTimer--;
        if (invincibleTimer <= 0) invincible = false;
    }
    
    // Caught state
    if (caught) {
        caughtY -= 3;
        player.y = caughtY;
        if (player.y < -50) loseLife();
        return;
    }
    
    // Stun timer (jellyfish sting)
    if (stunTimer > 0) stunTimer--;
    const speedMod = stunTimer > 0 ? Jellyfish.STUN_SPEED_MULT : 1;
    const effectiveSpeed = player.speed * speedMod;

    // Player movement
    if (keys['ArrowUp'] || keys['w'] || keys['W']) player.y -= effectiveSpeed;
    if (keys['ArrowDown'] || keys['s'] || keys['S']) player.y += effectiveSpeed;
    if (keys['ArrowLeft'] || keys['a'] || keys['A']) player.x -= effectiveSpeed;
    if (keys['ArrowRight'] || keys['d'] || keys['D']) player.x += effectiveSpeed;
    
    if (joystickDx !== 0 || joystickDy !== 0) {
        player.x += joystickDx * effectiveSpeed;
        player.y += joystickDy * effectiveSpeed;
    }
    
    if (hasTarget) {
        const dx = player.targetX - player.x;
        const dy = player.targetY - player.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 10) {
            player.x += (dx / dist) * effectiveSpeed;
            player.y += (dy / dist) * effectiveSpeed;
        } else {
            hasTarget = false;
        }
    }
    
    // Ocean current (only in levels with oceanCurrent mechanic)
    if (LEVELS[currentLevel].mechanics.includes('oceanCurrent') && oceanCurrent) {
        const diff = getDifficulty();
        oceanCurrent.applyToPlayer(player, diff.speedMult, CANVAS_WIDTH, CANVAS_HEIGHT);
    }
    
    player.clamp(CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // Bubbles
    bubbles.forEach(bubble => {
        bubble.update(player.x, player.y);
        if (bubble.checkCollision(player)) {
            particles.push(...Particle.spawnBubbleParticles(bubble.x, bubble.y));
            audio.playBloop();
            
            // Combo system
            comboCount = Math.min(comboCount + 1, COMBO_MAX);
            comboTimer = COMBO_TIMEOUT;
            
            // Screen flash on combo milestones!
            if (COMBO_FLASH_MILESTONES.includes(comboCount)) {
                comboFlash = 20; // Flash duration in frames
                comboFlashColor = COMBO_FLASH_COLORS[comboCount];
                screenShake = Math.min(8, comboCount); // Extra shake on milestones
            }
            
            // Calculate points with multiplier
            const multiplier = getComboMultiplier();
            const basePoints = 10;
            const points = Math.floor(basePoints * multiplier * starfishMultiplier);
            score += points;
            
            // Score popup
            scorePopups.push({
                x: bubble.x,
                y: bubble.y,
                text: "+" + points,
                timer: 45,
                color: comboCount > 1 ? getComboColor() : "#00ffff",
                startY: bubble.y
            });
            
            // Spawn combo popup
            if (comboCount > 1) {
                const msg = COMBO_MESSAGES[Math.min(comboCount, COMBO_MESSAGES.length - 1)];
                comboPopups.push({
                    x: bubble.x,
                    y: bubble.y,
                    text: `${multiplier}x ${msg}`,
                    timer: 60,
                    color: getComboColor()
                });
            }
            
            bubble.respawn(CANVAS_WIDTH, CANVAS_HEIGHT);
            updateScore();
            
            // Difficulty scaling
            const diff = getDifficulty();
            if (diff.hookCount > hooks.length && score > lastHookThreshold + 100) {
                hooks.push(...Hook.create(CANVAS_WIDTH, 1));
                lastHookThreshold = score;
            }
        }
    });
    
    // Cages
    cages.forEach(cage => {
        cage.update(diff.speedMult, CANVAS_WIDTH, CANVAS_HEIGHT);
        if (cage.checkCollision(player, invincible)) {
            caught = true;
            caughtY = player.y;
            audio.playHooked();
        }
    });
    
    // Hooks - with smart dropping behavior
    hooks.forEach(hook => {
        hook.update(diff.speedMult);
        
        // Smart drop: if player swims beneath hook, chance to drop and snag them!
        const hookPos = hook.getHookPosition();
        const playerBeneath = Math.abs(player.x - hookPos.x) < 80 && player.y > hookPos.y;
        if (playerBeneath && !hook.dropping && Math.random() < 0.003 * diff.speedMult) {
            hook.drop();
        }
        
        if (hook.checkCollision(player, invincible)) {
            caught = true;
            caughtY = player.y;
            audio.playHooked();
        }
    });
    
    // Nets (active when level config includes nets)
    if (LEVELS[currentLevel].enemies.nets) {
        nets.forEach(net => {
            net.update(diff.speedMult, CANVAS_WIDTH, CANVAS_HEIGHT);
            if (net.checkCollision(player, invincible)) {
                loseLife();
            }
        });
    }

    // Forks (active when level config includes forks)
    if (LEVELS[currentLevel].enemies.forks) {
        forks.forEach(fork => {
            fork.update(diff.speedMult, CANVAS_WIDTH, CANVAS_HEIGHT);
            if (fork.checkCollision(player, invincible)) {
                loseLife();
            }
        });
    }

    // Seagulls (Ocean level only - Beach Shallows danger)
    if (currentLevel === 1 && seagulls) {
        seagulls.forEach(gull => {
            gull.update(player.x, player.y, CANVAS_WIDTH, CANVAS_HEIGHT);
            if (gull.checkCollision(player, invincible)) {
                loseLife();
            }
        });
    }
    
    // Beach Balls (active in ocean level - knockback only, not death)
    if (LEVELS[currentLevel].enemies.beachBalls) {
        beachBalls.forEach(ball => {
            ball.update(diff.speedMult, CANVAS_WIDTH, CANVAS_HEIGHT);
            const knockback = ball.checkCollision(player, invincible);
            if (knockback) {
                // Apply knockback to player
                player.x += knockback.x;
                player.y += knockback.y;
                player.clamp(CANVAS_WIDTH, CANVAS_HEIGHT);
                screenShake = 6;
                // Reset combo on knockback (penalty for getting hit)
                comboCount = Math.max(0, comboCount - 2);
            }
        });
    }
    
    // Jellyfish (sting = stun)
    if (jellyfish) {
        jellyfish.forEach(jelly => {
            jelly.update(diff.speedMult, CANVAS_WIDTH, CANVAS_HEIGHT);
            if (jelly.checkCollision(player, invincible)) {
                stunTimer = Jellyfish.STUN_DURATION;
                screenShake = 8;
                comboCount = 0; // Break combo on sting
                scorePopups.push({
                    x: player.x, y: player.y - 20,
                    text: 'STUNNED!', timer: 60,
                    color: '#cc44ff', startY: player.y - 20
                });
            }
        });
    }

    // Electric eels
    eelSpawnTimer++;
    const eelSpawnRate = diff.speedMult > 1.3 ? 180 : (diff.speedMult > 1.1 ? 300 : 480);
    if (eelSpawnTimer >= eelSpawnRate) {
        eels.push(new Eel(CANVAS_WIDTH, CANVAS_HEIGHT));
        eelSpawnTimer = 0;
    }
    eels = eels.filter(e => e.alive);
    eels.forEach(eel => {
        eel.update(diff.speedMult);
        if (eel.checkCollision(player, invincible)) {
            lives--;
            screenShake = 15;
            comboCount = 0;
            scorePopups.push({
                x: player.x, y: player.y - 20,
                text: "ZAPPED!", timer: 60,
                color: "#44eeff", startY: player.y - 20
            });
            if (lives <= 0) {
                gameOver = true;
            } else {
                invincible = true;
                invincibleTimer = 120;
            }
        }
    });

    // Golden fish
    fishSpawnTimer++;
    if (!fish && fishSpawnTimer > GoldenFish.SPAWN_INTERVAL && lives < 3) {
        if (Math.random() < GoldenFish.SPAWN_CHANCE) {
            fish = new GoldenFish(CANVAS_WIDTH);
            fishSpawnTimer = 0;
        }
    }
    
    if (fish) {
        const offScreen = fish.update(player.x, player.y, CANVAS_WIDTH);
        if (offScreen) {
            fish = null;
        } else if (fish.checkCollision(player)) {
            particles.push(...Particle.spawnGoldenParticles(fish.x, fish.y));
            audio.playExtraLife();
            lives++;
            score += 50;
            scorePopups.push({
                x: fish.x,
                y: fish.y,
                text: "+50 +❤️",
                timer: 60,
                color: "#ffd700",
                startY: fish.y
            });
            updateLives();
            updateScore();
            fish = null;
        }
    }
    
    // Magic Pearl - grants invincibility
    pearlSpawnTimer++;
    // Spawn rarely: every ~20 seconds (1200 frames), 20% chance, only if no pearl active
    if (!pearl && pearlSpawnTimer > 1200) {
        if (Math.random() < 0.2) {
            pearl = new Pearl(
                Math.random() * (CANVAS_WIDTH - 100) + 50,
                CANVAS_HEIGHT + 30
            );
            pearlSpawnTimer = 0;
        }
    }
    
    if (pearl) {
        pearl.update();
        if (!pearl.active) {
            pearl = null;
        } else {
            // Check collision with player
            const ph = pearl.getHitbox();
            const px = player.x, py = player.y, pr = 20; // player radius
            const nearX = Math.max(ph.x, Math.min(px, ph.x + ph.width));
            const nearY = Math.max(ph.y, Math.min(py, ph.y + ph.height));
            const dist = Math.sqrt((px - nearX) ** 2 + (py - nearY) ** 2);
            
            if (dist < pr) {
                // Collected! Grant invincibility
                audio.playPowerup?.() || audio.playBubble?.(); // Use powerup sound if exists
                invincible = true;
                invincibleTimer = 300; // 5 seconds of invincibility
                scorePopups.push({
                    x: pearl.x,
                    y: pearl.y,
                    text: "✨ SHIELD! ✨",
                    timer: 90,
                    color: "#ff88ff",
                    startY: pearl.y
                });
                particles.push(...Particle.spawnGoldenParticles(pearl.x, pearl.y));
                pearl = null;
            }
        }
    }
    

    // Starfish - score multiplier pickup
    starfishSpawnTimer++;
    // Spawn every ~25 seconds, 15% chance, only if none active and multiplier not already active
    if (!starfish && starfishMultiplierTimer <= 0 && starfishSpawnTimer > 1500) {
        if (Math.random() < 0.15) {
            starfish = new Starfish(
                Math.random() * (CANVAS_WIDTH - 100) + 50,
                -30
            );
            starfishSpawnTimer = 0;
        }
    }
    if (starfish) {
        starfish.update();
        if (!starfish.active) {
            starfish = null;
        } else if (starfish.checkCollision(player)) {
            // Collected! Grant 2x score multiplier
            audio.playPowerup?.() || audio.playBubble?.();
            starfishMultiplier = 2;
            starfishMultiplierTimer = STARFISH_MULTIPLIER_DURATION;
            scorePopups.push({
                x: starfish.x,
                y: starfish.y,
                text: "⭐ 2x SCORE! ⭐",
                timer: 90,
                color: "#ffcc00",
                startY: starfish.y
            });
            particles.push(...Particle.spawnGoldenParticles(starfish.x, starfish.y));
            starfish = null;
        }
    }
    
    // Update starfish multiplier timer
    if (starfishMultiplierTimer > 0) {
        starfishMultiplierTimer--;
        if (starfishMultiplierTimer <= 0) {
            starfishMultiplier = 1;
        }
    }

    // Level up check
    checkLevelUp();
    
    // Background scroll
    bgScrollX += 0.5;
    
    // Update particles
    particles = particles.filter(p => p.update());
}

function render() {
    ctx.save();
    
    // Screen shake
    if (screenShake > 0) {
        const shakeX = (Math.random() - 0.5) * screenShake * 2;
        const shakeY = (Math.random() - 0.5) * screenShake * 2;
        ctx.translate(shakeX, shakeY);
        screenShake--;
    }
    
    // Background
    renderBackground();
    
    // Ocean current visual (only in levels with oceanCurrent mechanic)
    if (LEVELS[currentLevel].mechanics.includes('oceanCurrent') && oceanCurrent) {
        oceanCurrent.render(ctx, CANVAS_WIDTH, CANVAS_HEIGHT);
    }

    // Entities
    bubbles.forEach(b => b.render(ctx, player.x, player.y));
    cages.forEach(c => c.render(ctx));
    hooks.forEach(h => h.render(ctx));

    if (LEVELS[currentLevel].enemies.nets) nets.forEach(n => n.render(ctx));
    if (LEVELS[currentLevel].enemies.forks) forks.forEach(f => f.render(ctx));
    if (currentLevel === 1 && seagulls) seagulls.forEach(g => g.render(ctx));
    if (LEVELS[currentLevel].enemies.beachBalls) beachBalls.forEach(b => b.render(ctx));
    if (jellyfish) jellyfish.forEach(j => j.render(ctx));
    if (eels) eels.forEach(e => e.render(ctx));
    if (fish) fish.render(ctx);
    if (pearl) pearl.render(ctx);
    if (starfish) starfish.render(ctx);
    
    // Player (with death animation rotation)
    if (deathAnimating) {
        ctx.save();
        ctx.translate(player.x, player.y);
        ctx.rotate(deathRotation);
        ctx.translate(-player.x, -player.y);
        player.render(ctx, false, 0);
        ctx.restore();
        
        // Red flash overlay
        if (deathTimer > 75) {
            ctx.fillStyle = `rgba(255, 0, 0, ${(deathTimer - 75) / 15 * 0.3})`;
            ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        }
    } else {
        player.render(ctx, invincible, invincibleTimer);
    }
    
    // Particles (on top of everything)
    particles.forEach(p => p.render(ctx));

    // Dev mode: draw selection bounding boxes
    const sels = window.gameDevSelectedEntities;
    if (sels.length > 0 && devPanelOpen) {
        const entities = window.gameDevGetEntities();
        ctx.save();
        ctx.strokeStyle = '#ff4500';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 3]);
        for (const sel of sels) {
            const raw = entities[sel.key];
            const entity = sel.index !== null ? raw?.[sel.index] : raw;
            const bounds = entity ? getEntityBounds(sel.key, entity) : null;
            if (bounds) {
                ctx.strokeRect(bounds.x - 4, bounds.y - 4, bounds.width + 8, bounds.height + 8);
            }
        }
        ctx.restore();
    }

    // Score popups
    scorePopups.forEach(p => {
        const alpha = Math.min(1, p.timer / 15);
        const rise = (45 - p.timer) * 0.8;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = "bold 18px monospace";
        ctx.textAlign = "center";
        ctx.fillStyle = p.color;
        ctx.shadowColor = "#000";
        ctx.shadowBlur = 4;
        ctx.fillText(p.text, p.x, p.startY - rise);
        ctx.restore();
    });
    
    // Combo popups
    comboPopups.forEach(p => {
        const alpha = Math.min(1, p.timer / 20);
        const scale = 1 + (60 - p.timer) * 0.01;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = `bold ${16 * scale}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 10;
        ctx.fillText(p.text, p.x, p.y);
        ctx.restore();
    });
    
    // Combo meter (top of screen, only when active)
    if (comboCount > 1 && !deathAnimating) {
        ctx.save();
        const barWidth = 150;
        const barHeight = 8;
        const barX = CANVAS_WIDTH / 2 - barWidth / 2;
        const barY = 15;
        const progress = comboTimer / COMBO_TIMEOUT;
        
        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(barX - 2, barY - 2, barWidth + 4, barHeight + 4);
        
        // Timer bar
        ctx.fillStyle = getComboColor();
        ctx.fillRect(barX, barY, barWidth * progress, barHeight);
        
        // Combo text
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = getComboColor();
        ctx.shadowColor = getComboColor();
        ctx.shadowBlur = 8;
        ctx.fillText(`${comboCount}x COMBO`, CANVAS_WIDTH / 2, barY + 25);
        ctx.restore();
    }
    

    // Starfish multiplier indicator
    if (starfishMultiplierTimer > 0 && !deathAnimating) {
        ctx.save();
        const progress = starfishMultiplierTimer / STARFISH_MULTIPLIER_DURATION;
        const barWidth = 120;
        const barHeight = 6;
        const barX = CANVAS_WIDTH - barWidth - 20;
        const barY = 15;
        const pulse = 0.8 + Math.sin(Date.now() * 0.008) * 0.2;
        
        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(barX - 2, barY - 2, barWidth + 4, barHeight + 4);
        
        // Timer bar (golden)
        ctx.fillStyle = `rgba(255, 200, 50, ${pulse})`;
        ctx.fillRect(barX, barY, barWidth * progress, barHeight);
        
        // Text
        ctx.font = 'bold 13px monospace';
        ctx.textAlign = 'right';
        ctx.fillStyle = `rgba(255, 204, 0, ${pulse})`;
        ctx.shadowColor = '#ffcc00';
        ctx.shadowBlur = 8;
        ctx.fillText('⭐ 2x SCORE', CANVAS_WIDTH - 20, barY + 22);
        ctx.restore();
    }

    // Ocean current direction indicator (bottom-left compass)
    if (LEVELS[currentLevel].mechanics.includes('oceanCurrent') && oceanCurrent && !deathAnimating) {
        ctx.save();
        const compassX = 50;
        const compassY = CANVAS_HEIGHT - 50;
        const compassRadius = 25;
        const info = oceanCurrent.getInfo();
        
        // Outer ring (dark with glow)
        ctx.beginPath();
        ctx.arc(compassX, compassY, compassRadius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 20, 40, 0.7)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(68, 136, 170, 0.6)';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Direction arrow (points where current pushes you)
        ctx.save();
        ctx.translate(compassX, compassY);
        ctx.rotate(info.angle);
        
        // Arrow body
        ctx.beginPath();
        ctx.moveTo(-compassRadius * 0.6, 0);
        ctx.lineTo(compassRadius * 0.6, 0);
        ctx.strokeStyle = '#4488ff';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.stroke();
        
        // Arrow head
        ctx.beginPath();
        ctx.moveTo(compassRadius * 0.6, 0);
        ctx.lineTo(compassRadius * 0.3, -compassRadius * 0.25);
        ctx.moveTo(compassRadius * 0.6, 0);
        ctx.lineTo(compassRadius * 0.3, compassRadius * 0.25);
        ctx.stroke();
        
        ctx.restore();
        
        // Strength indicator (pulsing outer glow)
        const pulse = 0.5 + Math.sin(Date.now() * 0.003) * 0.3;
        const glowSize = compassRadius + 5 + (info.strength * 10 * pulse);
        ctx.beginPath();
        ctx.arc(compassX, compassY, glowSize, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(68, 136, 255, ${0.2 * pulse})`;
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // "CURRENT" label
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(68, 136, 170, 0.8)';
        ctx.fillText('CURRENT', compassX, compassY + compassRadius + 12);
        
        ctx.restore();
    }
    
    // Combo milestone screen flash
    if (comboFlash > 0) {
        const flashAlpha = (comboFlash / 20) * 0.4;
        ctx.fillStyle = comboFlashColor.replace(')', `, ${flashAlpha})`).replace('rgb', 'rgba').replace('#', '');
        // Convert hex to rgba for flash
        const hex = comboFlashColor;
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${flashAlpha})`;
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }
    // Stun overlay (jellyfish sting)
    if (stunTimer > 0) {
        const stunAlpha = Math.min(0.15, (stunTimer / 60) * 0.15);
        ctx.fillStyle = `rgba(180, 50, 255, ${stunAlpha})`;
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        // Stun indicator text (flashing)
        if (Math.floor(stunTimer / 10) % 2 === 0) {
            ctx.save();
            ctx.font = 'bold 16px monospace';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#cc44ff';
            ctx.fillText('⚡ STUNNED ⚡', player.x, player.y - 40);
            ctx.restore();
        }
    }
    
    // NEW BEST! celebration text
    if (newBestTimer > 0) {
        const pulse = 1 + Math.sin(newBestTimer * 0.2) * 0.1;
        ctx.save();
        ctx.font = `bold ${36 * pulse}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#00ff00';
        ctx.shadowColor = '#00ff00';
        ctx.shadowBlur = 20;
        ctx.fillText('✨ NEW BEST! ✨', CANVAS_WIDTH / 2, 80);
        ctx.restore();
    }
    
    // Level transition effect
    if (levelTransition && levelTransitionTimer > 0) {
        ctx.save();
        
        // White flash (fades out)
        if (levelTransitionTimer > 100) {
            const flashAlpha = (levelTransitionTimer - 100) / 20 * 0.8;
            ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(flashAlpha, 0.8)})`;
            ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        }
        
        // Level name announcement
        const progress = 1 - (levelTransitionTimer / 120);
        const slideIn = progress < 0.2 ? progress / 0.2 : 1;
        const fadeOut = progress > 0.7 ? 1 - (progress - 0.7) / 0.3 : 1;
        const alpha = slideIn * fadeOut;
        
        ctx.globalAlpha = alpha;
        ctx.textAlign = 'center';
        
        // Big glowing level name
        const pulse = 1 + Math.sin(levelTransitionTimer * 0.15) * 0.05;
        ctx.font = `bold ${48 * pulse}px monospace`;
        ctx.fillStyle = '#fff';
        ctx.shadowColor = '#ff4500';
        ctx.shadowBlur = 30;
        ctx.fillText(LEVELS[transitionLevel].name.toUpperCase(), CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 20);

        // Subtitle
        if (LEVELS[transitionLevel].subtitle) {
            ctx.font = '18px monospace';
            ctx.shadowBlur = 10;
            ctx.fillStyle = '#ffaa00';
            ctx.fillText(LEVELS[transitionLevel].subtitle, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 25);
        }
        
        ctx.restore();
    }
    
    // Paused overlay
    if (paused) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.save();
        ctx.font = 'bold 48px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ff4500';
        ctx.shadowColor = '#ff4500';
        ctx.shadowBlur = 20;
        ctx.fillText('PAUSED', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
        ctx.restore();
    }

    ctx.restore();
}

function renderBackground() {
    LEVEL_ENTITIES[currentLevel - 1].renderBackground(ctx, CANVAS_WIDTH, CANVAS_HEIGHT, bgScrollX);
}

function gameLoop() {
    if (!gameStarted) return;

    if (!paused) update();
    render();

    // Continue loop during death animation or normal play
    if (!gameOver || deathAnimating) {
        requestAnimationFrame(gameLoop);
    }
}

function updateUI() {
    updateScore();
    updateLives();
    levelDisplay.textContent = '';
}

function updateScore() {
    // Show score with best
    if (highScore > 0) {
        scoreDisplay.innerHTML = `${score} <span style="color:#888;font-size:0.8em">(Best: ${highScore})</span>`;
    } else {
        scoreDisplay.textContent = score;
    }
    const diff = getDifficulty();
    if (diff.name) {
        difficultyDisplay.textContent = `[${diff.name}]`;
    } else {
        difficultyDisplay.textContent = '';
    }
}

function updateLives() {
    let hearts = '';
    for (let i = 0; i < 3; i++) {
        hearts += i < lives ? '❤️' : '🖤';
    }
    livesDisplay.innerHTML = hearts;
}

function showGameOver() {
    const quote = DEATH_QUOTES[Math.floor(Math.random() * DEATH_QUOTES.length)];
    document.getElementById('death-quote').textContent = `"${quote}"`;
    finalScoreDisplay.textContent = score;
    playerNameInput.value = localStorage.getItem('lobsterPlayerName') || '';
    nameInput.style.display = 'block';
    setTimeout(() => playerNameInput.focus(), 100);
}

async function submitScore() {
    const name = playerNameInput.value.trim() || 'Anonymous';
    localStorage.setItem('lobsterPlayerName', name);
    
    try {
        await fetch('/api/scores', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, score, session: gameSessionId })
        });
        fetchLeaderboard();
    } catch (err) {
        console.error('Failed to submit score:', err);
    }
    
    returnToTitle();
}

function returnToTitle() {
    nameInput.style.display = 'none';
    audio.stopMusic();
    gameStarted = false;
    document.getElementById('title-hs').textContent = highScore;
    titleScreen.classList.remove('hidden');
    fetchLeaderboard();
}

async function fetchLeaderboard() {
    try {
        const res = await fetch('/api/scores');
        const scores = await res.json();
        const isMobile = window.innerWidth <= 820;
        const limit = isMobile ? 5 : 10;
        const top = scores.slice(0, limit);
        
        if (top.length === 0) {
            leaderboard.innerHTML = 'No scores yet!';
            return;
        }
        
        leaderboard.innerHTML = top.map((s, i) => 
            `<div>${i + 1}. ${escapeHtml(s.name)}: ${s.score}</div>`
        ).join('');
    } catch (err) {
        leaderboard.innerHTML = 'Could not load scores';
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Start when DOM ready
document.addEventListener('DOMContentLoaded', init);

// Dev mode functions - exposed to window for dev panel
let godMode = false;

window.gameDevSetLevel = (lvl) => {
    if (!gameStarted) return;
    const config = LEVELS[lvl];
    if (!config) return;
    currentLevel = lvl;
    document.body.style.background = config.background;
    document.getElementById('level-name').textContent = config.name;
    if (config.enemies.nets && nets.length === 0) nets = Net.create(config.enemies.nets, CANVAS_WIDTH, CANVAS_HEIGHT);
    if (config.enemies.forks && forks.length === 0) forks = Fork.create(config.enemies.forks, CANVAS_WIDTH, CANVAS_HEIGHT);
    audio.startLevelMusic(config.musicTrack);
};

window.gameDevAddScore = (pts) => {
    if (!gameStarted) return;
    score += pts;
    updateScore();
    checkLevelUp();
};

window.gameDevToggleGod = () => {
    godMode = !godMode;
    invincible = godMode;
    if (godMode) invincibleTimer = 999999;
    return godMode;
};

window.gameDevSpawnFish = () => {
    if (!gameStarted) return;
    fish = new GoldenFish(CANVAS_WIDTH);
};

window.gameDevAddLife = () => {
    if (!gameStarted) return;
    lives++;
    updateLives();
};

window.gameDevRemoveLife = () => {
    if (!gameStarted) return;
    loseLife();
};

window.gameDevSetPaused = (val) => {
    if (!gameStarted || gameOver) return;
    paused = val;
};
window.gameDevIsPaused = () => paused;

window.gameDevGetEntities = () => ({
    player, bubbles, hooks, cages, nets, forks, seagulls, beachBalls,
    fish, pearl, oceanCurrent, particles
});

window.gameDevSelectedEntities = [];
window._gameDevLastSelected = null;

function getEntityBounds(key, entity) {
    if (!entity) return null;
    if (entity.getBounds) return entity.getBounds();
    if (entity.getHitbox) return entity.getHitbox();
    if (entity.getHookPosition) {
        const p = entity.getHookPosition();
        return { x: p.x - p.radius, y: p.y - p.radius, width: p.radius * 2, height: p.radius * 2 };
    }
    if (entity.x !== undefined && entity.y !== undefined) {
        const s = entity.size || 10;
        return { x: entity.x - s, y: entity.y - s, width: s * 2, height: s * 2 };
    }
    return null;
}

window.gameDevPickEntityAt = (canvasX, canvasY) => {
    const entities = window.gameDevGetEntities();
    if (!entities) return null;

    let best = null;
    let bestArea = Infinity;

    const check = (key, entity, index) => {
        const bounds = getEntityBounds(key, entity);
        if (!bounds) return;
        if (canvasX >= bounds.x && canvasX <= bounds.x + bounds.width &&
            canvasY >= bounds.y && canvasY <= bounds.y + bounds.height) {
            const area = bounds.width * bounds.height;
            if (area < bestArea) {
                bestArea = area;
                best = { key, index };
            }
        }
    };

    for (const [key, val] of Object.entries(entities)) {
        if (Array.isArray(val)) {
            val.forEach((e, i) => check(key, e, i));
        } else if (val && typeof val === 'object') {
            check(key, val, null);
        }
    }

    return best;
};
