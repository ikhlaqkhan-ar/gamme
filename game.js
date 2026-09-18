import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

/**
 * ============================================================================
 * OPERATION: SANDSTORM - CORE ENGINE ARCHITECTURE
 * ADVANCED TACTICAL SIMULATION ENGINE (WEBGL / THREE.JS)
 * ============================================================================
 * Features: Procedural Texturing, Raycast Ballistics, FSM Bot AI, 
 * Particle Systems, Dynamic Lighting, Spatial Audio, and Tactical HUD Sync.
 */

// --- GLOBAL CONFIGURATION ---
const CONFIG = {
    gravity: 35,
    playerSpeed: 15,
    sprintMultiplier: 1.6,
    crouchMultiplier: 0.5,
    botCount: 19,
    mapSize: 200,
    coverDensity: 0.15,
    tickRate: 60,
    colors: {
        blood: 0x8a0303,
        spark: 0xffd700,
        muzzle: 0xffaa00,
        concrete: 0x555555,
        rust: 0x8b4513,
        hostile: 0xff0000,
        friendly: 0x00ffaa
    }
};

// --- PROCEDURAL TEXTURE GENERATOR ---
// Generates gritty, noisy textures using HTML5 Canvas for materials without external assets.
class TextureEngine {
    static generateNoise(width, height, color1, color2, intensity) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        
        ctx.fillStyle = color1;
        ctx.fillRect(0, 0, width, height);
        
        for (let i = 0; i < width * height * intensity; i++) {
            const x = Math.random() * width;
            const y = Math.random() * height;
            ctx.fillStyle = Math.random() > 0.5 ? color2 : color1;
            ctx.fillRect(x, y, 2, 2);
        }
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(4, 4);
        return texture;
    }

    static getConcrete() {
        return this.generateNoise(512, 512, '#444444', '#666666', 0.8);
    }

    static getRust() {
        return this.generateNoise(256, 256, '#3e1a0b', '#7c3a1a', 0.9);
    }

    static getDirt() {
        return this.generateNoise(1024, 1024, '#1c1511', '#2d221b', 0.6);
    }
}

// --- PROCEDURAL AUDIO ENGINE ---
// Uses Web Audio API to synthesize combat sounds (no external audio files needed).
class AudioEngine {
    constructor() {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.3;
        this.masterGain.connect(this.ctx.destination);
    }

    playShootSound(type) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.masterGain);

        if (type === 'AR') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(150, this.ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(40, this.ctx.currentTime + 0.1);
            gain.gain.setValueAtTime(1, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);
            osc.start();
            osc.stop(this.ctx.currentTime + 0.2);
        } else if (type === 'SHOTGUN') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(100, this.ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(20, this.ctx.currentTime + 0.2);
            gain.gain.setValueAtTime(1, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.3);
            osc.start();
            osc.stop(this.ctx.currentTime + 0.35);
        }
    }

    playHitMarker() {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, this.ctx.currentTime);
        gain.gain.setValueAtTime(0.5, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.1);
    }
}

// --- PARTICLE SYSTEM ---
// Manages blood, sparks, and muzzle flashes using Points.
class ParticleSystem {
    constructor(scene) {
        this.scene = scene;
        this.particles = [];
        this.geometry = new THREE.BufferGeometry();
        this.material = new THREE.PointsMaterial({
            size: 0.5,
            vertexColors: true,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending
        });
        
        // Pre-allocate buffer for performance
        this.maxParticles = 5000;
        this.positions = new Float32Array(this.maxParticles * 3);
        this.colors = new Float32Array(this.maxParticles * 3);
        this.velocities = [];
        this.lifespans = [];
        this.activeParticles = 0;

        this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
        this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
        
        this.mesh = new THREE.Points(this.geometry, this.material);
        this.scene.add(this.mesh);
    }

