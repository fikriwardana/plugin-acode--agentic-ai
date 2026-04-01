// game.js
// Main Game Controller & Care Mode Logic

// Elements
const scene = document.getElementById('scene');
const pou = document.getElementById('pou');
const stats = {
    hunger: document.getElementById('hunger-stat'),
    happiness: document.getElementById('happiness-stat'),
    coins: document.getElementById('coins-stat')
};

// UI Elements
const menuOverlay = document.getElementById('menu-overlay');
const foodDrawer = document.getElementById('food-drawer');
const draggedFood = document.getElementById('dragged-food');
const minigameUI = document.getElementById('minigame-ui');
const onboardingOverlay = document.getElementById('onboarding-overlay');

// Game State
let currentState = 'care'; // care, climber, racing, foodfall
let loopId = null;
let lastTime = 0;

// Attributes
let happinessVal = 100;
let hungerVal = 100;
let coinsVal = 0;

// Pou Transformations
const transform = {
    x: 0, y: 0, scale: 1
};

// Smooth UI Updates
function updateStats() {
    stats.hunger.textContent = `🍔 ${Math.round(hungerVal)}%`;
    stats.happiness.textContent = `❤️ ${Math.round(happinessVal)}%`;
    stats.coins.textContent = `🪙 ${coinsVal}`;
}

// Change Pou Expression
function setExpression(exp) {
    // Remove all previous expression classes
    const classesToRemove = ['normal', 'happy', 'sad', 'surprised', 'eating', 'sleeping', 'angry', 'wink'];
    pou.classList.remove(...classesToRemove);
    document.body.classList.remove('angry-mode');

    // Add new expression
    pou.classList.add(exp);

    // Special body effect
    if (exp === 'angry') {
        document.body.classList.add('angry-mode');
    }
}

// Visual Onboarding
function showOnboarding(text, iconClass) {
    const icon = document.getElementById('onboarding-icon');
    const label = document.getElementById('onboarding-text');

    icon.className = `anim-icon ${iconClass}`; // Can be emoji
    icon.textContent = iconClass;
    label.textContent = text;

    onboardingOverlay.classList.remove('hidden');
    onboardingOverlay.style.opacity = '1';

    setTimeout(() => {
        onboardingOverlay.style.opacity = '0';
        setTimeout(() => onboardingOverlay.classList.add('hidden'), 500);
    }, 3000);
}

// Care Mode Logic
let isPetting = false;
let isSleeping = false;

// Pinch & Drag Food Logic
let draggedItem = null;
let foodSpawnPoint = { x: 0, y: 0 };
let pinchStartDist = 0;
let isPinchingFood = false;

