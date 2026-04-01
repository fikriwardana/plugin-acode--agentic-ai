// minigames.js
// Handles Minigame Graphics and Logic (Canvas-based)

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const scoreDisplay = document.getElementById('game-score');

let score = 0;
let isPlaying = false;
let entities = [];
let pouPos = { x: 0, y: 0, w: 60, h: 60 }; // Simplified Pou hitbox

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    pouPos.x = canvas.width / 2;
    pouPos.y = canvas.height - 100;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function drawGlassRect(x, y, w, h, color = 'rgba(255,255,255,0.4)') {
    ctx.save();
    ctx.fillStyle = color;
    ctx.shadowColor = 'rgba(0,0,0,0.2)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 5;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 10);
    ctx.fill();
    ctx.restore();
}

function updateScore(add = 1) {
    score += add;
    scoreDisplay.textContent = score;
    // Bounce animation
    scoreDisplay.style.transform = 'scale(1.5)';
    setTimeout(() => {
        scoreDisplay.style.transform = 'scale(1)';
    }, 150);
}

// ---------------------------------------------------------
// 1. SKY CLIMBER (Head Tilt controls X, Auto Jump Y)
// ---------------------------------------------------------
let climberState = { velY: 0, gravity: 0.5, jumpForce: -12 };

function startClimber() {
    isPlaying = true;
    score = 0;
    updateScore(0);
    entities = [];
    pouPos.x = canvas.width / 2;
    pouPos.y = canvas.height - 100;
    climberState.velY = climberState.jumpForce;

    // Initial Platforms
    for (let i = 0; i < 6; i++) {
        entities.push({
            x: Math.random() * (canvas.width - 100),
            y: canvas.height - (i * 150),
            w: 100, h: 20
        });
    }
}

function updateClimber(arData, dt) {
    if (!isPlaying) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Controls (Head Tilt -> X Velocity)
    // arData.headTilt is approx -45 to 45 degrees
    const tilt = arData.headTilt;
    let targetX = pouPos.x + (tilt * 0.1); // Sensitivity

    // Smooth X movement (Lerp)
    pouPos.x = window.AR_ENGINE.lerp(pouPos.x, targetX, 0.2);

    // Screen Wrap
    if (pouPos.x < -pouPos.w) pouPos.x = canvas.width;
    if (pouPos.x > canvas.width) pouPos.x = -pouPos.w;

    // 2. Physics (Auto Jump on platforms)
    climberState.velY += climberState.gravity;
    pouPos.y += climberState.velY;

    // 3. Camera Follow (Scroll down if Pou goes high)
    if (pouPos.y < canvas.height / 2) {
        const diff = (canvas.height / 2) - pouPos.y;
        pouPos.y += diff;
        entities.forEach(p => p.y += diff);
        updateScore();
    }

    // 4. Collision (Only falling down)
    if (climberState.velY > 0) {
        entities.forEach(p => {
            if (pouPos.x + pouPos.w > p.x && pouPos.x < p.x + p.w &&
                pouPos.y + pouPos.h > p.y && pouPos.y + pouPos.h < p.y + p.h + climberState.velY) {
                // Hit platform!
                climberState.velY = climberState.jumpForce;
                // Add jump animation to DOM Pou
                document.getElementById('pou').classList.add('jumping');
                setTimeout(() => document.getElementById('pou').classList.remove('jumping'), 800);
            }
        });
    }

    // 5. Render Platforms
    entities.forEach(p => {
        drawGlassRect(p.x, p.y, p.w, p.h, 'rgba(135, 206, 235, 0.6)');
    });

    // Generate new platforms
    entities = entities.filter(p => p.y < canvas.height);
    while (entities.length < 6) {
        entities.push({
            x: Math.random() * (canvas.width - 100),
            y: entities[entities.length-1].y - 150,
            w: 100, h: 20
        });
    }

    // Sync DOM Pou Position to Canvas Hitbox
    document.getElementById('scene').style.transform = `translate(${pouPos.x - canvas.width/2 + 100}px, ${pouPos.y - canvas.height/2 + 100}px) scale(0.5)`;

    // Game Over
    if (pouPos.y > canvas.height) {
        stopAll();
        alert(`Game Over! Skor: ${score}`);
        document.getElementById('btn-exit-game').click();
    }
}

// ---------------------------------------------------------
// 2. HEAD RACING (Nose X steers, Eyebrow = Boost)
// ---------------------------------------------------------
let racingState = { speed: 5, baseSpeed: 5, boostMultiplier: 2 };

function startRacing() {
    isPlaying = true;
    score = 0;
    updateScore(0);
    entities = [];
    pouPos.x = canvas.width / 2;
    pouPos.y = canvas.height - 150;
    racingState.speed = racingState.baseSpeed;

    // Spawn Obstacles
    for (let i = 0; i < 5; i++) {
        entities.push(createObstacle(i * -200));
    }
}

function createObstacle(yPos) {
    return {
        x: Math.random() * (canvas.width - 60),
        y: yPos,
        w: 60, h: 60,
        type: Math.random() > 0.8 ? 'coin' : 'rock'
    };
}

