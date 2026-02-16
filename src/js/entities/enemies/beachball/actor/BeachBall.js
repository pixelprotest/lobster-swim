/**
 * BeachBall.js - Bouncing beach ball hazard
 * Bounces around the screen, knocks the lobster back on collision
 * Render: v001 (striped ball with shine)
 * 
 * Design: Fun chaos element for Beach Shallows level
 * - Bounces off screen edges
 * - Knockback on player hit (not death)
 * - Multiple color schemes
 */

import { render as renderBeachBall } from '../render/BeachBall.v001.js';

// Color schemes for variety
const COLOR_SCHEMES = [
    ['#ff4444', '#ffffff', '#ff4444', '#ffffff', '#ff4444', '#ffffff'], // Classic red/white
    ['#4488ff', '#ffffff', '#4488ff', '#ffffff', '#4488ff', '#ffffff'], // Blue/white
    ['#ffcc00', '#ff6600', '#ffcc00', '#ff6600', '#ffcc00', '#ff6600'], // Yellow/orange
    ['#ff69b4', '#ffffff', '#ff69b4', '#ffffff', '#ff69b4', '#ffffff'], // Pink/white
    ['#44ff88', '#ffffff', '#44ff88', '#ffffff', '#44ff88', '#ffffff'], // Green/white
];

export class BeachBall {
    constructor(x, y, radius = 35) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        
        // Velocity - random direction
        const angle = Math.random() * Math.PI * 2;
        const speed = 2 + Math.random() * 2;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        
        // Rotation
        this.rotation = 0;
        this.rotationSpeed = (Math.random() - 0.5) * 0.1;
        
        // Pick a random color scheme
        this.colors = COLOR_SCHEMES[Math.floor(Math.random() * COLOR_SCHEMES.length)];
        
        // Knockback cooldown (prevent spam-knockback)
        this.knockbackCooldown = 0;
    }

    /**
     * Create multiple beach balls for a level
     */
    static create(count, canvasWidth, canvasHeight) {
        const balls = [];
        for (let i = 0; i < count; i++) {
            // Spawn in upper portion of screen (floating on water)
            const x = 100 + Math.random() * (canvasWidth - 200);
            const y = 80 + Math.random() * (canvasHeight * 0.5);
            balls.push(new BeachBall(x, y));
        }
        return balls;
    }

    update(difficultyMult = 1, canvasWidth, canvasHeight) {
        // Move
        this.x += this.vx * difficultyMult;
        this.y += this.vy * difficultyMult;
        
        // Rotate based on movement
        this.rotation += this.rotationSpeed + (this.vx * 0.02);
        
        // Bounce off walls
        if (this.x - this.radius < 0) {
            this.x = this.radius;
            this.vx = Math.abs(this.vx);
            this.rotationSpeed = Math.abs(this.rotationSpeed);
        }
        if (this.x + this.radius > canvasWidth) {
            this.x = canvasWidth - this.radius;
            this.vx = -Math.abs(this.vx);
            this.rotationSpeed = -Math.abs(this.rotationSpeed);
        }
        if (this.y - this.radius < 0) {
            this.y = this.radius;
            this.vy = Math.abs(this.vy);
        }
        if (this.y + this.radius > canvasHeight) {
            this.y = canvasHeight - this.radius;
            this.vy = -Math.abs(this.vy);
        }
        
        // Cooldown
        if (this.knockbackCooldown > 0) {
            this.knockbackCooldown--;
        }
    }

    render(ctx) {
        renderBeachBall(ctx, this.x, this.y, this.radius, this.rotation, this.colors);
    }

    getBounds() {
        const d = this.radius * 2;
        return { x: this.x - this.radius, y: this.y - this.radius, width: d, height: d };
    }

    /**
     * Check collision with player and apply knockback
     * Returns knockback vector if hit, null if no hit
     */
    checkCollision(player, invincible = false) {
        if (invincible || this.knockbackCooldown > 0) return null;
        
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < this.radius + player.size) {
            // Collision! Calculate knockback
            this.knockbackCooldown = 30; // Half-second cooldown
            
            // Normalize and scale knockback force
            const knockbackForce = 15;
            const nx = dx / dist;
            const ny = dy / dist;
            
            // Also bounce the ball away
            this.vx = -nx * 4;
            this.vy = -ny * 4;
            
            return {
                x: nx * knockbackForce,
                y: ny * knockbackForce
            };
        }
        
        return null;
    }
}
