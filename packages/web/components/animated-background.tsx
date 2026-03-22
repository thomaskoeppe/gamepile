"use client";

import { useEffect, useRef } from "react";

type LifecycleState = "spawning" | "alive" | "dying";

type GlowCache = { gradient: CanvasGradient; size: number };

class Particle {
    x: number;
    y: number;
    size: number;
    baseSize: number;
    speedX: number;
    speedY: number;
    color: string;
    colorRgb: [number, number, number];
    opacity: number;
    baseOpacity: number;

    angle: number;
    angleSpeed: number;
    drift: number;
    wobbleX: number;
    wobbleY: number;
    wobbleSpeedX: number;
    wobbleSpeedY: number;
    pulseSpeed: number;
    pulseOffset: number;

    lifecycle: LifecycleState;
    lifetimeTicks: number;
    age: number;
    spawnDuration: number;
    dyingDuration: number;

    glowCache: GlowCache | null = null;

    constructor(private canvasWidth: number, private canvasHeight: number) {
        const tier = Math.random();
        if (tier < 0.6) {
            this.baseSize = Math.random() * 1.5 + 0.4;
        } else if (tier < 0.9) {
            this.baseSize = Math.random() * 2.5 + 2;
        } else {
            this.baseSize = Math.random() * 4 + 4;
        }
        this.size = this.baseSize;

        this.x = Math.random() * canvasWidth;
        this.y = Math.random() * canvasHeight;

        const speed = (0.6 / this.baseSize) * (Math.random() * 0.4 + 0.1);
        const angle = Math.random() * Math.PI * 2;
        this.speedX = Math.cos(angle) * speed;
        this.speedY = Math.sin(angle) * speed;

        this.wobbleX = Math.random() * 0.4 + 0.1;
        this.wobbleY = Math.random() * 0.4 + 0.1;
        this.wobbleSpeedX = Math.random() * 0.008 + 0.002;
        this.wobbleSpeedY = Math.random() * 0.008 + 0.002;
        this.angle = Math.random() * Math.PI * 2;
        this.angleSpeed = (Math.random() - 0.5) * 0.002;
        this.drift = Math.random() * Math.PI * 2;

        this.baseOpacity = Math.random() * 0.4 + 0.15;
        this.opacity = this.baseOpacity;
        this.pulseSpeed = Math.random() * 0.015 + 0.005;
        this.pulseOffset = Math.random() * Math.PI * 2;

        const r = Math.floor(Math.random() * 20 + 5);
        const g = Math.floor(Math.random() * 80 + 140);
        const b = Math.floor(Math.random() * 80 + 80);
        this.colorRgb = [r, g, b];
        this.color = `rgb(${r}, ${g}, ${b})`;

        this.lifecycle = "spawning";
        this.age = 0;
        this.spawnDuration = Math.random() * 60 + 40;
        this.dyingDuration = Math.random() * 80 + 60;
        this.lifetimeTicks = Math.random() * 600 + 300;
    }

    get isDead() {
        return this.lifecycle === "dying" && this.age >= this.dyingDuration;
    }

    update(tick: number, mouse: { x: number | null; y: number | null }) {
        this.age++;

        if (this.lifecycle === "spawning" && this.age >= this.spawnDuration) {
            this.lifecycle = "alive";
            this.age = 0;
        } else if (this.lifecycle === "alive" && this.age >= this.lifetimeTicks) {
            this.lifecycle = "dying";
            this.age = 0;
        }

        let scalar = 1;
        if (this.lifecycle === "spawning") {
            const t = this.age / this.spawnDuration;
            scalar = t * t * (3 - 2 * t);
        } else if (this.lifecycle === "dying") {
            const t = this.age / this.dyingDuration;
            scalar = 1 - t * t * t;
        }

        const pulse = Math.sin(tick * this.pulseSpeed + this.pulseOffset);
        this.size = Math.max(0, this.baseSize * scalar * (1 + pulse * 0.15));
        this.opacity = Math.max(0, this.baseOpacity * scalar * (1 + pulse * 0.25));

        this.x += this.speedX;
        this.y += this.speedY;

        this.x += Math.sin(tick * this.wobbleSpeedX + this.drift) * this.wobbleX;
        this.y += Math.cos(tick * this.wobbleSpeedY + this.drift + 1) * this.wobbleY;

        this.angle += this.angleSpeed;
        this.speedX += Math.cos(this.angle) * 0.0005;
        this.speedY += Math.sin(this.angle) * 0.0005;

        const maxSpeed = 0.6;
        const speedSq = this.speedX ** 2 + this.speedY ** 2;
        if (speedSq > maxSpeed * maxSpeed) {
            const s = maxSpeed / Math.sqrt(speedSq);
            this.speedX *= s;
            this.speedY *= s;
        }

        if (this.x > this.canvasWidth + 10) this.x = -10;
        else if (this.x < -10) this.x = this.canvasWidth + 10;
        if (this.y > this.canvasHeight + 10) this.y = -10;
        else if (this.y < -10) this.y = this.canvasHeight + 10;

        if (mouse.x !== null && mouse.y !== null) {
            const dx = this.x - mouse.x;
            const dy = this.y - mouse.y;
            const distSq = dx * dx + dy * dy;
            const repelRadius = 120;
            if (distSq < repelRadius * repelRadius && distSq > 0) {
                const dist = Math.sqrt(distSq);
                const force = (repelRadius - dist) / repelRadius;
                this.x += (dx / dist) * force * 2.5;
                this.y += (dy / dist) * force * 2.5;
            }
        }
    }

