// game-state.js

class GameState {
  constructor() {
    this.state = {
      hunger: 100,
      happiness: 100,
      energy: 100,
      coins: 0,
      speedCoins: 0,
      rareFood: 0
    };

    this.domElements = {
      hunger: document.getElementById('val-hunger'),
      happiness: document.getElementById('val-happiness'),
      energy: document.getElementById('val-energy'),
      coins: document.getElementById('val-coins'),
      speedCoins: document.getElementById('val-speedcoins'),
      rareFood: document.getElementById('val-rarefood')
    };

    this.loadState();
    this.updateUI();
    this.startDecayLoop();
  }

  loadState() {
    const savedState = localStorage.getItem('pouArSoloState');
    if (savedState) {
      try {
        const parsedState = JSON.parse(savedState);
        this.state = { ...this.state, ...parsedState };
      } catch (e) {
        console.error("Error loading state from localStorage", e);
      }
    }
  }

  saveState() {
    localStorage.setItem('pouArSoloState', JSON.stringify(this.state));
  }

  updateUI() {
    if(!this.domElements.hunger) return; // Prevent errors if DOM not ready
    this.domElements.hunger.innerText = Math.round(this.state.hunger);
    this.domElements.happiness.innerText = Math.round(this.state.happiness);
    this.domElements.energy.innerText = Math.round(this.state.energy);
    this.domElements.coins.innerText = this.state.coins;
    this.domElements.speedCoins.innerText = this.state.speedCoins;
    this.domElements.rareFood.innerText = this.state.rareFood;
  }

  // Generic stat modifier
  modifyStat(statName, amount) {
    if (this.state[statName] !== undefined) {
      this.state[statName] += amount;

      // Clamp values for primary stats
      if (['hunger', 'happiness', 'energy'].includes(statName)) {
        this.state[statName] = Math.max(0, Math.min(100, this.state[statName]));
      }

      this.updateUI();
      this.saveState();
    }
  }

  // Background stat decay
  startDecayLoop() {
    setInterval(() => {
      // Decrease stats slowly over time
      this.modifyStat('hunger', -0.5);
      this.modifyStat('happiness', -0.2);
      this.modifyStat('energy', -0.1);
    }, 5000); // Every 5 seconds
  }
}

// Initialize global state object
window.gameState = new GameState();
