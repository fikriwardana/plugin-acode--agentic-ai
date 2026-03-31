// engine.js

class AREngine {
  constructor() {
    this.videoElement = document.getElementById('input_video');
    this.canvasElement = document.getElementById('output_canvas');
    this.canvasCtx = this.canvasElement.getContext('2d');

    // Store latest processed data for minigames to read
    this.latestFaceData = null;
    this.latestHandsData = null;

    // Calibration State
    this.isCalibrated = false;
    this.calibrationStartTime = null;
    this.calibrationDuration = 3000; // 3 seconds
    this.calibrationModal = document.getElementById('calibration-modal');
    this.calibrationText = document.getElementById('calibration-text');

    // Callback event for minigames
    this.onFrameCallbacks = [];

    this.initMediaPipe();
  }

  initMediaPipe() {
    // 1. Initialize Face Mesh
    this.faceMesh = new FaceMesh({locateFile: (file) => {
      return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
    }});

    this.faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    this.faceMesh.onResults((results) => this.onFaceResults(results));

    // 2. Initialize Hands
    this.hands = new Hands({locateFile: (file) => {
      return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
    }});

    this.hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    this.hands.onResults((results) => this.onHandsResults(results));

    // 3. Start Camera Setup
    this.camera = new Camera(this.videoElement, {
      onFrame: async () => {
        // Run both models concurrently
        await Promise.all([
            this.faceMesh.send({image: this.videoElement}),
            this.hands.send({image: this.videoElement})
        ]);

        // Custom draw loop
        this.drawOutput();

        // Fire callbacks for minigames
        this.onFrameCallbacks.forEach(cb => cb({
          face: this.latestFaceData,
          hands: this.latestHandsData
        }));
      },
      width: 1280,
      height: 720
    });

    this.camera.start();
  }

  // --- PROCESSING RESULTS ---