    draw(ctx: CanvasRenderingContext2D) {
        if (this.size <= 0.05 || this.opacity <= 0.01) return;

        ctx.save();
        ctx.globalAlpha = Math.min(this.opacity, 1);

        if (this.baseSize > 4) {
            const glowRadius = this.size * 3;
            if (!this.glowCache || Math.abs(this.glowCache.size - glowRadius) > 0.3) {
                const glow = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, glowRadius);
                glow.addColorStop(0, `rgba(${this.colorRgb[0]}, ${this.colorRgb[1]}, ${this.colorRgb[2]}, 0.3)`);
                glow.addColorStop(1, "transparent");
                this.glowCache = { gradient: glow, size: glowRadius };
            }
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size * 3, 0, Math.PI * 2);
            ctx.fillStyle = this.glowCache.gradient;
            ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.restore();
    }
}

function connectParticles(ctx: CanvasRenderingContext2D, particles: Particle[], maxDist = 65) {
    const maxDistSq = maxDist * maxDist;

    for (let a = 0; a < particles.length; a++) {
        for (let b = a + 1; b < particles.length; b++) {
            const dx = particles[a].x - particles[b].x;
            const dy = particles[a].y - particles[b].y;
            const distSq = dx * dx + dy * dy;

            if (distSq < maxDistSq) {
                const alpha = 0.12 * (1 - Math.sqrt(distSq) / maxDist);
                ctx.beginPath();
                ctx.strokeStyle = `rgba(16, 185, 129, ${alpha})`;
                ctx.lineWidth = 0.4;
                ctx.moveTo(particles[a].x, particles[a].y);
                ctx.lineTo(particles[b].x, particles[b].y);
                ctx.stroke();
            }
        }
    }
}

function getParticleCount(width: number, height: number): number {
    const cores = navigator.hardwareConcurrency ?? 4;
    const area = width * height;
    const base = Math.floor(area / 11000);
    const cap = cores <= 4 ? 60 : cores <= 8 ? 90 : 130;
    return Math.min(base, cap);
}

export function AnimatedBackground() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const mouseRef = useRef<{ x: number | null; y: number | null }>({ x: null, y: null });

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        let particles: Particle[] = [];
        let rafId: number;
        let tick = 0;
        let isVisible = true;

        const initParticles = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            const count = getParticleCount(canvas.width, canvas.height);
            particles = Array.from({ length: count }, () => {
                const p = new Particle(canvas.width, canvas.height);
                p.lifecycle = "alive";
                p.age = Math.floor(Math.random() * p.lifetimeTicks);
                return p;
            });
        };

        const animate = () => {
            if (!isVisible) return;
            tick++;
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            for (let i = 0; i < particles.length; i++) {
                particles[i].update(tick, mouseRef.current);
                if (particles[i].isDead) {
                    particles[i] = new Particle(canvas.width, canvas.height);
                } else {
                    particles[i].draw(ctx);
                }
            }

            connectParticles(ctx, particles);
            rafId = requestAnimationFrame(animate);
        };

        const onVisibilityChange = () => {
            isVisible = !document.hidden;
            if (isVisible) {
                cancelAnimationFrame(rafId);
                animate();
            }
        };

        const onMouseMove = (e: MouseEvent) => {
            mouseRef.current = { x: e.clientX, y: e.clientY };
        };

        const onMouseLeave = () => {
            mouseRef.current = { x: null, y: null };
        };

        initParticles();
        animate();

        window.addEventListener("resize", initParticles);
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseleave", onMouseLeave);
        document.addEventListener("visibilitychange", onVisibilityChange);

        return () => {
            cancelAnimationFrame(rafId);
            window.removeEventListener("resize", initParticles);
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseleave", onMouseLeave);
            document.removeEventListener("visibilitychange", onVisibilityChange);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            style={{
                position: "fixed",
                inset: 0,
                pointerEvents: "none",
                zIndex: 0,
                opacity: 0.2,
            }}
        />
    );
}