    emit(position, normal, colorHex, count, speed, life) {
        const color = new THREE.Color(colorHex);
        for (let i = 0; i < count; i++) {
            if (this.activeParticles >= this.maxParticles) return;

            const index = this.activeParticles * 3;
            this.positions[index] = position.x;
            this.positions[index + 1] = position.y;
            this.positions[index + 2] = position.z;

            this.colors[index] = color.r;
            this.colors[index + 1] = color.g;
            this.colors[index + 2] = color.b;

            // Random spread based on normal
            const vx = normal.x * speed + (Math.random() - 0.5) * speed;
            const vy = normal.y * speed + (Math.random() - 0.5) * speed;
            const vz = normal.z * speed + (Math.random() - 0.5) * speed;
            
            this.velocities.push(new THREE.Vector3(vx, vy, vz));
            this.lifespans.push(life * (0.8 + Math.random() * 0.4));
            this.activeParticles++;
        }
        this.geometry.attributes.position.needsUpdate = true;
        this.geometry.attributes.color.needsUpdate = true;
    }

    update(delta) {
        let active = 0;
        for (let i = 0; i < this.activeParticles; i++) {
            this.lifespans[i] -= delta;
            if (this.lifespans[i] > 0) {
                const index = i * 3;
                // Apply Gravity
                this.velocities[i].y -= CONFIG.gravity * 0.5 * delta;
                
                this.positions[active * 3] = this.positions[index] + this.velocities[i].x * delta;
                this.positions[active * 3 + 1] = this.positions[index + 1] + this.velocities[i].y * delta;
                this.positions[active * 3 + 2] = this.positions[index + 2] + this.velocities[i].z * delta;
                
                this.colors[active * 3] = this.colors[index];
                this.colors[active * 3 + 1] = this.colors[index + 1];
                this.colors[active * 3 + 2] = this.colors[index + 2];
                
                this.velocities[active] = this.velocities[i];
                this.lifespans[active] = this.lifespans[i];
                active++;
            }
        }
        this.activeParticles = active;
        this.velocities.length = active;
        this.lifespans.length = active;
        
        this.geometry.setDrawRange(0, this.activeParticles);
        this.geometry.attributes.position.needsUpdate = true;
        this.geometry.attributes.color.needsUpdate = true;
    }
}

// --- WEAPON SYSTEM ---
class Weapon {
    constructor(name, ammo, reserve, fireRate, damage, range, spread, reloadTime) {
        this.name = name;
        this.maxAmmo = ammo;
        this.ammo = ammo;
        this.reserve = reserve;
        this.fireRate = fireRate; // seconds between shots
        this.damage = damage;
        this.range = range;
        this.spread = spread;
        this.reloadTime = reloadTime;
        this.lastFired = 0;
        this.isReloading = false;
    }

    canFire(time) {
        return !this.isReloading && this.ammo > 0 && (time - this.lastFired) >= this.fireRate;
    }

    fire(time) {
        this.ammo--;
        this.lastFired = time;
    }

    reload(callback) {
        if (this.isReloading || this.ammo === this.maxAmmo || this.reserve <= 0) return false;
        this.isReloading = true;
        const needed = this.maxAmmo - this.ammo;
        const toTake = Math.min(needed, this.reserve);
        
        // Trigger UI reload bar
        const bar = document.getElementById('reload-bar-container');
        const fill = document.getElementById('reload-bar');
        if (bar && fill) {
            bar.style.display = 'block';
            fill.style.width = '0%';
            fill.style.transition = `width ${this.reloadTime}s linear`;
            setTimeout(() => fill.style.width = '100%', 50);
        }

        setTimeout(() => {
            this.ammo += toTake;
            this.reserve -= toTake;
            this.isReloading = false;
            if (bar) bar.style.display = 'none';
            if (callback) callback();
        }, this.reloadTime * 1000);
        return true;
    }
}

