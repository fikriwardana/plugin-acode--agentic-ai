// minigames.js

class MinigameManager {
  constructor() {
    this.initPhotoBooth();
    this.currentMode = 'care';
    this.minigameContainer = document.getElementById('minigame-container');

    // Bind buttons
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        if(btn.id === 'btn-photo-booth') return; // Handled separately

        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.switchMode(btn.dataset.mode);
      });
    });

    // Subscribe to engine frames
    window.arEngine.subscribe((data) => this.onFrame(data));

    // Audio Context (Initialize on first user interaction)
    this.audioCtx = null;
    document.body.addEventListener('click', () => {
      if(!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }, {once: true});

    this.initCareMode();
  }

  playSound(type) {
    if(!this.audioCtx) return;
    const osc = this.audioCtx.createOscillator();
    const gainNode = this.audioCtx.createGain();
    osc.connect(gainNode);
    gainNode.connect(this.audioCtx.destination);

    if (type === 'coin') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, this.audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1200, this.audioCtx.currentTime + 0.1);
      gainNode.gain.setValueAtTime(0.5, this.audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.1);
      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.1);
      if(navigator.vibrate) navigator.vibrate(50);
    } else if (type === 'crash') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(100, this.audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(10, this.audioCtx.currentTime + 0.2);
      gainNode.gain.setValueAtTime(0.8, this.audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.2);
      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.2);
      if(navigator.vibrate) navigator.vibrate(200);
    }
  }

  switchMode(newMode) {
    this.cleanupCurrentMode();
    this.currentMode = newMode;

    switch(newMode) {
      case 'care':
        this.initCareMode();
        break;
      case 'sky_climber':
        this.initSkyClimber();
        break;
      case 'head_racing':
        this.initHeadRacing();
        break;
      case 'food_fall':
        this.initFoodFall();
        break;
    }
  }

  cleanupCurrentMode() {
    this.minigameContainer.innerHTML = '';
    window.pouController.setExpression('normal');
    // Reset specific states
    this.careState = null;
    this.skyState = null;
    this.raceState = null;
    this.foodState = null;
  }

  onFrame(data) {
    if(!data.face) return; // Wait for face

    switch(this.currentMode) {
      case 'care':
        this.updateCareMode(data);
        break;
      case 'sky_climber':
        this.updateSkyClimber(data);
        break;
      case 'head_racing':
        this.updateHeadRacing(data);
        break;
      case 'food_fall':
        this.updateFoodFall(data);
        break;
    }
  }

  // --- CARE MODE ---
  initCareMode() {
    this.careState = {
      lastInteraction: 0,
      isHoldingFood: false,
      foodElement: null
    };

    // Add Food Dispenser UI
    const foodDispenser = document.createElement('div');
    foodDispenser.id = 'food-dispenser';
    foodDispenser.style.cssText = `
      position: absolute; right: 20px; top: 50%; transform: translateY(-50%);
      width: 80px; height: 80px; background: rgba(255,255,255,0.3);
      border-radius: 50%; display: flex; align-items: center; justify-content: center;
      font-size: 40px; border: 2px solid white; pointer-events: none;
    `;
    foodDispenser.innerText = '🍖';
    this.minigameContainer.appendChild(foodDispenser);
  }

  updateCareMode(data) {
    // 1. Follow Nose
    window.pouController.setTargetPosition(data.face.nose.x, data.face.nose.y);

    if(!data.hands) return;

    const now = Date.now();
    const pouRect = window.pouController.wrapperElement.getBoundingClientRect();
    const pouCenter = {
      x: pouRect.left + pouRect.width/2,
      y: pouRect.top + pouRect.height/2
    };

    let interacted = false;

    data.hands.forEach(hand => {
      // Distance from hand index tip to Pou center
      const distToPou = Math.sqrt(Math.pow(hand.indexTip.x - pouCenter.x, 2) + Math.pow(hand.indexTip.y - pouCenter.y, 2));

      // Showering Check (Open Hand over Pou)
      if (hand.isOpenHand && distToPou < 150) {
          interacted = true;
          window.pouController.setExpression('happy');

          // Spawn water drops
          if (Math.random() > 0.7) {
            this.spawnParticle(hand.indexTip.x, hand.indexTip.y, '💧');
          }

          if (now - this.careState.lastInteraction > 1000) {
            window.gameState.modifyStat('energy', 2); // Shower gives energy
            this.playSound('coin');
            this.careState.lastInteraction = now;
          }
      }
      // Scrubbing Check (Index finger extended, not pinching, not fully open hand)
      else if (!hand.isOpenHand && !hand.isPinching && distToPou < 150) {
          interacted = true;
          window.pouController.setExpression('surprised');

          // Spawn soap bubbles
          if (Math.random() > 0.5) {
            this.spawnParticle(hand.indexTip.x, hand.indexTip.y, '🫧');
          }

          if (now - this.careState.lastInteraction > 500) {
            window.gameState.modifyStat('happiness', 1);
            this.careState.lastInteraction = now;
          }
      }

      // Feeding (Pinching)
      if (hand.isPinching) {
        // Check if grabbing food
        if (!this.careState.isHoldingFood) {
          const dispenser = document.getElementById('food-dispenser');
          if(dispenser) {
            const dispRect = dispenser.getBoundingClientRect();
            const dispCenter = {x: dispRect.left + dispRect.width/2, y: dispRect.top + dispRect.height/2};
            if (Math.sqrt(Math.pow(hand.indexTip.x - dispCenter.x, 2) + Math.pow(hand.indexTip.y - dispCenter.y, 2)) < 100) {
              this.careState.isHoldingFood = true;

              const food = document.createElement('div');
              food.innerText = '🍖';
              food.style.cssText = 'position: absolute; font-size: 40px; pointer-events: none; z-index: 100;';
              this.minigameContainer.appendChild(food);
              this.careState.foodElement = food;
            }
          }
        } else {
          // Dragging food
          if (this.careState.foodElement) {
            this.careState.foodElement.style.left = `${hand.indexTip.x}px`;
            this.careState.foodElement.style.top = `${hand.indexTip.y}px`;
            window.pouController.setExpression('eating');
            interacted = true;
          }
        }
      } else {
        // Release Pinch
        if (this.careState.isHoldingFood) {
          // Check if released over mouth (Pou center roughly)
          const distToPou = Math.sqrt(Math.pow(hand.indexTip.x - pouCenter.x, 2) + Math.pow(hand.indexTip.y - pouCenter.y, 2));
          if (distToPou < 100) {
            window.gameState.modifyStat('hunger', 10);
            this.playSound('coin');
          }
          if (this.careState.foodElement) {
            this.careState.foodElement.remove();
            this.careState.foodElement = null;
          }
          this.careState.isHoldingFood = false;
        }
      }
    });

    if(!interacted && window.pouController.currentExpression !== 'normal') {
      window.pouController.setExpression('normal');
    }
  }

  spawnParticle(x, y, emoji) {
    const el = document.createElement('div');
    el.innerText = emoji;
    el.style.cssText = `
      position: absolute; left: ${x}px; top: ${y}px;
      font-size: 30px; pointer-events: none; z-index: 50;
      transition: all 1s ease-out; opacity: 1;
    `;
    this.minigameContainer.appendChild(el);

    // Animate up and fade out
    setTimeout(() => {
       el.style.top = `${y - 100}px`;
       el.style.opacity = '0';
    }, 50);

    setTimeout(() => {
       el.remove();
    }, 1000);
  }

  // --- SKY CLIMBER ---
  initSkyClimber() {
    this.skyState = {
      pouY: window.innerHeight - 200,
      pouX: window.innerWidth / 2,
      velocityY: 0,
      gravity: 0.5,
      jumpForce: -15,
      platforms: [],
      score: 0,
      speedX: 0,
      baseTilt: null // Will be set on first frame
    };

    // Create initial platform
    this.createPlatform(window.innerWidth / 2, window.innerHeight - 50, 200);
    for(let i=0; i<5; i++) {
       this.createPlatform(Math.random() * (window.innerWidth - 100), window.innerHeight - 200 - (i * 150), 150);
    }

    window.pouController.setExpression('happy');
  }

  createPlatform(x, y, width) {
    const plat = document.createElement('div');
    plat.className = 'sky-platform';
    plat.style.cssText = `
      position: absolute; left: ${x}px; top: ${y}px;
      width: ${width}px; height: 20px; background: #8BC34A;
      border-radius: 10px; transform: translateX(-50%);
      box-shadow: 0 5px 0 #558B2F;
    `;
    this.minigameContainer.appendChild(plat);
    this.skyState.platforms.push({el: plat, x: x, y: y, w: width, h: 20});
  }

  updateSkyClimber(data) {
    if(!this.skyState) return;

    // Input: Head Tilt
    if (this.skyState.baseTilt === null) this.skyState.baseTilt = data.face.tiltAngle;

    // Normalize tilt: if tilted left, move left; right move right.
    const tiltDiff = data.face.tiltAngle - this.skyState.baseTilt;
    this.skyState.speedX = tiltDiff * -0.5; // Sensitivity multiplier

    // Apply Physics
    this.skyState.pouX += this.skyState.speedX;
    this.skyState.velocityY += this.skyState.gravity;
    this.skyState.pouY += this.skyState.velocityY;

    // Screen bounds wrap (horizontal)
    if (this.skyState.pouX < 0) this.skyState.pouX = window.innerWidth;
    if (this.skyState.pouX > window.innerWidth) this.skyState.pouX = 0;

    // Platform Collision (falling only)
    if (this.skyState.velocityY > 0) {
      const pouBottom = this.skyState.pouY + 100; // rough hit radius
      const pouRadius = 50;

      this.skyState.platforms.forEach(plat => {
        if (pouBottom > plat.y && pouBottom < plat.y + 30) {
           if (this.skyState.pouX + pouRadius > plat.x - plat.w/2 && this.skyState.pouX - pouRadius < plat.x + plat.w/2) {
              // Bounce
              this.skyState.velocityY = this.skyState.jumpForce;
              this.playSound('coin'); // bounce sound stub
              window.gameState.modifyStat('coins', 1);
           }
        }
      });
    }

    // Camera Scroll (if Pou goes too high, move platforms down)
    if (this.skyState.pouY < window.innerHeight / 2) {
      const diff = (window.innerHeight / 2) - this.skyState.pouY;
      this.skyState.pouY = window.innerHeight / 2;

      this.skyState.platforms.forEach((plat, idx) => {
        plat.y += diff;
        plat.el.style.top = `${plat.y}px`;

        // Recycle platform if it goes off bottom
        if (plat.y > window.innerHeight) {
          plat.y = 0;
          plat.x = Math.random() * (window.innerWidth - 100) + 50;
          plat.el.style.left = `${plat.x}px`;
          plat.w = Math.max(80, 150 - (window.gameState.state.coins * 0.1)); // Gets harder
          plat.el.style.width = `${plat.w}px`;
        }
      });
    }

    // Game Over condition
    if (this.skyState.pouY > window.innerHeight + 100) {
      this.playSound('crash');
      this.initSkyClimber(); // Reset
      return;
    }

    // Visual Update
    window.pouController.setTargetPosition(this.skyState.pouX, this.skyState.pouY);
  }

  // --- HEAD RACING ---
  initHeadRacing() {
    this.raceState = {
      speed: 5,
      obstacles: [],
      coins: [],
      lastObstacleTime: 0,
      nitroActive: false,
      nitroTimer: 0
    };

    // Draw Lanes
    const laneDiv = document.createElement('div');
    laneDiv.style.cssText = `
      position: absolute; width: 100%; height: 100%; top: 0; left: 0;
      display: flex; opacity: 0.3; pointer-events: none; z-index: -1;
    `;
    laneDiv.innerHTML = `
      <div style="flex: 1; border-right: 2px dashed white;"></div>
      <div style="flex: 1; border-right: 2px dashed white;"></div>
      <div style="flex: 1;"></div>
    `;
    this.minigameContainer.appendChild(laneDiv);

    window.pouController.setExpression('normal');
  }

  updateHeadRacing(data) {
    if(!this.raceState) return;

    const now = Date.now();
    const laneWidth = window.innerWidth / 3;

    // Input: Nose X for steering (0 to 3 lanes)
    let lane = 1; // Middle default
    if (data.face.nose.x < laneWidth) lane = 0;
    else if (data.face.nose.x > laneWidth * 2) lane = 2;

    const targetX = (lane * laneWidth) + (laneWidth / 2);
    const targetY = window.innerHeight - 150; // Fixed Y position at bottom

    // Input: Eyebrows for Nitro
    if (data.face.eyebrowsRaised && !this.raceState.nitroActive) {
      this.raceState.nitroActive = true;
      this.raceState.nitroTimer = now + 3000; // 3 seconds
      window.pouController.setExpression('angry');
    }

    if (this.raceState.nitroActive && now > this.raceState.nitroTimer) {
      this.raceState.nitroActive = false;
      window.pouController.setExpression('normal');
    }

    const currentSpeed = this.raceState.nitroActive ? this.raceState.speed * 2 : this.raceState.speed;
    this.raceState.speed += 0.005; // gradually increase base speed

    // Spawner
    if (now - this.raceState.lastObstacleTime > 1000 / (currentSpeed/5)) {
      this.raceState.lastObstacleTime = now;
      const r = Math.random();
      const spawnLane = Math.floor(Math.random() * 3);
      const spawnX = (spawnLane * laneWidth) + (laneWidth / 2);

      if (r > 0.3) {
        // Spawn Obstacle (Bomb)
        const obs = document.createElement('div');
        obs.innerText = '💣';
        obs.style.cssText = `position: absolute; left: ${spawnX}px; top: -50px; font-size: 50px; transform: translateX(-50%);`;
        this.minigameContainer.appendChild(obs);
        this.raceState.obstacles.push({el: obs, x: spawnX, y: -50});
      } else {
        // Spawn Coin
        const coin = document.createElement('div');
        coin.innerText = '🏎️'; // Speed coin
        coin.style.cssText = `position: absolute; left: ${spawnX}px; top: -50px; font-size: 50px; transform: translateX(-50%);`;
        this.minigameContainer.appendChild(coin);
        this.raceState.coins.push({el: coin, x: spawnX, y: -50});
      }
    }

    const pouRadius = 50; // Collision radius

    // Update Obstacles
    for (let i = this.raceState.obstacles.length - 1; i >= 0; i--) {
      let obs = this.raceState.obstacles[i];
      obs.y += currentSpeed;
      obs.el.style.top = `${obs.y}px`;

      // Collision check
      if (Math.abs(obs.x - targetX) < pouRadius && Math.abs(obs.y - targetY) < pouRadius) {
        // Crash
        if(this.raceState.nitroActive) {
           // Invincible in nitro mode! Destroy obstacle
           obs.el.remove();
           this.raceState.obstacles.splice(i, 1);
           this.playSound('crash');
        } else {
           this.playSound('crash');
           this.initHeadRacing(); // Restart
           return;
        }
      } else if (obs.y > window.innerHeight) {
        obs.el.remove();
        this.raceState.obstacles.splice(i, 1);
      }
    }

    // Update Coins
    for (let i = this.raceState.coins.length - 1; i >= 0; i--) {
      let coin = this.raceState.coins[i];
      coin.y += currentSpeed;
      coin.el.style.top = `${coin.y}px`;

      // Collision check
      if (Math.abs(coin.x - targetX) < pouRadius && Math.abs(coin.y - targetY) < pouRadius) {
        window.gameState.modifyStat('speedCoins', 1);
        this.playSound('coin');
        coin.el.remove();
        this.raceState.coins.splice(i, 1);
      } else if (coin.y > window.innerHeight) {
        coin.el.remove();
        this.raceState.coins.splice(i, 1);
      }
    }

    window.pouController.setTargetPosition(targetX, targetY);
  }

  // --- FOOD FALL ---
  initFoodFall() {
    this.foodState = {
      items: [],
      lastSpawnTime: 0,
      baseSpeed: 4
    };
    window.pouController.setExpression('normal');
  }

  updateFoodFall(data) {
    if(!this.foodState) return;

    // Check if spawn logic needs executing
    const now = Date.now();

    // Input: Nose X for movement
    const targetX = data.face.nose.x;
    const targetY = window.innerHeight - 150; // Fixed at bottom

    // Input: Mouth Open for Magnet / Wide catch
    const isMouthOpen = data.face.mouthOpen;
    const catchRadius = isMouthOpen ? 150 : 50; // Wider catch radius

    if (isMouthOpen) {
      window.pouController.setExpression('eating');
    } else {
      window.pouController.setExpression('normal');
    }

    // Spawner
    if (now - this.foodState.lastSpawnTime > 800) {
      this.foodState.lastSpawnTime = now;
      const spawnX = Math.random() * (window.innerWidth - 100) + 50;

      const isBad = Math.random() > 0.7;
      const el = document.createElement('div');
      el.innerText = isBad ? '👟' : '🍕';
      el.style.cssText = `position: absolute; left: ${spawnX}px; top: -50px; font-size: 50px; transform: translateX(-50%);`;
      this.minigameContainer.appendChild(el);

      this.foodState.items.push({
         el: el,
         x: spawnX,
         y: -50,
         isBad: isBad
      });
    }

    // Update Items
    for (let i = this.foodState.items.length - 1; i >= 0; i--) {
      let item = this.foodState.items[i];

      // Magnet effect logic: pull good items towards Pou if mouth is open and within 300px
      if (isMouthOpen && !item.isBad) {
         const dx = targetX - item.x;
         const dy = targetY - item.y;
         const dist = Math.sqrt(dx*dx + dy*dy);
         if (dist < 300) {
             item.x += dx * 0.05; // pull X
             item.y += dy * 0.05; // pull Y
         } else {
             item.y += this.foodState.baseSpeed;
         }
      } else {
         item.y += this.foodState.baseSpeed;
      }

      item.el.style.left = `${item.x}px`;
      item.el.style.top = `${item.y}px`;

      // Collision check
      if (Math.abs(item.x - targetX) < catchRadius && Math.abs(item.y - targetY) < catchRadius) {
        if (item.isBad) {
           this.playSound('crash');
           window.gameState.modifyStat('hunger', -20);
           window.gameState.modifyStat('happiness', -20);
        } else {
           this.playSound('coin');
           window.gameState.modifyStat('rareFood', 1);
           window.gameState.modifyStat('hunger', +5);
        }
        item.el.remove();
        this.foodState.items.splice(i, 1);
      } else if (item.y > window.innerHeight) {
        item.el.remove();
        this.foodState.items.splice(i, 1);
      }
    }

    window.pouController.setTargetPosition(targetX, targetY);
  }

  // --- PHOTO BOOTH ---
  initPhotoBooth() {
    const btn = document.getElementById('btn-photo-booth');
    if(btn) {
      btn.addEventListener('click', () => this.takePhoto());
    }

    document.getElementById('btn-close-photo').addEventListener('click', () => {
      document.getElementById('photo-preview-modal').classList.add('hidden');
    });

    document.getElementById('btn-download-photo').addEventListener('click', () => {
      const img = document.getElementById('photo-preview-img');
      const a = document.createElement('a');
      a.href = img.src;
      a.download = `pou-ar-solo-${Date.now()}.png`;
      a.click();
    });

    document.getElementById('btn-share-photo').addEventListener('click', async () => {
      const img = document.getElementById('photo-preview-img');
      try {
        const res = await fetch(img.src);
        const blob = await res.blob();
        const file = new File([blob], 'pou-ar-solo.png', { type: blob.type });

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: 'Pou AR Solo Saya',
            text: 'Lihat Pou saya!',
            files: [file]
          });
        } else {
          alert('Berbagi tidak didukung di perangkat/browser ini.');
        }
      } catch (err) {
        console.error('Gagal berbagi:', err);
      }
    });
  }

  takePhoto() {
    // 0. 3-Second Countdown UI & Audio
    const countdownEl = document.createElement('div');
    countdownEl.style.cssText = `
      position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
      font-size: 150px; color: white; font-weight: bold; z-index: 100;
      text-shadow: 0 0 20px black; pointer-events: none;
    `;
    document.body.appendChild(countdownEl);

    let count = 3;
    const countInterval = setInterval(() => {
      if (count > 0) {
        countdownEl.innerText = count;
        this.playSound('coin'); // Beep
        count--;
      } else {
        clearInterval(countInterval);
        countdownEl.remove();
        this.executeCapture();
      }
    }, 1000);
  }

  executeCapture() {
    // 1. Create a flash element
    const flash = document.createElement('div');
    flash.className = 'flash active';
    document.body.appendChild(flash);

    // Play shutter sound
    this.playSound('crash'); // Placeholder for a deeper shutter click

    setTimeout(() => {
      flash.classList.remove('active');
      setTimeout(() => flash.remove(), 100);
    }, 100);

    // 2. Render Canvas and DOM to single image using html2canvas
    // We capture the #game_area (where Pou is) and merge with the existing output_canvas
    const gameArea = document.getElementById('game_area');
    const existingCanvas = document.getElementById('output_canvas');

    html2canvas(gameArea, {
      backgroundColor: null,
      logging: false
    }).then(gameCanvas => {
       // Merge them
       const finalCanvas = document.createElement('canvas');
       finalCanvas.width = existingCanvas.width;
       finalCanvas.height = existingCanvas.height;
       const ctx = finalCanvas.getContext('2d');

       // Draw camera layer first
       ctx.drawImage(existingCanvas, 0, 0);

       // Draw Pou layer scaled to match canvas dims (html2canvas captures window size)
       ctx.drawImage(gameCanvas, 0, 0, finalCanvas.width, finalCanvas.height);

       // Show preview
       const mergedData = finalCanvas.toDataURL('image/png');
       document.getElementById('photo-preview-img').src = mergedData;
       document.getElementById('photo-preview-modal').classList.remove('hidden');
    });
  }
}

window.minigameManager = new MinigameManager();