function handleCareMode(arData, dt) {
    // 1. Ambient Light Check (Sleep)
    const brightness = window.AR_ENGINE.getBrightness();
    if (brightness < 0.2) { // Dark room
        if (!isSleeping) {
            setExpression('sleeping');
            isSleeping = true;
        }
    } else {
        if (isSleeping) {
            setExpression('normal');
            isSleeping = false;
        }
    }

    if (isSleeping) return; // Skip other interactions if asleep

    // 2. Petting (Open hand bounding box intersects Pou)
    // Map AR Data (0-1) to screen space
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;

    // Pou approximate screen bounds (centered)
    const pouRect = pou.getBoundingClientRect();

    let beingPetted = false;
    arData.hands.forEach(hand => {
        if (hand.isOpen) {
            // Hand center mapped to screen
            // Note: Camera is mirrored (scaleX(-1)), so we flip X
            const hx = (1 - hand.x) * screenW;
            const hy = hand.y * screenH;

            // Check intersection with Pou
            if (hx > pouRect.left && hx < pouRect.right &&
                hy > pouRect.top && hy < pouRect.bottom) {
                beingPetted = true;
            }
        }
    });

    if (beingPetted) {
        if (!isPetting) {
            setExpression('happy');
            isPetting = true;
            happinessVal = Math.min(100, happinessVal + 0.5 * dt);
        }
    } else {
        if (isPetting) {
            setExpression('normal');
            isPetting = false;
        }
    }

    // 3. Feeding (Pinch Food from Drawer to Mouth)
    const drawerRect = foodDrawer.getBoundingClientRect();
    let isAnyPinching = false;

    arData.hands.forEach(hand => {
        if (hand.isPinching) {
            isAnyPinching = true;
            const hx = (1 - hand.x) * screenW;
            const hy = hand.y * screenH;

            if (!isPinchingFood) {
                // Check if pinching over food drawer
                if (hx > drawerRect.left && hx < drawerRect.right &&
                    hy > drawerRect.top && hy < drawerRect.bottom) {

                    // Start dragging food
                    isPinchingFood = true;
                    const items = ['🍎', '🍔', '🍰'];
                    const randFood = items[Math.floor(Math.random() * items.length)];
                    draggedFood.textContent = randFood;
                    draggedFood.classList.remove('hidden');
                }
            } else {
                // Currently dragging
                draggedFood.style.left = `${hx - 20}px`;
                draggedFood.style.top = `${hy - 20}px`;

                // Check if near Pou's mouth
                // Mouth is roughly at center + offset
                const pRect = pou.getBoundingClientRect();
                const mx = pRect.left + pRect.width / 2;
                const my = pRect.top + pRect.height * 0.7; // Approx mouth position

                const dist = Math.sqrt(Math.pow(hx - mx, 2) + Math.pow(hy - my, 2));

                if (dist < 100) { // Close to mouth
                    setExpression('eating');
                    if (dist < 40) { // Really close, EAT IT
                        hungerVal = Math.min(100, hungerVal + 10);
                        updateStats();
                        draggedFood.classList.add('hidden');
                        isPinchingFood = false;

                        // Spawn particles
                        window.MINIGAMES && window.MINIGAMES.createParticles && window.MINIGAMES.createParticles(mx, my);

                        setTimeout(() => {
                            if(currentState === 'care' && !isSleeping) setExpression('normal');
                        }, 500);
                    }
                }
            }
        }
    });

    // Reset if pinch released
    if (!isAnyPinching && isPinchingFood) {
        isPinchingFood = false;
        draggedFood.classList.add('hidden');
    }
}

// Apply AR Data to Scene (Scaling for Depth)
function applyARTransform(arData) {
    // Map Nose to Center Shift
    // Normalize nose (0.5 = center)
    const targetX = (0.5 - arData.nose.x) * 400; // Multiply for range
    const targetY = (arData.nose.y - 0.5) * 400;

    transform.x = window.AR_ENGINE.lerp(transform.x, targetX, 0.1);
    transform.y = window.AR_ENGINE.lerp(transform.y, targetY, 0.1);

    // Dynamic Scale based on Eye Distance (Closer = larger distance)
    // Base distance ~0.05. Scale range 0.5 to 2.0
    let targetScale = (arData.eyeDistance / 0.05);
    targetScale = Math.max(0.5, Math.min(2.0, targetScale));

    transform.scale = window.AR_ENGINE.lerp(transform.scale, targetScale, 0.05);

    // Apply to scene
    scene.style.transform = `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`;
}

// Main Game Loop
function gameLoop(timestamp) {
    if (document.hidden) {
        lastTime = timestamp;
        loopId = requestAnimationFrame(gameLoop);
        return; // Pause processing
    }

    const dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;

    const arData = window.AR_ENGINE.getData();

    // Global AR Tracking (Only in Care Mode or specific UI states)
    if (currentState === 'care') {
        applyARTransform(arData);
        handleCareMode(arData, dt);
    } else {
        // Reset transform for minigames
        scene.style.transform = `translate(0px, 0px) scale(1)`;
    }

    // Route to Minigames
    if (currentState === 'climber') window.MINIGAMES.updateClimber(arData, dt);
    if (currentState === 'racing') window.MINIGAMES.updateRacing(arData, dt);
    if (currentState === 'foodfall') window.MINIGAMES.updateFoodFall(arData, dt);

    // Update Stats UI
    hungerVal = Math.max(0, hungerVal - 0.1 * dt); // Slowly hungry
    happinessVal = Math.max(0, happinessVal - 0.05 * dt); // Slowly sad
    updateStats();

    loopId = requestAnimationFrame(gameLoop);
}