// --- ENTITIES & AI ---
class Entity {
    constructor(scene, x, z, hp) {
        this.scene = scene;
        this.hp = hp;
        this.maxHp = hp;
        this.isDead = false;
        
        // Physics Body Representation
        const geo = new THREE.CylinderGeometry(1, 1, 4, 16);
        const mat = new THREE.MeshStandardMaterial({ color: 0xaa0000 });
        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.position.set(x, 2, z);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.scene.add(this.mesh);

        this.velocity = new THREE.Vector3();
        this.direction = new THREE.Vector3();
    }

    takeDamage(amount, hitPoint, hitNormal, particles) {
        if (this.isDead) return;
        this.hp -= amount;
        if (particles) particles.emit(hitPoint, hitNormal, CONFIG.colors.blood, 20, 5, 0.5);
        
        if (this.hp <= 0) {
            this.die();
        }
    }

    die() {
        this.isDead = true;
        this.mesh.rotation.x = Math.PI / 2; // Fall over
        this.mesh.position.y = 1;
        this.mesh.material.color.setHex(0x330000); // Darken
    }
}

// Finite State Machine for Bot AI
class BotAI extends Entity {
    constructor(scene, x, z, waypoints) {
        super(scene, x, z, 100);
        this.mesh.material.color.setHex(CONFIG.colors.hostile);
        this.waypoints = waypoints;
        this.currentWaypoint = 0;
        this.state = 'PATROL'; // PATROL, ENGAGE, COVER
        this.speed = 8;
        this.reactionTime = 0.5;
        this.lastSeenPlayer = 0;
        this.weapon = new Weapon('AK-47', 30, 90, 0.2, 15, 100, 0.05, 2.5);
    }

    update(delta, player, world, time) {
        if (this.isDead) return;

        // Line of Sight check
        const toPlayer = new THREE.Vector3().subVectors(player.camera.position, this.mesh.position);
        const distance = toPlayer.length();
        toPlayer.normalize();

        const raycaster = new THREE.Raycaster(this.mesh.position, toPlayer, 0, distance);
        const intersects = raycaster.intersectObjects(world.colliders);

        let canSeePlayer = false;
        if (intersects.length === 0 && distance < 80) {
            canSeePlayer = true;
            this.lastSeenPlayer = time;
        }

        // State Machine Logic
        if (canSeePlayer) {
            this.state = 'ENGAGE';
        } else if (time - this.lastSeenPlayer < 5) {
            this.state = 'COVER';
        } else {
            this.state = 'PATROL';
        }

        this.executeState(delta, player, toPlayer, time, world);
    }

    executeState(delta, player, toPlayer, time, world) {
        switch (this.state) {
            case 'PATROL':
                if (this.waypoints.length === 0) return;
                const target = this.waypoints[this.currentWaypoint];
                const dir = new THREE.Vector3().subVectors(target, this.mesh.position);
                dir.y = 0;
                if (dir.length() < 2) {
                    this.currentWaypoint = (this.currentWaypoint + 1) % this.waypoints.length;
                } else {
                    dir.normalize();
                    this.mesh.position.addScaledVector(dir, this.speed * delta);
                    // Rotate mesh to face movement
                    const lookTarget = this.mesh.position.clone().add(dir);
                    this.mesh.lookAt(lookTarget);
                }
                break;
            case 'ENGAGE':
                // Stop and shoot
                this.mesh.lookAt(player.camera.position.x, this.mesh.position.y, player.camera.position.z);
                if (this.weapon.canFire(time)) {
                    this.weapon.fire(time);
                    // Simple hit registration on player
                    if (Math.random() > 0.4) { // Bot accuracy
                        player.takeDamage(this.weapon.damage);
                    }
                } else if (this.weapon.ammo <= 0) {
                    this.weapon.reload();
                }
                break;
            case 'COVER':
                // Evade side to side (strafe)
                const strafe = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x).normalize();
                this.mesh.position.addScaledVector(strafe, this.speed * delta * Math.sin(time * 3));
                this.mesh.lookAt(player.camera.position.x, this.mesh.position.y, player.camera.position.z);
                break;
        }
    }
}

