// pou-controller.js

class PouController {
  constructor() {
    this.pouElement = document.getElementById('pou-character');
    this.wrapperElement = document.getElementById('pou-wrapper');
    this.currentExpression = 'normal';

    // valid expressions defined in CSS: normal, happy, sad, surprised, eating, sleeping, angry
    this.validExpressions = ['normal', 'happy', 'sad', 'surprised', 'eating', 'sleeping', 'angry'];

    // For lerping / positioning
    this.currentX = window.innerWidth / 2;
    this.currentY = window.innerHeight / 2;
    this.targetX = window.innerWidth / 2;
    this.targetY = window.innerHeight / 2;
    this.lerpSpeed = 0.2; // Input Smoothing parameter

    // Dynamic Scaling
    this.baseHeadSize = null; // To be set during calibration
    this.currentScale = 1;
    this.targetScale = 1;

    // Start render loop
    this.updatePosition();
  }

  setExpression(expression) {
    if (!this.validExpressions.includes(expression)) return;

    if (this.currentExpression !== expression) {
      // Remove old expression class
      this.pouElement.classList.remove(this.currentExpression);
      // Add new expression class
      this.pouElement.classList.add(expression);
      this.currentExpression = expression;
    }
  }

  // Called to update the target position of Pou based on camera/tracking input
  setTargetPosition(x, y) {
    this.targetX = x;
    this.targetY = y;
  }

  // Dynamic scaling calculation
  updateScaleFromEyeDistance(eyeDistance) {
    if (!this.baseHeadSize) return; // Need calibration first

    // Calculate ratio of current distance vs base distance
    let scaleRatio = eyeDistance / this.baseHeadSize;

    // Clamp to prevent extreme sizes
    scaleRatio = Math.max(0.5, Math.min(scaleRatio, 2.5));

    this.targetScale = scaleRatio;
  }

  // Animation Loop for Smooth Movement (Lerp)
  updatePosition() {
    // Lerp position
    this.currentX = this.currentX + (this.targetX - this.currentX) * this.lerpSpeed;
    this.currentY = this.currentY + (this.targetY - this.currentY) * this.lerpSpeed;

    // Lerp scale
    this.currentScale = this.currentScale + (this.targetScale - this.currentScale) * this.lerpSpeed;

    // Apply to DOM via transform
    if (this.wrapperElement) {
        // We use absolute positioning relative to top left, so we translate based on coordinates
        this.wrapperElement.style.left = `${this.currentX}px`;
        this.wrapperElement.style.top = `${this.currentY}px`;
        this.wrapperElement.style.transform = `translate(-50%, -50%) scale(${this.currentScale})`;
    }

    requestAnimationFrame(() => this.updatePosition());
  }

  // Calibration method
  calibrateBaseHeadSize(eyeDistance) {
    this.baseHeadSize = eyeDistance;
    console.log(`Calibrated! Base Head Size (Eye Distance): ${this.baseHeadSize}`);
  }
}

window.pouController = new PouController();
