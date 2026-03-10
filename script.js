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
        this.size *= 0.95; // Encolhe com o tempo
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
        this.radius = 12 + (value * 1.5); // Itens mais valiosos são maiores
        this.emoji = emoji || foodEmojis[Math.floor(Math.random() * foodEmojis.length)];
        this.floatOffset = Math.random() * Math.PI * 2;
        this.animY = 0;
    }
    update(time) {
        // Efeito de flutuação vertical leve
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

        // Jogadores são levemente mais rápidos para ter vantagem mecânica
        this.speed = isPlayer ? 4.5 : 3.5;
        this.angle = Math.random() * Math.PI * 2;
        this.targetAngle = this.angle;
        this.turnSpeed = isPlayer ? 0.15 : 0.08;

        this.segments = [];
        this.length = 15; // Tamanho inicial (quantidade de segmentos)
        this.radius = 20; // Espessura
        this.score = 0;   // Pontuação de fama

        this.color = isPlayer ? (customBodyColor || "#ff2a6d") : botColors[Math.floor(Math.random() * botColors.length)];

        // Inicializa o corpo encolhido no ponto de spawn
        for (let i = 0; i < this.length; i++) {
            this.segments.push({ x: x, y: y });
        }
    }

    update(dt) {
        if (this.isPlayer) {
            // Segue o Mouse/Touch
            if (mouse.active) {
                // Como a câmera está centralizada, o centro da tela é o player
                let targetX = mouse.x - canvas.width / 2;
                let targetY = mouse.y - canvas.height / 2;
                this.targetAngle = Math.atan2(targetY, targetX);
            }
        } else {
            // IA Básica (Wander + Buscar Itens + Evitar Bordas)
            // 1. Aleatoriedade (Wander)
            if (Math.random() < 0.02) {
                this.targetAngle += (Math.random() - 0.5) * 2;
            }

            // 2. Buscar comida próxima
            if (Math.random() < 0.1) {
                let closest = null;
                let minDist = 300; // Raio de visão
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

            // 3. Evitar paredes (Edge steering force)
            const margin = 300;
            if (this.x < margin) this.targetAngle = 0;
            else if (this.x > GAME_WIDTH - margin) this.targetAngle = Math.PI;

            if (this.y < margin) this.targetAngle = Math.PI / 2;
            else if (this.y > GAME_HEIGHT - margin) this.targetAngle = -Math.PI / 2;
        }

        // Interpolação angular suave
        let dAngle = this.targetAngle - this.angle;
        // Normalizar para o caminho mais curto (-PI a PI)
        while (dAngle > Math.PI) dAngle -= Math.PI * 2;
        while (dAngle < -Math.PI) dAngle += Math.PI * 2;

        this.angle += dAngle * this.turnSpeed;

        // Movimento da Cabeça
        this.vx = Math.cos(this.angle) * this.speed;
        this.vy = Math.sin(this.angle) * this.speed;

        this.x += this.vx;
        this.y += this.vy;

        // Limites do Mundo (Clamp)
        this.x = Math.max(this.radius, Math.min(GAME_WIDTH - this.radius, this.x));
        this.y = Math.max(this.radius, Math.min(GAME_HEIGHT - this.radius, this.y));

        // Atualizar Segmentos (Cinemática Inversa Simples)
        let dist = 12; // Distância rígida entre cada segmento do corpo
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
        // Desenha o corpo do fim para o começo
        for (let i = this.segments.length - 1; i >= 0; i--) {
            let seg = this.segments[i];

            // A cauda afina suavemente no final
            let sizeRatio = 1 - Math.pow(i / this.segments.length, 3) * 0.5;
            let rad = this.radius * sizeRatio;

            ctx.beginPath();
            ctx.arc(seg.x, seg.y, rad, 0, Math.PI * 2);
            ctx.fillStyle = this.color;
            ctx.fill();

            // Borda do segmento
            ctx.strokeStyle = "rgba(0,0,0,0.3)";
            ctx.lineWidth = 1;
            ctx.stroke();

            // Detalhe de "Vestido longo / Brilho" a cada X segmentos
            if (i % 4 === 0 && i !== 0) {
                ctx.fillStyle = "rgba(255,255,255,0.4)";
                ctx.beginPath();
                ctx.arc(seg.x, seg.y, rad * 0.3, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Desenha a Cabeça
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle); // Rotaciona para a direção do movimento

        // Brilho / Glow em volta da cabeça
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 1.1, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.shadowBlur = 0;

        // Avatar (Rosto estilo Emoji + Cabelo Desenhado)
        ctx.save();
        ctx.rotate(Math.PI / 2); // Gira 90 graus para a modelo olhar para frente

        // Cabelo parte de tras
        ctx.fillStyle = this.hairColor;
        ctx.beginPath();
        // Cabelo bem cheio atrás
        ctx.arc(0, 0, this.radius * 1.15, 0, Math.PI * 2);
        ctx.fill();

        // Rosto (Base Amarela Emoji)
        ctx.fillStyle = "#ffcc00"; // Amarelo clássico de emoji
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.85, 0, Math.PI * 2);
        ctx.fill();

        // Bochechas rosadas
        ctx.fillStyle = "rgba(255, 105, 180, 0.5)";
        ctx.beginPath();
        ctx.arc(-this.radius * 0.4, this.radius * 0.2, this.radius * 0.15, 0, Math.PI * 2); // Esquerda
        ctx.arc(this.radius * 0.4, this.radius * 0.2, this.radius * 0.15, 0, Math.PI * 2);  // Direita
        ctx.fill();

        // Olhos (Estilo Emoji Alegre)
        ctx.beginPath();
        ctx.lineCap = "round";
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = "#444";
        // Olho Esquerdo (Curva feliz)
        ctx.arc(-this.radius * 0.3, -this.radius * 0.1, this.radius * 0.15, Math.PI, 0);
        // Olho Direito (Curva feliz)
        ctx.moveTo(this.radius * 0.15, -this.radius * 0.1);
        ctx.arc(this.radius * 0.3, -this.radius * 0.1, this.radius * 0.15, Math.PI, 0);
        ctx.stroke();

        // Boca (Sorriso Amplo)
        ctx.beginPath();
        ctx.arc(0, this.radius * 0.1, this.radius * 0.4, 0.1 * Math.PI, 0.9 * Math.PI);
        ctx.stroke();

        // Franja / Cabelo da frente (Cobrindo apenas a testa!)
        ctx.fillStyle = this.hairColor;
        ctx.beginPath();
        // Math.PI até Math.PI*2 desenha o arco na metade DE CIMA
        ctx.arc(0, -this.radius * 0.1, this.radius * 0.9, Math.PI, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        // Nome flutuante
        ctx.rotate(-this.angle); // Desfaz a rotação para o texto ficar reto
        ctx.font = "bold 14px Outfit";
        ctx.textAlign = "center";

        let textWidth = ctx.measureText(this.name).width;
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.beginPath();
        ctx.roundRect(-textWidth / 2 - 6, -this.radius - 28, textWidth + 12, 22, 5);
        ctx.fill();

        ctx.fillStyle = "white";
        ctx.fillText(this.name, 0, -this.radius - 12);

        ctx.restore();
    }

    eat(value) {
        this.score += value;
        // Adiciona 1 segmento extra a cada 2 pontos
        let growAmount = Math.ceil(value / 2);
        for (let i = 0; i < growAmount; i++) {
            let last = this.segments[this.segments.length - 1];
            this.segments.push({ x: last.x, y: last.y });
        }
        // Cresce levemente em espessura até um limite
        this.radius = Math.min(45, 20 + this.score * 0.04);
    }

    die() {
        // Dropa itens equivalente a uma parte da sua pontuação
        let foodToSpawn = Math.min(100, Math.floor(this.score / 2) + 10);

        for (let i = 0; i < foodToSpawn; i++) {
            // Distribui a comida ao longo dos segmentos do corpo
            let seg = this.segments[Math.floor(Math.random() * this.segments.length)];
            let x = seg.x + (Math.random() - 0.5) * 50;
            let y = seg.y + (Math.random() - 0.5) * 50;

            // 20% de chance de dropar um item valioso
            let isBig = Math.random() > 0.8;
            foods.push(new Food(x, y, isBig ? 5 : 1));

            // Efeito de explosão de partículas
            for (let p = 0; p < 3; p++) {
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

    // Spawn Bots
    for (let i = 0; i < 25; i++) {
        spawnBot();
    }

    // Spawn Comida Inicial
    for (let i = 0; i < 400; i++) {
        foods.push(new Food(Math.random() * GAME_WIDTH, Math.random() * GAME_HEIGHT));
    }

    isPlaying = true;
    lastTime = performance.now();

    // Esconder UI
    startScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');

    requestAnimationFrame(gameLoop);
}

function spawnBot() {
    let x = Math.random() * GAME_WIDTH;
    let y = Math.random() * GAME_HEIGHT;

    // Evita spawnar muito perto do player inicial
    if (player && Math.hypot(x - player.x, y - player.y) < 800) {
        x = (x + 1500) % GAME_WIDTH;
    }

    let name = botNames[Math.floor(Math.random() * botNames.length)];
    let bot = new Snake(x, y, name, false);

    // Bots dão spawn com tamanhos variados
    let startScore = Math.floor(Math.random() * 60) + 5;
    bot.score = startScore;
    bot.eat(0);
    bots.push(bot);
}

function checkCollisions() {
    // 1. Coleta de Itens
    for (let i = foods.length - 1; i >= 0; i--) {
        let f = foods[i];
        let d = Math.hypot(player.x - f.x, player.y - f.y);

        // Player comeu
        if (d < player.radius + f.radius) {
            player.eat(f.value);
            // Efeito visual de brilho
            for (let p = 0; p < 5; p++) particles.push(new Particle(f.x, f.y, "#ffd700"));
            foods.splice(i, 1);
            continue;
        }

        // Bot comeu
        for (let bot of bots) {
            let dBot = Math.hypot(bot.x - f.x, bot.y - f.y);
            // Bots tem 'hitbox' de coleta ligeiramente maior para compensar a IA simples
            if (dBot < bot.radius + f.radius + 15) {
                bot.eat(f.value);
                foods.splice(i, 1);
                break;
            }
        }
    }

    // Respawna comidas gradualmente no mapa
    if (foods.length < 300 && Math.random() < 0.1) {
        foods.push(new Food(Math.random() * GAME_WIDTH, Math.random() * GAME_HEIGHT));
    }

    // 2. Colisão Mortal (Morte se a CABEÇA encostar no CORPO do Oponente)
    let allSnakes = [player, ...bots];
    let deadSnakes = [];

    for (let s1 of allSnakes) {
        for (let s2 of allSnakes) {
            if (s1 === s2) continue; // Ignora colisão consigo mesmo

            // Check: A cabeça da cobra s1 bateu em algum segmento da cobra s2
            for (let i = 0; i < s2.segments.length; i += 2) { // Checa de 2 em 2 para otimização
                let seg = s2.segments[i];
                let d = Math.hypot(s1.x - seg.x, s1.y - seg.y);

                // Hitbox um pouco menor que o raio visual pra parecer mais justo (forgiving)
                let hitDist = (s1.radius * 0.7) + (s2.radius * 0.7);
                if (d < hitDist) {
                    if (!deadSnakes.includes(s1)) deadSnakes.push(s1);
                    break; // s1 já morreu, para a checagem pros outros segmentos
                }
            }
        }
    }

    // Processa os mortos
    for (let snake of deadSnakes) {
        snake.die(); // Explode em partículas e itens

        if (snake === player) {
            endGame(); // O jogador morreu
        } else {
            let index = bots.indexOf(snake);
            if (index !== -1) bots.splice(index, 1);
            // Repõe o bot na arena após 3 segundos
            setTimeout(spawnBot, 3000);
        }
    }
}

function updateLeaderboard() {
    let allSnakes = [player, ...bots];
    // Ordena por Fama (Score) descendente
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
    // Fundo Base 
    ctx.fillStyle = "#01011A";
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Grid simulando uma grande passarela / pista de estilo
    ctx.strokeStyle = "rgba(255, 42, 109, 0.08)";
    ctx.lineWidth = 2;
    const step = 150;

    ctx.beginPath();
    for (let x = 0; x <= GAME_WIDTH; x += step) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, GAME_HEIGHT);
    }
    for (let y = 0; y <= GAME_HEIGHT; y += step) {
        ctx.moveTo(0, y);
        ctx.lineTo(GAME_WIDTH, y);
    }
    ctx.stroke();

    // Bordas do Mundo (Neon Cyan)
    ctx.strokeStyle = "rgba(5, 217, 232, 0.8)";
    ctx.lineWidth = 15;
    ctx.strokeRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
}

function gameLoop(time) {
    if (!isPlaying) return; // Pausa se acabou

    let dt = time - lastTime;
    lastTime = time;
    frameCount++;

    // 1. Lógica (Update)
    player.update(dt);
    for (let bot of bots) bot.update(dt);
    for (let food of foods) food.update(time);

    // Atualiza partículas de trás pra frente para poder remover
    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update();
        if (particles[i].life <= 0) particles.splice(i, 1);
    }

    checkCollisions();

    // Atualiza Placar a cada 20 frames (Otimização)
    if (frameCount % 20 === 0) {
        updateLeaderboard();
    }

    // 2. Movimento da Câmera
    // A câmera foca no player
    let targetCamX = player.x - canvas.width / 2;
    let targetCamY = player.y - canvas.height / 2;

    // Afasta o zoom progressivamente conforme a cobra cresce
    let targetZoom = 1 - (player.score * 0.0003);
    targetZoom = Math.max(0.4, targetZoom); // Zoom máximo fora

    // Suavização da câmera (Lerp)
    camera.x += (targetCamX - camera.x) * 0.1;
    camera.y += (targetCamY - camera.y) * 0.1;
    camera.zoom += (targetZoom - camera.zoom) * 0.05;

    // 3. Renderização Escura fora do mapa
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();

    // Aplicação do Zoom centrado na tela
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-canvas.width / 2, -canvas.height / 2);

    // Aplicação do pan da câmera
    ctx.translate(-camera.x, -camera.y);

    drawBackground();

    // Ordem de desenho (Z-Index): Comida -> Particulas -> Bots -> Player(sempre em cima)
    for (let food of foods) food.draw(ctx);
    for (let particle of particles) particle.draw(ctx);
    for (let bot of bots) {
        if (bot !== player) bot.draw(ctx);
    }
    if (player) player.draw(ctx);

    ctx.restore();

    requestAnimationFrame(gameLoop); // Ciclo contínuo
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


// Animação leve na Tela Inicial (Idle Box Background)
let idleAngle = 0;
function idleLoop(time) {
    if (isPlaying) return; // Para quando entra no jogo

    ctx.fillStyle = "rgba(1, 1, 43, 0.05)"; // Efeito rastro tela de inicio
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let cx = canvas.width / 2;
    let cy = canvas.height / 2;

    idleAngle += 0.015;
    let x = cx + Math.cos(idleAngle) * 300;
    let y = cy + Math.sin(idleAngle * 2) * 150;

    ctx.shadowColor = "#ff2a6d";
    ctx.shadowBlur = 30;
    ctx.beginPath();
    ctx.arc(x, y, 20, 0, Math.PI * 2);
    ctx.fillStyle = "#ff2a6d";
    ctx.fill();
    ctx.shadowBlur = 0;

    requestAnimationFrame(idleLoop);
}
// Começa a animação da tela de menu
idleLoop(0);