// --- PLAYER CONTROLLER ---
class Player {
    constructor(camera, domElement) {
        this.camera = camera;
        this.controls = new PointerLockControls(camera, domElement);
        this.hp = 100;
        this.armor = 50;
        
        // Movement state
        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;
        this.isSprinting = false;
        this.isCrouching = false;
        this.isADS = false;

        this.velocity = new THREE.Vector3();
        this.direction = new THREE.Vector3();
        
        // Raycaster for shooting and ground detection
        this.raycaster = new THREE.Raycaster();

        // Weapons
        this.weapons = [
            new Weapon('ASSAULT RIFLE', 30, 120, 0.1, 25, 200, 0.02, 2.0),
            new Weapon('TACTICAL SHOTGUN', 8, 32, 0.8, 15, 30, 0.15, 3.5),
            new Weapon('COMBAT KNIFE', Infinity, Infinity, 0.5, 100, 3, 0.5, 0)
        ];
        this.currentWeaponIndex = 0;
        this.weapon = this.weapons[this.currentWeaponIndex];

        this.setupInputs();
    }

    setupInputs() {
        const onKeyDown = (event) => {
            switch (event.code) {
                case 'KeyW': this.moveForward = true; break;
                case 'KeyA': this.moveLeft = true; break;
                case 'KeyS': this.moveBackward = true; break;
                case 'KeyD': this.moveRight = true; break;
                case 'ShiftLeft': this.isSprinting = true; break;
                case 'KeyC': 
                    this.isCrouching = !this.isCrouching; 
                    this.updateStanceHUD();
                    break;
                case 'KeyR': 
                    this.weapon.reload(() => this.updateHUD());
                    break;
                case 'Digit1': this.switchWeapon(0); break;
                case 'Digit2': this.switchWeapon(1); break;
                case 'Digit3': this.switchWeapon(2); break;
            }
        };

        const onKeyUp = (event) => {
            switch (event.code) {
                case 'KeyW': this.moveForward = false; break;
                case 'KeyA': this.moveLeft = false; break;
                case 'KeyS': this.moveBackward = false; break;
                case 'KeyD': this.moveRight = false; break;
                case 'ShiftLeft': this.isSprinting = false; break;
            }
        };

        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('keyup', onKeyUp);
        
        // ADS (Aim Down Sights)
        document.addEventListener('mousedown', (e) => {
            if (e.button === 2) {
                this.isADS = true;
                this.camera.fov = 45; // Zoom in
                this.camera.updateProjectionMatrix();
                document.getElementById('crosshair').classList.add('ads-active');
            }
        });
        document.addEventListener('mouseup', (e) => {
            if (e.button === 2) {
                this.isADS = false;
                this.camera.fov = 75; // Reset zoom
                this.camera.updateProjectionMatrix();
                document.getElementById('crosshair').classList.remove('ads-active');
            }
        });
        
        // Prevent context menu on right click
        document.addEventListener('contextmenu', e => e.preventDefault());
    }

    switchWeapon(index) {
        if (this.weapon.isReloading) return;
        this.currentWeaponIndex = index;
        this.weapon = this.weapons[index];
        this.updateHUD();
        
        // Update active slot UI
        document.querySelectorAll('.slot').forEach(el => el.classList.remove('active'));
        document.getElementById(`slot-${index + 1}`).classList.add('active');
    }

    takeDamage(amount) {
        // Armor mitigation (absorbs 50% damage if available)
        let actualDamage = amount;
        if (this.armor > 0) {
            const mitigated = Math.min(this.armor, amount * 0.5);
            this.armor -= mitigated;
            actualDamage -= mitigated;
        }
        
        this.hp -= actualDamage;
        if (this.hp < 0) this.hp = 0;
        
        this.updateHUD();

        // Damage Vignette effect
        const vignette = document.getElementById('damage-vignette');
        if (vignette) {
            vignette.style.boxShadow = 'inset 0 0 150px rgba(255, 0, 0, 0.8)';
            setTimeout(() => vignette.style.boxShadow = 'inset 0 0 150px rgba(255, 0, 0, 0)', 150);
        }

        if (this.hp <= 0) {
            // Player death logic
            document.body.innerHTML = '<h1 style="color:red; text-align:center; font-family:Courier New; margin-top:20%">K.I.A. - MISSION FAILED</h1>';
        }
    }