function updateRacing(arData, dt) {
    if (!isPlaying) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Controls (Nose X)
    // Map Nose X (0.0 to 1.0) to Canvas Width
    // Camera is mirrored, so 1.0 is left, 0.0 is right.
    const targetX = (1 - arData.nose.x) * canvas.width;
    pouPos.x = window.AR_ENGINE.lerp(pouPos.x, targetX, 0.2);

    // 2. Boost (Eyebrow Raise)
    if (arData.eyebrowRaise) {
        racingState.speed = window.AR_ENGINE.lerp(racingState.speed, racingState.baseSpeed * racingState.boostMultiplier, 0.2);
        setExpression('angry'); // defined in game.js, accessible globally via window if we attach it, but let's assume it's scoped properly or we just add the class directly here
        document.getElementById('pou').classList.add('angry');
        document.body.classList.add('angry-mode');
    } else {
        racingState.speed = window.AR_ENGINE.lerp(racingState.speed, racingState.baseSpeed, 0.1);
        document.getElementById('pou').classList.remove('angry');
        document.body.classList.remove('angry-mode');
    }

    // 3. Move Obstacles Down
    entities.forEach(obs => {
        obs.y += racingState.speed;

        // Render
        if (obs.type === 'coin') {
            ctx.fillStyle = 'gold';
            ctx.beginPath();
            ctx.arc(obs.x + 30, obs.y + 30, 15, 0, Math.PI * 2);
            ctx.fill();
        } else {
            drawGlassRect(obs.x, obs.y, obs.w, obs.h, 'rgba(255, 107, 107, 0.8)');
        }

        // 4. Collision
        if (pouPos.x < obs.x + obs.w && pouPos.x + pouPos.w > obs.x &&
            pouPos.y < obs.y + obs.h && pouPos.y + pouPos.h > obs.y) {

            if (obs.type === 'coin') {
                updateScore(10);
                obs.y = canvas.height + 100; // Force respawn
            } else {
                // Hit Rock - Game Over
                stopAll();
                document.getElementById('pou').classList.remove('angry');
                document.body.classList.remove('angry-mode');
                alert(`Terabrak! Skor: ${score}`);
                document.getElementById('btn-exit-game').click();
            }
        }
    });

    // Respawn Obstacles
    entities = entities.filter(obs => obs.y < canvas.height);
    while (entities.length < 5) {
        entities.push(createObstacle(entities[entities.length-1].y - 250));
        updateScore(1); // Passive score for surviving
    }

    // Sync DOM Pou Position
    document.getElementById('scene').style.transform = `translate(${pouPos.x - canvas.width/2 + 100}px, 0px) scale(0.6)`;
}

// ---------------------------------------------------------
// 3. FOOD FALL (Nose X to catch, Mouth Open to eat)
// ---------------------------------------------------------
let catchRadius = 50;

function startFoodFall() {
    isPlaying = true;
    score = 0;
    updateScore(0);
    entities = [];
    pouPos.x = canvas.width / 2;
    pouPos.y = canvas.height - 150;

    // Initial Food
    entities.push(createFood());
}

function createFood() {
    const emojis = ['🍎', '🍔', '🍰', '🍩', '🍕'];
    return {
        x: Math.random() * (canvas.width - 60),
        y: -50,
        emoji: emojis[Math.floor(Math.random() * emojis.length)],
        speed: 3 + Math.random() * 4
    };
}

function updateFoodFall(arData, dt) {
    if (!isPlaying) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Controls (Nose X)
    const targetX = (1 - arData.nose.x) * canvas.width;
    pouPos.x = window.AR_ENGINE.lerp(pouPos.x, targetX, 0.2);

    // 2. Mouth Open Logic (Eating State & Wider Catch Radius)
    if (arData.mouthOpen) {
        catchRadius = 100;
        document.getElementById('pou').classList.add('eating');
    } else {
        catchRadius = 50;
        document.getElementById('pou').classList.remove('eating');
    }

    // Draw Catch Area (Glassmorphism highlight)
    ctx.beginPath();
    ctx.arc(pouPos.x + 30, pouPos.y + 30, catchRadius, 0, Math.PI * 2);
    ctx.fillStyle = arData.mouthOpen ? 'rgba(46, 213, 115, 0.3)' : 'rgba(255, 255, 255, 0.1)';
    ctx.fill();

    // 3. Falling Food
    entities.forEach(food => {
        food.y += food.speed;

        ctx.font = '40px Arial';
        ctx.fillText(food.emoji, food.x, food.y);

        // Collision detection (Distance from center of mouth/hitbox)
        const dist = Math.sqrt(Math.pow((pouPos.x + 30) - (food.x + 20), 2) + Math.pow((pouPos.y + 30) - (food.y + 20), 2));

        if (dist < catchRadius) {
            // Caught!
            if (arData.mouthOpen) {
                updateScore(5);
                food.y = canvas.height + 100; // Force respawn

                // Spawn particles at mouth
                createParticles(pouPos.x, pouPos.y);
            }
        }
    });

    // Respawn Food
    entities = entities.filter(f => f.y < canvas.height);
    if (Math.random() < 0.02 && entities.length < 5) {
        entities.push(createFood());
    }

    // Sync DOM Pou Position
    document.getElementById('scene').style.transform = `translate(${pouPos.x - canvas.width/2 + 100}px, 0px) scale(0.6)`;
}

// Basic Particle System for eating
function createParticles(x, y) {
    const pContainer = document.getElementById('particles');
    const dot = document.createElement('div');
    dot.className = 'particle sparkle-dot';
    dot.style.left = `${x}px`;
    dot.style.top = `${y}px`;
    dot.style.setProperty('--tx', `${(Math.random() - 0.5) * 100}px`);
    dot.style.setProperty('--ty', `${(Math.random() - 0.5) * 100 - 50}px`);

    pContainer.appendChild(dot);
    setTimeout(() => pContainer.removeChild(dot), 1000);
}

// Global Exports
function stopAll() {
    isPlaying = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    document.getElementById('pou').classList.remove('eating', 'angry', 'jumping');
    document.body.classList.remove('angry-mode');
}

window.MINIGAMES = {
    startClimber, updateClimber,
    startRacing, updateRacing,
    startFoodFall, updateFoodFall,
    stopAll, createParticles
};