// Navigation & State Management
document.querySelectorAll('.game-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const game = e.target.getAttribute('data-game');
        currentState = game;

        menuOverlay.classList.add('hidden');
        foodDrawer.classList.add('hidden');

        if (game === 'care') {
            foodDrawer.classList.remove('hidden');
            minigameUI.classList.add('hidden');
            setExpression('normal');
        } else {
            minigameUI.classList.remove('hidden');

            // Show Onboarding
            if (game === 'climber') {
                showOnboarding("Miringkan kepala ke kiri/kanan untuk bergerak!", "↔️");
                window.MINIGAMES.startClimber();
            } else if (game === 'racing') {
                showOnboarding("Gunakan hidung untuk menyetir. Angkat alis untuk BOOST!", "👃💨");
                window.MINIGAMES.startRacing();
            } else if (game === 'foodfall') {
                showOnboarding("Tangkap makanan dengan mulut (Buka Mulut!)", "😮🍎");
                window.MINIGAMES.startFoodFall();
            }
        }
    });
});

document.getElementById('btn-exit-game').addEventListener('click', () => {
    currentState = 'care';
    window.MINIGAMES.stopAll();
    minigameUI.classList.add('hidden');
    menuOverlay.classList.remove('hidden');
    foodDrawer.classList.remove('hidden');
    setExpression('normal');
});

// ---------------------------------------------------------
// ADVANCED FEATURES: PHOTO BOOTH & GEMINI LLM
// ---------------------------------------------------------

// --- Photo Booth ---
const btnPhoto = document.getElementById('btn-photo');
const flashEffect = document.getElementById('flash-effect');
const photoModal = document.getElementById('photo-modal');
const photoPreview = document.getElementById('photo-preview');

btnPhoto.addEventListener('click', async () => {
    // 1. Countdown UI
    const countdownDiv = document.createElement('div');
    countdownDiv.style.position = 'fixed';
    countdownDiv.style.top = '50%';
    countdownDiv.style.left = '50%';
    countdownDiv.style.transform = 'translate(-50%, -50%)';
    countdownDiv.style.fontSize = '8rem';
    countdownDiv.style.color = 'white';
    countdownDiv.style.textShadow = '0 0 20px rgba(0,0,0,0.5)';
    countdownDiv.style.zIndex = '3000';
    document.body.appendChild(countdownDiv);

    for (let i = 3; i > 0; i--) {
        countdownDiv.textContent = i;
        await new Promise(r => setTimeout(r, 1000));
    }
    countdownDiv.remove();

    // 2. Flash Effect
    flashEffect.classList.add('flash');

    // 3. Capture Container using html2canvas
    const container = document.getElementById('capture-container');

    // Make sure canvas layers are visible for html2canvas
    const canvasClone = document.getElementById('camera-canvas');
    const arCanvasData = canvasClone.toDataURL(); // Fallback if WebGL/video causes taint issues

    // We capture the whole UI layer or the specific capture container
    try {
        const canvas = await html2canvas(container, {
            backgroundColor: null,
            useCORS: true,
            logging: false,
            scale: 2 // High res
        });

        // 4. Show Modal
        const imgData = canvas.toDataURL('image/png');
        photoPreview.src = imgData;
        photoModal.classList.remove('hidden');

        // Flash Fade out
        setTimeout(() => flashEffect.classList.remove('flash'), 100);

    } catch (err) {
        console.error("html2canvas error:", err);
        alert("Gagal mengambil foto.");
        flashEffect.classList.remove('flash');
    }
});

document.getElementById('btn-close-photo').addEventListener('click', () => {
    photoModal.classList.add('hidden');
});

document.getElementById('btn-download').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = photoPreview.src;
    a.download = `PouAR_Solo_${Date.now()}.png`;
    a.click();
});

document.getElementById('btn-share').addEventListener('click', async () => {
    if (navigator.share) {
        try {
            // Convert base64 to blob
            const res = await fetch(photoPreview.src);
            const blob = await res.blob();
            const file = new File([blob], 'pou_ar.png', { type: 'image/png' });

            await navigator.share({
                title: 'POU AR SOLO',
                text: 'Lihat Pou saya di POU AR SOLO!',
                files: [file]
            });
        } catch (err) {
            console.log("Share failed or cancelled:", err);
        }
    } else {
        alert("Fitur Share tidak didukung di browser ini.");
    }
});