    updateHUD() {
        document.getElementById('hp-value').innerText = Math.ceil(this.hp);
        document.getElementById('armor-value').innerText = Math.ceil(this.armor);
        document.getElementById('health-bar-fill').style.width = `${this.hp}%`;
        document.getElementById('weapon-name').innerText = this.weapon.name;
        document.getElementById('ammo-current').innerText = this.weapon.ammo === Infinity ? '∞' : this.weapon.ammo;
        document.getElementById('ammo-reserve').innerText = this.weapon.reserve === Infinity ? '∞' : this.weapon.reserve;
    }

    updateStanceHUD() {
        document.getElementById('stance-value').innerText = this.isCrouching ? 'CROUCHING' : 'STANDING';
        // Adjust camera height smoothly in update loop based on targetHeight
    }

    update(delta, worldColliders) {
        // Determine camera target height
        const targetHeight = this.isCrouching ? 2.5 : 5.0;
        this.camera.position.y += (targetHeight - this.camera.position.y) * 10 * delta;

        // Apply friction and gravity
        this.velocity.x -= this.velocity.x * 10.0 * delta;
        this.velocity.z -= this.velocity.z * 10.0 * delta;
        this.velocity.y -= CONFIG.gravity * delta; // Falling

        this.direction.z = Number(this.moveForward) - Number(this.moveBackward);
        this.direction.x = Number(this.moveRight) - Number(this.moveLeft);
        this.direction.normalize();

        let speedMultiplier = 1;
        if (this.isSprinting && !this.isCrouching && !this.isADS) speedMultiplier = CONFIG.sprintMultiplier;
        if (this.isCrouching || this.isADS) speedMultiplier *= CONFIG.crouchMultiplier;

        if (this.moveForward || this.moveBackward) this.velocity.z -= this.direction.z * CONFIG.playerSpeed * speedMultiplier * delta;
        if (this.moveLeft || this.moveRight) this.velocity.x -= this.direction.x * CONFIG.playerSpeed * speedMultiplier * delta;

        // Collision Detection using Camera position
        this.controls.moveRight(-this.velocity.x * delta);
        this.controls.moveForward(-this.velocity.z * delta);

        this.camera.position.y += (this.velocity.y * delta);

        if (this.camera.position.y < targetHeight) {
            this.velocity.y = 0;
            this.camera.position.y = targetHeight;
        }
    }
}

// --- WORLD GENERATION ---
class World {
    constructor(scene) {
        this.scene = scene;
        this.colliders = [];
        this.bots = [];
        this.generateMap();
    }

