// engine.js
// AR Engine using MediaPipe Face Mesh & Hands with EMA Smoothing

const videoElement = document.getElementById('webcam');
const canvasElement = document.getElementById('camera-canvas');
const canvasCtx = canvasElement.getContext('2d');
const permissionModal = document.getElementById('permission-modal');

// State
let isCameraRunning = false;
let isPageHidden = false;

// Smoothed Data Storage (EMA)
const arData = {
    nose: { x: 0.5, y: 0.5 },
    headTilt: 0,
    mouthOpen: false,
    eyebrowRaise: false,
    eyeDistance: 0.05,
    hands: [] // Array of smoothed hand coordinates
};

// EMA Alpha (0.0 = no update, 1.0 = instant)
const ALPHA = 0.2;
function lerp(oldValue, newValue, alpha = ALPHA) {
    return oldValue + (newValue - oldValue) * alpha;
}

// Distance Helper
function distance(p1, p2) {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
}

// Check Ambient Light (Brightness)
let ambientBrightness = 1;
function calculateAmbientLight() {
    if (!videoElement.videoWidth || !isCameraRunning) return;

    // Create a small temporary canvas to read pixels efficiently
    const tempCanvas = document.createElement('canvas');
    const ctx = tempCanvas.getContext('2d', { willReadFrequently: true });
    tempCanvas.width = 32;
    tempCanvas.height = 32;
    ctx.drawImage(videoElement, 0, 0, 32, 32);

    const imgData = ctx.getImageData(0, 0, 32, 32);
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < imgData.data.length; i += 4) {
        r += imgData.data[i];
        g += imgData.data[i+1];
        b += imgData.data[i+2];
    }
    const pixelCount = imgData.data.length / 4;
    const avgBrightness = (r + g + b) / (3 * 255 * pixelCount);

    // Smooth the brightness
    ambientBrightness = lerp(ambientBrightness, avgBrightness, 0.05);
}

// Handle Face Mesh Results
function onFaceResults(results) {
    if (isPageHidden) return; // Pause processing when hidden

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        const landmarks = results.multiFaceLandmarks[0];

        // 1. Nose Tip (Landmark 1)
        const noseRaw = landmarks[1];
        arData.nose.x = lerp(arData.nose.x, noseRaw.x);
        arData.nose.y = lerp(arData.nose.y, noseRaw.y);

        // 2. Eye Distance for Depth Scaling (Landmarks 33 and 263)
        const leftEye = landmarks[33];
        const rightEye = landmarks[263];
        const rawEyeDist = distance(leftEye, rightEye);
        arData.eyeDistance = lerp(arData.eyeDistance, rawEyeDist);

        // 3. Head Tilt (Angle between eyes)
        const dx = rightEye.x - leftEye.x;
        const dy = rightEye.y - leftEye.y;
        const rawTilt = Math.atan2(dy, dx) * (180 / Math.PI); // In degrees
        arData.headTilt = lerp(arData.headTilt, rawTilt, 0.1); // Smoother for steering

        // 4. Mouth Open (Landmarks 13 and 14 - inner lips)
        const upperLip = landmarks[13];
        const lowerLip = landmarks[14];
        const mouthDist = distance(upperLip, lowerLip);
        // Normalize against face size (eye distance)
        const normalizedMouthDist = mouthDist / rawEyeDist;
        arData.mouthOpen = normalizedMouthDist > 0.15; // Threshold

        // 5. Eyebrow Raise (Distance between eye 159 and eyebrow 52)
        const eyeTop = landmarks[159];
        const eyebrowTop = landmarks[52];
        const browDist = distance(eyeTop, eyebrowTop);
        const normalizedBrowDist = browDist / rawEyeDist;
        arData.eyebrowRaise = normalizedBrowDist > 0.35; // Threshold
    }
    canvasCtx.restore();
}