  onFaceResults(results) {
    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
      this.latestFaceData = results.multiFaceLandmarks[0];

      // Calculate basic face metrics needed for Pou AR Solo
      const face = this.latestFaceData;

      // Node indices:
      // Nose tip: 1
      // Left eye outer corner: 33 (or center 468)
      // Right eye outer corner: 263 (or center 473)
      // Upper lip inner: 13
      // Lower lip inner: 14
      // Left eyebrow upper: 105

      const nose = face[1];
      const leftEye = face[468] || face[33]; // Fallback if refineLandmarks fails
      const rightEye = face[473] || face[263];
      const upperLip = face[13];
      const lowerLip = face[14];
      const leftEyebrow = face[105];

      // Screen Coordinates Calculation
      // (Mirroring X because camera feed is mirrored)
      const screenX = (1 - nose.x) * window.innerWidth;
      const screenY = nose.y * window.innerHeight;

      // Eye Distance (for dynamic scaling)
      // Calculate 2D distance ignoring Z for simplicity, but multiply by resolution
      const dx = (leftEye.x - rightEye.x) * window.innerWidth;
      const dy = (leftEye.y - rightEye.y) * window.innerHeight;
      const eyeDistance = Math.sqrt(dx*dx + dy*dy);

      // Head Tilt Angle (for Sky Climber)
      const tiltAngle = Math.atan2(leftEye.y - rightEye.y, leftEye.x - rightEye.x) * (180 / Math.PI);

      // Mouth Open Distance (for Food Fall)
      const mouthDistance = Math.abs((lowerLip.y - upperLip.y) * window.innerHeight);

      // Eyebrow Raise (for Nitro Racing)
      const eyebrowDistance = Math.abs((leftEyebrow.y - leftEye.y) * window.innerHeight);

      // Package processed data
      this.latestFaceData = {
          raw: face,
          nose: { x: screenX, y: screenY },
          eyeDistance: eyeDistance,
          tiltAngle: tiltAngle, // Needs normalization based on neutral pose
          mouthOpen: mouthDistance > 20, // Threshold 20px
          eyebrowsRaised: eyebrowDistance > 40 // Threshold 40px
      };

      // Handle Calibration Logic
      if (!this.isCalibrated) {
        this.handleCalibration(eyeDistance);
      } else {
        // Only update pou position/scale if calibrated
        if (window.pouController) {
          window.pouController.updateScaleFromEyeDistance(eyeDistance);
          // In base mode, Pou follows nose. Minigames might override this later.
          window.pouController.setTargetPosition(screenX, screenY);
        }
      }
    } else {
      this.latestFaceData = null;
    }
  }

  onHandsResults(results) {
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      this.latestHandsData = results.multiHandLandmarks.map((hand, idx) => {
        // Calculate basic hand metrics

        // Pinch gesture: Thumb tip (4) and Index tip (8)
        const thumbTip = hand[4];
        const indexTip = hand[8];
        const dx = (thumbTip.x - indexTip.x) * window.innerWidth;
        const dy = (thumbTip.y - indexTip.y) * window.innerHeight;
        const pinchDist = Math.sqrt(dx*dx + dy*dy);

        // Open hand vs closed check (simplified: compare fingertips to wrist)
        const wrist = hand[0];
        let openFingersCount = 0;
        [8, 12, 16, 20].forEach(tipIdx => {
          const mcpIdx = tipIdx - 2;
          // If tip is further from wrist than MCP, finger is extended
          const tipDist = Math.sqrt(Math.pow(hand[tipIdx].x - wrist.x, 2) + Math.pow(hand[tipIdx].y - wrist.y, 2));
          const mcpDist = Math.sqrt(Math.pow(hand[mcpIdx].x - wrist.x, 2) + Math.pow(hand[mcpIdx].y - wrist.y, 2));
          if (tipDist > mcpDist) openFingersCount++;
        });

        const isOpen = openFingersCount >= 4;

        return {
          raw: hand,
          handedness: results.multiHandedness[idx].label,
          indexTip: {
             x: (1 - indexTip.x) * window.innerWidth, // mirrored
             y: indexTip.y * window.innerHeight
          },
          isPinching: pinchDist < 30, // 30px threshold
          isOpenHand: isOpen
        };
      });
    } else {
      this.latestHandsData = null;
    }
  }

  // --- CALIBRATION ---
  handleCalibration(eyeDistance) {
    if (this.calibrationModal) this.calibrationModal.classList.remove('hidden');

    if (!this.calibrationStartTime) {
      this.calibrationStartTime = Date.now();
    }

    const elapsed = Date.now() - this.calibrationStartTime;
    const remaining = Math.ceil((this.calibrationDuration - elapsed) / 1000);

    if (elapsed < this.calibrationDuration) {
      if (this.calibrationText) {
         this.calibrationText.innerText = `Tahan wajahmu lurus... ${remaining}d`;
      }
    } else {
      // Calibration complete
      this.isCalibrated = true;
      if (this.calibrationModal) this.calibrationModal.classList.add('hidden');
      if (window.pouController) {
          window.pouController.calibrateBaseHeadSize(eyeDistance);
      }
    }
  }

  // --- DRAWING LOOP ---
  drawOutput() {
    this.canvasCtx.save();
    this.canvasCtx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);

    // Draw Video Frame onto canvas (mirrored)
    this.canvasCtx.translate(this.canvasElement.width, 0);
    this.canvasCtx.scale(-1, 1);
    this.canvasCtx.drawImage(this.videoElement, 0, 0, this.canvasElement.width, this.canvasElement.height);

    // Optional: Draw Face Mesh or Hand landmarks here using drawing_utils
    // Usually for games, we keep it hidden for immersion, but leaving hooks if needed.

    this.canvasCtx.restore();
  }

  // Subscribe to per-frame processed data
  subscribe(callback) {
    this.onFrameCallbacks.push(callback);
  }

  unsubscribe(callback) {
    this.onFrameCallbacks = this.onFrameCallbacks.filter(cb => cb !== callback);
  }
}

window.arEngine = new AREngine();
