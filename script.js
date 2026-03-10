const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d', { alpha: false }); // Otimização para não usar transparência no fundo root
const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');
const playerNameInput = document.getElementById('player-name');
const finalScoreEl = document.getElementById('final-score');
const leaderboardList = document.getElementById('leaderboard-list');

// Variáveis Globais e Estado
const GAME_WIDTH = 4000;
const GAME_HEIGHT = 4000;
let lastTime = 0;
let isPlaying = false;
let camera = { x: 0, y: 0, zoom: 1 };
let frameCount = 0;

// Otimização: Canvas Offscreen para o Fundo (Grid)
const bgCanvas = document.createElement('canvas');
const bgCtx = bgCanvas.getContext('2d');
bgCanvas.width = 1000;
bgCanvas.height = 1000;

function preRenderBackground() {
    bgCtx.fillStyle = "#01011A";
    bgCtx.fillRect(0, 0, 1000, 1000);
    bgCtx.strokeStyle = "rgba(255, 42, 109, 0.08)";
    bgCtx.lineWidth = 2;
    const step = 100;
    bgCtx.beginPath();
    for (let x = 0; x <= 1000; x += step) {
        bgCtx.moveTo(x, 0); bgCtx.lineTo(x, 1000);
    }
    for (let y = 0; y <= 1000; y += step) {
        bgCtx.moveTo(0, y); bgCtx.lineTo(1000, y);
    }
    bgCtx.stroke();
}
preRenderBackground();

// Arrays de Entidades
let player;
let bots = [];
let foods = [];
let particles = [];

// Dados para a temática Fashion
const botNames = ["Gisele", "Naomi", "Kendall", "Bella", "Gigi", "Tyra", "Heidi", "Adriana", "Cara", "Miranda", "Karlie", "Alessandra"];
const foodEmojis = ["✨", "💎", "⭐", "💄", "👠", "👜", "💋", "👗", "🎀"];
const botColors = ["#05d9e8", "#ff00ff", "#ffd700", "#00ff00", "#ffaa00", "#9900ff", "#ff5555"];
const botHairColors = ["#000000", "#ffbb00", "#8b4513", "#a52a2a", "#808080", "#baa3ff", "#ff69b4"];

// Input (Mouse / Touch)
let mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2, active: false };

// Responsividade
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize(); // Chamada inicial

// Eventos de Entrada
function updateMousePos(clientX, clientY) {
    mouse.x = clientX;
    mouse.y = clientY;
    mouse.active = true;
}
window.addEventListener('mousemove', (e) => updateMousePos(e.clientX, e.clientY));
window.addEventListener('touchmove', (e) => updateMousePos(e.touches[0].clientX, e.touches[0].clientY), { passive: false });
window.addEventListener('touchstart', (e) => updateMousePos(e.touches[0].clientX, e.touches[0].clientY), { passive: false });

// ----- Classes -----

class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 8;
        this.vy = (Math.random() - 0.5) * 8;
        this.life = 1.0;
        this.decay = Math.random() * 0.02 + 0.02;
        this.color = color;
        this.size = Math.random() * 5 + 2;
    }
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life -= this.decay;
        this.size *= 0.95;
    }
    draw(ctx) {
        ctx.globalAlpha = Math.max(0, this.life);
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    }
}