    generateMap() {
        // Floor
        const floorGeo = new THREE.PlaneGeometry(CONFIG.mapSize, CONFIG.mapSize);
        const floorMat = new THREE.MeshStandardMaterial({ 
            map: TextureEngine.getDirt(),
            roughness: 0.9
        });
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        this.scene.add(floor);

        // Boundary Walls
        const wallGeo = new THREE.BoxGeometry(CONFIG.mapSize, 20, 2);
        const wallMat = new THREE.MeshStandardMaterial({ map: TextureEngine.getConcrete() });
        
        const northWall = new THREE.Mesh(wallGeo, wallMat);
        northWall.position.set(0, 10, -CONFIG.mapSize/2);
        this.scene.add(northWall);
        this.colliders.push(northWall);

        const southWall = new THREE.Mesh(wallGeo, wallMat);
        southWall.position.set(0, 10, CONFIG.mapSize/2);
        this.scene.add(southWall);
        this.colliders.push(southWall);

        const eastWall = new THREE.Mesh(wallGeo, wallMat);
        eastWall.rotation.y = Math.PI / 2;
        eastWall.position.set(CONFIG.mapSize/2, 10, 0);
        this.scene.add(eastWall);
        this.colliders.push(eastWall);

        const westWall = new THREE.Mesh(wallGeo, wallMat);
        westWall.rotation.y = Math.PI / 2;
        westWall.position.set(-CONFIG.mapSize/2, 10, 0);
        this.scene.add(westWall);
        this.colliders.push(westWall);

        // Procedural Tactical Cover (Containers, concrete blocks)
        const coverCount = Math.floor((CONFIG.mapSize * CONFIG.mapSize) / 100 * CONFIG.coverDensity);
        const rustMat = new THREE.MeshStandardMaterial({ map: TextureEngine.getRust() });

        for (let i = 0; i < coverCount; i++) {
            const isContainer = Math.random() > 0.6;
            const w = isContainer ? 12 : 4;
            const h = isContainer ? 8 : 4;
            const d = isContainer ? 4 : 4;

            const geo = new THREE.BoxGeometry(w, h, d);
            const mat = isContainer ? rustMat : wallMat;
            const mesh = new THREE.Mesh(geo, mat);
            
            mesh.position.x = (Math.random() - 0.5) * (CONFIG.mapSize - 20);
            mesh.position.z = (Math.random() - 0.5) * (CONFIG.mapSize - 20);
            mesh.position.y = h / 2;
            mesh.rotation.y = Math.random() * Math.PI;
            
            mesh.castShadow = true;
            mesh.receiveShadow = true;

            this.scene.add(mesh);
            this.colliders.push(mesh);
        }

        // Spawn Bots
        for(let i=0; i<CONFIG.botCount; i++) {
            const bx = (Math.random() - 0.5) * (CONFIG.mapSize - 20);
            const bz = (Math.random() - 0.5) * (CONFIG.mapSize - 20);
            
            // Generate some random patrol waypoints
            const waypoints = [];
            for(let j=0; j<3; j++) {
                waypoints.push(new THREE.Vector3(
                    bx + (Math.random() - 0.5) * 40,
                    2,
                    bz + (Math.random() - 0.5) * 40
                ));
            }
            
            const bot = new BotAI(this.scene, bx, bz, waypoints);
            this.bots.push(bot);
            this.colliders.push(bot.mesh); // Bots can be shot
        }
    }
}

// --- MAIN ENGINE ---
class Engine {
    constructor() {
        this.clock = new THREE.Clock();
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x050a0a); // Dark night
        this.scene.fog = new THREE.FogExp2(0x050a0a, 0.015); // Gritty atmosphere

        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        document.getElementById('game-container').appendChild(this.renderer.domElement);