// --- Gemini Voice-to-Voice LLM ---
const btnMic = document.getElementById('btn-mic');
const chatBubble = document.getElementById('chat-bubble');
const chatText = document.getElementById('chat-text');
const btnSettings = document.getElementById('btn-settings');
const settingsModal = document.getElementById('settings-modal');
const btnClearKey = document.getElementById('btn-clear-key');

let isListening = false;
let isSpeaking = false;
let lipSyncInterval = null;

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;

if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = 'id-ID';
    recognition.interimResults = false;

    recognition.onstart = () => {
        isListening = true;
        btnMic.style.background = 'rgba(255, 71, 87, 0.5)'; // Red to indicate listening
    };

    recognition.onresult = async (event) => {
        const transcript = event.results[0][0].transcript;
        chatText.textContent = `Kamu: "${transcript}"`;
        chatBubble.classList.remove('hidden');

        await fetchGeminiResponse(transcript);
    };

    recognition.onerror = (e) => {
        console.error("Speech Rec Error:", e);
        resetMic();
    };

    recognition.onend = () => {
        resetMic();
    };
} else {
    console.warn("Speech Recognition API tidak didukung di browser ini.");
}

function resetMic() {
    isListening = false;
    btnMic.style.background = '';
}

btnMic.addEventListener('click', () => {
    if (!SpeechRecognition) return alert("Browser tidak mendukung fitur suara.");
    if (isListening || isSpeaking) return;

    // Check API Key first
    let apiKey = localStorage.getItem('gemini_api_key');
    if (!apiKey) {
        apiKey = prompt("Masukkan Gemini API Key Anda untuk berbicara dengan Pou:");
        if (apiKey) {
            localStorage.setItem('gemini_api_key', apiKey);
        } else {
            return; // Cancelled
        }
    }

    recognition.start();
});

async function fetchGeminiResponse(promptText) {
    const apiKey = localStorage.getItem('gemini_api_key');
    if (!apiKey) return;

    chatText.textContent = "Pou sedang berpikir...";

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                system_instruction: {
                    parts: [{ text: "Act as a cute, slightly sarcastic virtual pet named Pou. Respond in 1 short sentence in Indonesian." }]
                },
                contents: [{ parts: [{ text: promptText }] }]
            })
        });

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error.message);
        }

        const reply = data.candidates[0].content.parts[0].text;
        chatText.textContent = `Pou: "${reply}"`;

        speakResponse(reply);

    } catch (err) {
        console.error("Gemini API Error:", err);
        chatText.textContent = "Error menghubungi Pou (Cek API Key).";
        setTimeout(() => chatBubble.classList.add('hidden'), 3000);
    }
}

function speakResponse(text) {
    if (!window.speechSynthesis) return;

    isSpeaking = true;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'id-ID';
    utterance.pitch = 1.5; // Cute pitch
    utterance.rate = 1.2;

    // Lip Sync logic (Toggle 'eating' class rapidly)
    lipSyncInterval = setInterval(() => {
        document.getElementById('pou').classList.toggle('eating');
    }, 200);

    utterance.onend = () => {
        clearInterval(lipSyncInterval);
        document.getElementById('pou').classList.remove('eating');
        isSpeaking = false;
        setTimeout(() => chatBubble.classList.add('hidden'), 2000);
    };

    window.speechSynthesis.speak(utterance);
}

// Settings UI (Clear API Key)
btnSettings.addEventListener('click', () => {
    settingsModal.classList.remove('hidden');
});

document.getElementById('btn-close-settings').addEventListener('click', () => {
    settingsModal.classList.add('hidden');
});

btnClearKey.addEventListener('click', () => {
    localStorage.removeItem('gemini_api_key');
    alert("API Key berhasil dihapus.");
    settingsModal.classList.add('hidden');
});


// Start Loop
requestAnimationFrame((timestamp) => {
    lastTime = timestamp;
    gameLoop(timestamp);
});