class Food {
    constructor(x, y, value = 1, emoji = null) {
        this.x = x;
        this.y = y;
        this.value = value;
        this.radius = 12 + (value * 1.5);
        this.emoji = emoji || foodEmojis[Math.floor(Math.random() * foodEmojis.length)];
        this.floatOffset = Math.random() * Math.PI * 2;
        this.animY = 0;
    }
    update(time) {
        this.animY = Math.sin(time * 0.005 + this.floatOffset) * 4;
    }
    draw(ctx) {
        ctx.font = `${this.radius * 2}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.emoji, this.x, this.y + this.animY);
    }
}

class Snake {
    constructor(x, y, name, isPlayer = false, customHairColor = null, customBodyColor = null) {
        this.isPlayer = isPlayer;
        this.name = name;
        this.hairColor = isPlayer ? (customHairColor || "#ffbb00") : botHairColors[Math.floor(Math.random() * botHairColors.length)];

        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;

        this.speed = isPlayer ? 4.5 : 3.5;
        this.angle = Math.random() * Math.PI * 2;
        this.targetAngle = this.angle;
        this.turnSpeed = isPlayer ? 0.15 : 0.08;

        this.segments = [];
        this.length = 15;
        this.radius = 20;
        this.score = 0;
        this.dead = false;

        this.color = isPlayer ? (customBodyColor || "#ff2a6d") : botColors[Math.floor(Math.random() * botColors.length)];

        for (let i = 0; i < this.length; i++) {
            this.segments.push({ x: x, y: y });
        }
    }

    update(dt) {
        if (this.isPlayer) {
            if (mouse.active) {
                let targetX = mouse.x - canvas.width / 2;
                let targetY = mouse.y - canvas.height / 2;
                this.targetAngle = Math.atan2(targetY, targetX);
            }
        } else {
            if (Math.random() < 0.02) {
                this.targetAngle += (Math.random() - 0.5) * 2;
            }

            if (Math.random() < 0.1) {
                let closest = null;
                let minDist = 300;
                for (let f of foods) {
                    let d = Math.hypot(f.x - this.x, f.y - this.y);
                    if (d < minDist) {
                        minDist = d;
                        closest = f;
                    }
                }
                if (closest) {
                    this.targetAngle = Math.atan2(closest.y - this.y, closest.x - this.x);
                }
            }

            const margin = 300;
            if (this.x < margin) this.targetAngle = 0;
            else if (this.x > GAME_WIDTH - margin) this.targetAngle = Math.PI;

            if (this.y < margin) this.targetAngle = Math.PI / 2;
            else if (this.y > GAME_HEIGHT - margin) this.targetAngle = -Math.PI / 2;
        }

        let dAngle = this.targetAngle - this.angle;
        while (dAngle > Math.PI) dAngle -= Math.PI * 2;
        while (dAngle < -Math.PI) dAngle += Math.PI * 2;

        this.angle += dAngle * this.turnSpeed;

        this.vx = Math.cos(this.angle) * this.speed;
        this.vy = Math.sin(this.angle) * this.speed;

        this.x += this.vx;
        this.y += this.vy;

        // NOVO: Morrer na barreira
        if (this.x < 0 || this.x > GAME_WIDTH || this.y < 0 || this.y > GAME_HEIGHT) {
            this.dead = true;
        }

        let dist = 12;
        let prev = { x: this.x, y: this.y };

        for (let i = 0; i < this.segments.length; i++) {
            let seg = this.segments[i];
            let dx = prev.x - seg.x;
            let dy = prev.y - seg.y;
            let d = Math.hypot(dx, dy);

            if (d > dist) {
                seg.x += (dx / d) * (d - dist);
                seg.y += (dy / d) * (d - dist);
            }
            prev = { x: seg.x, y: seg.y };
        }
    }

    draw(ctx) {
        // Otimização de Culling: Não desenha se estiver fora da tela
        const screenMargin = this.radius * 2;
        const camLeft = camera.x - screenMargin / camera.zoom;
        const camRight = camera.x + (canvas.width + screenMargin) / camera.zoom;
        const camTop = camera.y - screenMargin / camera.zoom;
        const camBot = camera.y + (canvas.height + screenMargin) / camera.zoom;

        if (this.x < camLeft || this.x > camRight || this.y < camTop || this.y > camBot) {
            // Se a cabeça está fora, checa se algum segmento está dentro (simples bounding box)
            // Para performar melhor, vamos simplificar: se a cabeça está muito longe, ignora.
            let distPlayer = Math.hypot(this.x - player.x, this.y - player.y);
            if (distPlayer > 2000) return;
        }

        for (let i = this.segments.length - 1; i >= 0; i--) {
            let seg = this.segments[i];
            let sizeRatio = 1 - Math.pow(i / this.segments.length, 3) * 0.5;
            let rad = this.radius * sizeRatio;

            ctx.beginPath();
            ctx.arc(seg.x, seg.y, rad, 0, Math.PI * 2);
            ctx.fillStyle = this.color;
            ctx.fill();

            ctx.strokeStyle = "rgba(0,0,0,0.2)";
            ctx.lineWidth = 1;
            ctx.stroke();

            if (i % 5 === 0 && i !== 0) {
                ctx.fillStyle = "rgba(255,255,255,0.3)";
                ctx.beginPath();
                ctx.arc(seg.x, seg.y, rad * 0.3, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        // Glowing effect (Otimizado: apenas para player ou quando visível)
        if (this.isPlayer) {
            ctx.shadowColor = this.color;
            ctx.shadowBlur = 10;
        }

        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 1.1, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.save();
        ctx.rotate(Math.PI / 2);

        ctx.fillStyle = this.hairColor;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 1.15, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#ffcc00";
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.85, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "rgba(255, 105, 180, 0.5)";
        ctx.beginPath();
        ctx.arc(-this.radius * 0.4, this.radius * 0.2, this.radius * 0.15, 0, Math.PI * 2);
        ctx.arc(this.radius * 0.4, this.radius * 0.2, this.radius * 0.15, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.lineCap = "round";
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#444";
        ctx.arc(-this.radius * 0.3, -this.radius * 0.1, this.radius * 0.15, Math.PI, 0);
        ctx.moveTo(this.radius * 0.15, -this.radius * 0.1);
        ctx.arc(this.radius * 0.3, -this.radius * 0.1, this.radius * 0.15, Math.PI, 0);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(0, this.radius * 0.1, this.radius * 0.4, 0.1 * Math.PI, 0.9 * Math.PI);
        ctx.stroke();

        ctx.fillStyle = this.hairColor;
        ctx.beginPath();
        ctx.arc(0, -this.radius * 0.1, this.radius * 0.9, Math.PI, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        ctx.rotate(-this.angle);
        ctx.font = "bold 13px Outfit";
        ctx.textAlign = "center";

        let textWidth = ctx.measureText(this.name).width;
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.beginPath();
        ctx.roundRect(-textWidth / 2 - 6, -this.radius - 28, textWidth + 12, 18, 5);
        ctx.fill();

        ctx.fillStyle = "white";
        ctx.fillText(this.name, 0, -this.radius - 14);

        ctx.restore();
    }

    eat(value) {
        this.score += value;
        let growAmount = Math.ceil(value / 2);
        for (let i = 0; i < growAmount; i++) {
            let last = this.segments[this.segments.length - 1];
            this.segments.push({ x: last.x, y: last.y });
        }
        this.radius = Math.min(45, 20 + this.score * 0.04);
    }

    die() {
        let foodToSpawn = Math.min(60, Math.floor(this.score / 2) + 10);
        for (let i = 0; i < foodToSpawn; i++) {
            let seg = this.segments[Math.floor(Math.random() * this.segments.length)];
            let x = seg.x + (Math.random() - 0.5) * 40;
            let y = seg.y + (Math.random() - 0.5) * 40;
            let isBig = Math.random() > 0.85;
            foods.push(new Food(x, y, isBig ? 5 : 1));
            if (particles.length < 150) {
                particles.push(new Particle(x, y, this.color));
            }
        }
    }
}

// ----- Funções Principais -----

function initGame(pName, pHairColor, pBodyColor) {
    let nome = pName.trim() || "Super Model";
    player = new Snake(GAME_WIDTH / 2, GAME_HEIGHT / 2, nome, true, pHairColor, pBodyColor);
    bots = [];
    foods = [];
    particles = [];
    mouse.active = false;

    for (let i = 0; i < 20; i++) { // Reduzido bots de 25 para 20
        spawnBot();
    }

    for (let i = 0; i < 350; i++) { // Reduzido comida de 400 para 350
        foods.push(new Food(Math.random() * GAME_WIDTH, Math.random() * GAME_HEIGHT));
    }

    isPlaying = true;
    lastTime = performance.now();
    startScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    requestAnimationFrame(gameLoop);
}

function spawnBot() {
    let x = Math.random() * GAME_WIDTH;
    let y = Math.random() * GAME_HEIGHT;
    if (player && Math.hypot(x - player.x, y - player.y) < 800) {
        x = (x + 1500) % GAME_WIDTH;
    }
    let name = botNames[Math.floor(Math.random() * botNames.length)];
    let bot = new Snake(x, y, name, false);
    let startScore = Math.floor(Math.random() * 40) + 5;
    bot.score = startScore;
    bot.eat(0);
    bots.push(bot);
}

function checkCollisions() {
    // 1. Coleta de Itens (Otimizado: apenas player e bots próximos)
    for (let i = foods.length - 1; i >= 0; i--) {
        let f = foods[i];

        // Player come
        let d = Math.hypot(player.x - f.x, player.y - f.y);
        if (d < player.radius + f.radius) {
            player.eat(f.value);
            if (particles.length < 200) {
                for (let p = 0; p < 3; p++) particles.push(new Particle(f.x, f.y, "#ffd700"));
            }
            foods.splice(i, 1);
            continue;
        }

        // Bots comem (apenas se estiverem "perto" do player para economizar CPU, ou loop normal simplificado)
        for (let bot of bots) {
            let dBot = Math.hypot(bot.x - f.x, bot.y - f.y);
            if (dBot < bot.radius + f.radius + 10) {
                bot.eat(f.value);
                foods.splice(i, 1);
                break;
            }
        }
    }

    if (foods.length < 300 && Math.random() < 0.05) {
        foods.push(new Food(Math.random() * GAME_WIDTH, Math.random() * GAME_HEIGHT));
    }

    // 2. Colisões de Cobras
    let allSnakes = [player, ...bots];
    let deadSnakes = [];

    for (let s1 of allSnakes) {
        if (s1.dead) {
            if (!deadSnakes.includes(s1)) deadSnakes.push(s1);
            continue;
        }

        for (let s2 of allSnakes) {
            if (s1 === s2) continue;

            // Distância grosseira antes de checar segmentos (Otimização)
            if (Math.hypot(s1.x - s2.x, s1.y - s2.y) > 1500) continue;

            for (let i = 0; i < s2.segments.length; i += 3) { // Checa a cada 3 segmentos (Otimização)
                let seg = s2.segments[i];
                let d = Math.hypot(s1.x - seg.x, s1.y - seg.y);
                let hitDist = (s1.radius * 0.7) + (s2.radius * 0.7);
                if (d < hitDist) {
                    if (!deadSnakes.includes(s1)) deadSnakes.push(s1);
                    break;
                }
            }
            if (deadSnakes.includes(s1)) break;
        }
    }

    for (let snake of deadSnakes) {
        snake.die();
        if (snake === player) {
            endGame();
        } else {
            let index = bots.indexOf(snake);
            if (index !== -1) bots.splice(index, 1);
            setTimeout(spawnBot, 3000);
        }
    }
}

function updateLeaderboard() {
    let allSnakes = [player, ...bots];
    allSnakes.sort((a, b) => b.score - a.score);
    let html = "";
    for (let i = 0; i < Math.min(10, allSnakes.length); i++) {
        let s = allSnakes[i];
        let isP = (s === player);
        html += `<li class="${isP ? 'player-row' : ''}">
            <span>${i + 1}. ${s.name}</span>
            <span>${Math.floor(s.score)}</span>
        </li>`;
    }
    leaderboardList.innerHTML = html;
}

function drawBackground() {
    // Desenha o grid usando o canvas pre-renderizado (Muito mais rápido!)
    const step = 1000;
    const startX = Math.floor(camera.x / step) * step;
    const startY = Math.floor(camera.y / step) * step;

    // Desenha tiles visíveis
    for (let x = startX - step; x <= startX + canvas.width + step; x += step) {
        for (let y = startY - step; y <= startY + canvas.height + step; y += step) {
            if (x >= 0 && x < GAME_WIDTH && y >= 0 && y < GAME_HEIGHT) {
                ctx.drawImage(bgCanvas, x, y);
            }
        }
    }

    // Bordas do Mundo (Neon Cyan)
    ctx.strokeStyle = "rgba(5, 217, 232, 0.8)";
    ctx.lineWidth = 15;
    ctx.strokeRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
}

function gameLoop(time) {
    if (!isPlaying) return;

    let dt = time - lastTime;
    lastTime = time;
    frameCount++;

    player.update(dt);
    for (let bot of bots) bot.update(dt);

    // Otimização: Update de comida apenas para as visíveis ou a cada N frames
    for (let food of foods) {
        if (Math.hypot(food.x - player.x, food.y - player.y) < 1000) {
            food.update(time);
        }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update();
        if (particles[i].life <= 0) particles.splice(i, 1);
    }

    checkCollisions();

    if (frameCount % 30 === 0) {
        updateLeaderboard();
    }

    let targetCamX = player.x - canvas.width / 2;
    let targetCamY = player.y - canvas.height / 2;
    let targetZoom = 1 - (player.score * 0.00025);
    targetZoom = Math.max(0.45, targetZoom);

    camera.x += (targetCamX - camera.x) * 0.1;
    camera.y += (targetCamY - camera.y) * 0.1;
    camera.zoom += (targetZoom - camera.zoom) * 0.05;

    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-canvas.width / 2, -canvas.height / 2);
    ctx.translate(-camera.x, -camera.y);

    drawBackground();

    // Culling para Comida
    const viewDist = 1000 / camera.zoom;
    for (let food of foods) {
        if (Math.abs(food.x - player.x) < viewDist && Math.abs(food.y - player.y) < viewDist) {
            food.draw(ctx);
        }
    }

    for (let particle of particles) particle.draw(ctx);

    for (let bot of bots) {
        if (bot !== player) bot.draw(ctx);
    }
    if (player) player.draw(ctx);

    ctx.restore();

    requestAnimationFrame(gameLoop);
}

function endGame() {
    isPlaying = false;
    finalScoreEl.innerText = Math.floor(player.score);
    gameOverScreen.classList.remove('hidden');
}

// Listeners de UI
startBtn.addEventListener('click', () => {
    initGame(playerNameInput.value, document.getElementById('hair-color').value, document.getElementById('body-color').value);
});

restartBtn.addEventListener('click', () => {
    initGame(playerNameInput.value, document.getElementById('hair-color').value, document.getElementById('body-color').value);
});

// Animação leve na Tela Inicial
let idleAngle = 0;
function idleLoop(time) {
    if (isPlaying) return;
    ctx.fillStyle = "rgba(1, 1, 43, 0.1)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    let cx = canvas.width / 2;
    let cy = canvas.height / 2;
    idleAngle += 0.015;
    let x = cx + Math.cos(idleAngle) * 200;
    let y = cy + Math.sin(idleAngle * 2) * 100;
    ctx.shadowColor = "#ff2a6d";
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.arc(x, y, 15, 0, Math.PI * 2);
    ctx.fillStyle = "#ff2a6d";
    ctx.fill();
    ctx.shadowBlur = 0;
    requestAnimationFrame(idleLoop);
}
idleLoop(0);