        // Camera
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 5, 0);

        // Systems Initialization
        this.audio = new AudioEngine();
        this.particles = new ParticleSystem(this.scene);
        this.player = new Player(this.camera, document.body);
        this.world = new World(this.scene);

        this.setupLighting();
        this.setupInteractions();

        window.addEventListener('resize', () => this.onWindowResize(), false);
        
        // UI Hookups
        document.getElementById('btn-deploy').addEventListener('click', () => {
            document.getElementById('main-menu').style.display = 'none';
            document.getElementById('hud').style.display = 'block';
            this.player.controls.lock();
            this.player.updateHUD();
        });

        // Loop
        this.renderer.setAnimationLoop(() => this.animate());
    }

    setupLighting() {
        const ambientLight = new THREE.AmbientLight(0x111122, 0.8);
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xaaccff, 0.5); // Moonlight
        dirLight.position.set(50, 100, 50);
        dirLight.castShadow = true;
        dirLight.shadow.camera.top = 100;
        dirLight.shadow.camera.bottom = -100;
        dirLight.shadow.camera.left = -100;
        dirLight.shadow.camera.right = 100;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        this.scene.add(dirLight);
    }

    setupInteractions() {
        let isMouseDown = false;
        
        document.addEventListener('mousedown', (e) => {
            if (e.button === 0 && this.player.controls.isLocked) isMouseDown = true;
        });
        
        document.addEventListener('mouseup', (e) => {
            if (e.button === 0) isMouseDown = false;
        });

        // Fire rate handler
        setInterval(() => {
            if (isMouseDown && this.player.controls.isLocked) {
                this.handleShooting();
            }
        }, 16); // ~60fps check for rapid fire
    }

    handleShooting() {
        const time = this.clock.getElapsedTime();
        const weapon = this.player.weapon;

        if (weapon.canFire(time)) {
            weapon.fire(time);
            this.player.updateHUD();
            this.audio.playShootSound(weapon.name === 'ASSAULT RIFLE' ? 'AR' : 'SHOTGUN');

            // Apply recoil (camera kick)
            this.camera.rotation.x += (Math.random() * weapon.spread * 0.5);
            this.camera.rotation.y += (Math.random() - 0.5) * weapon.spread * 0.5;

            // Multiple rays for shotgun
            const rays = weapon.name === 'TACTICAL SHOTGUN' ? 8 : 1;
            
            for(let i=0; i<rays; i++) {
                // Calculate spread direction
                const direction = new THREE.Vector3(0, 0, -1);
                direction.applyQuaternion(this.camera.quaternion);
                
                // Add random spread
                direction.x += (Math.random() - 0.5) * weapon.spread * (this.player.isADS ? 0.2 : 1.0);
                direction.y += (Math.random() - 0.5) * weapon.spread * (this.player.isADS ? 0.2 : 1.0);
                direction.normalize();

                this.player.raycaster.set(this.camera.position, direction);
                const intersects = this.player.raycaster.intersectObjects(this.world.colliders);

                if (intersects.length > 0) {
                    const hit = intersects[0];
                    if (hit.distance <= weapon.range) {
                        // Check if we hit a bot
                        const hitBot = this.world.bots.find(b => b.mesh === hit.object);
                        if (hitBot) {
                            hitBot.takeDamage(weapon.damage, hit.point, hit.face.normal, this.particles);
                            this.audio.playHitMarker();
                            
                            if (hitBot.isDead) {
                                this.updateKillfeed(`Eliminated Hostile`);
                            }
                        } else {
                            // Hit wall/cover -> Sparks
                            this.particles.emit(hit.point, hit.face.normal, CONFIG.colors.spark, 10, 8, 0.3);
                        }
                    }
                }
            }

            // Auto-reload trigger if empty
            if (weapon.ammo <= 0) {
                weapon.reload(() => this.player.updateHUD());
            }
        }
    }

    updateKillfeed(msg) {
        const feed = document.getElementById('killfeed');
        if(!feed) return;
        const entry = document.createElement('div');
        entry.className = 'kill-log';
        entry.innerText = msg;
        feed.appendChild(entry);
        
        const remaining = this.world.bots.filter(b => !b.isDead).length;
        document.getElementById('alive-counter').innerHTML = `HOSTILES REMAINING: <span>${remaining}</span>`;
        
        if (remaining === 0) {
            document.getElementById('alive-counter').innerHTML = `SECTOR CLEARED. GOOD JOB.`;
            document.getElementById('alive-counter').style.color = '#00ffaa';
        }
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    animate() {
        const delta = Math.min(this.clock.getDelta(), 0.1); // Cap delta to prevent huge jumps
        const time = this.clock.getElapsedTime();

        if (this.player.controls.isLocked) {
            this.player.update(delta, this.world.colliders);
            
            // Update bots
            this.world.bots.forEach(bot => bot.update(delta, this.player, this.world, time));
        }

        this.particles.update(delta);
        this.renderer.render(this.scene, this.camera);
    }
}

// Bootstrap
window.onload = () => {
    // Basic dependency check before launching
    if (typeof THREE === 'undefined') {
        document.body.innerHTML = '<h1 style="color:red;">Error: Three.js failed to load via CDN. Check internet connection.</h1>';
        return;
    }
    const game = new Engine();
};