// Handle Hands Results
function onHandsResults(results) {
    if (isPageHidden) return;

    if (results.multiHandLandmarks) {
        // Sync hands array length
        while (arData.hands.length < results.multiHandLandmarks.length) {
            arData.hands.push({
                x: 0.5, y: 0.5,
                isPinching: false,
                isOpen: false,
                bbox: { xMin: 0, xMax: 0, yMin: 0, yMax: 0 }
            });
        }
        arData.hands.length = results.multiHandLandmarks.length;

        results.multiHandLandmarks.forEach((landmarks, index) => {
            const handState = arData.hands[index];

            // Center of hand (approximated by middle finger MCP - landmark 9)
            const centerRaw = landmarks[9];
            handState.x = lerp(handState.x, centerRaw.x);
            handState.y = lerp(handState.y, centerRaw.y);

            // Bounding Box (for petting intersection)
            let xMin = 1, xMax = 0, yMin = 1, yMax = 0;
            landmarks.forEach(lm => {
                xMin = Math.min(xMin, lm.x);
                xMax = Math.max(xMax, lm.x);
                yMin = Math.min(yMin, lm.y);
                yMax = Math.max(yMax, lm.y);
            });
            handState.bbox = { xMin, xMax, yMin, yMax };

            // Pinch Detection (Thumb 4, Index 8)
            const thumb = landmarks[4];
            const indexFinger = landmarks[8];
            const pinchDist = distance(thumb, indexFinger);

            // Normalize against palm size (wrist 0 to middle mcp 9)
            const palmDist = distance(landmarks[0], landmarks[9]);
            handState.isPinching = (pinchDist / palmDist) < 0.25;

            // Open Hand Detection (for petting)
            // Check if fingertips (8, 12, 16, 20) are far from wrist (0)
            let openScore = 0;
            [8, 12, 16, 20].forEach(tip => {
                if (distance(landmarks[tip], landmarks[0]) > palmDist * 1.5) {
                    openScore++;
                }
            });
            handState.isOpen = openScore >= 3;
        });
    } else {
        arData.hands = [];
    }
}

// Setup MediaPipe
const faceMesh = new FaceMesh({locateFile: (file) => {
    return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
}});
faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});
faceMesh.onResults(onFaceResults);

const hands = new Hands({locateFile: (file) => {
    return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
}});
hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});
hands.onResults(onHandsResults);

// Setup Camera
let camera;
async function startCamera() {
    try {
        // Test permissions first
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        videoElement.srcObject = stream;

        camera = new Camera(videoElement, {
            onFrame: async () => {
                if (!isPageHidden) {
                    await faceMesh.send({image: videoElement});
                    await hands.send({image: videoElement});
                }
            },
            width: 1280,
            height: 720
        });

        // Match canvas size to video size
        videoElement.addEventListener('loadedmetadata', () => {
            canvasElement.width = videoElement.videoWidth;
            canvasElement.height = videoElement.videoHeight;
        });

        await camera.start();
        isCameraRunning = true;

        // Start ambient light loop
        setInterval(calculateAmbientLight, 500);

    } catch (err) {
        console.error("Camera access denied or failed:", err);
        permissionModal.classList.remove('hidden');
    }
}

// Page Visibility API Integration
document.addEventListener("visibilitychange", () => {
    isPageHidden = document.hidden;
    if (isPageHidden) {
        // Pause camera streams conceptually (MediaPipe takes care of stopping processing if we don't send frames)
        if (videoElement.srcObject) {
            videoElement.srcObject.getTracks().forEach(t => t.enabled = false);
        }
    } else {
        // Resume
        if (videoElement.srcObject) {
            videoElement.srcObject.getTracks().forEach(t => t.enabled = true);
        }
    }
});

// Initialize
window.addEventListener('load', () => {
    startCamera();
});

// Export functions/data for game.js
window.AR_ENGINE = {
    getData: () => arData,
    getBrightness: () => ambientBrightness,
    getCanvas: () => canvasElement
};
