/**
 * 3D Text Heart Interactive Engine
 * Generates parametric 3D heart text layout with real-time CSS 3D interactivity,
 * particle bursts, Web Audio API sound synthesis, and orbit controls.
 */

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const viewport = document.getElementById('viewport');
    const heartContainer = document.getElementById('heart-container');
    const bgCanvas = document.getElementById('bg-canvas');
    const bgCtx = bgCanvas.getContext('2d');
    const cursorGlow = document.getElementById('cursor-glow');

    // Control Inputs
    const customTextInput = document.getElementById('custom-text-input');
    const colorThemeSelect = document.getElementById('color-theme-select');
    const densitySlider = document.getElementById('density-slider');
    const densityVal = document.getElementById('density-val');
    const autoRotateCheck = document.getElementById('auto-rotate-check');
    const soundChimeCheck = document.getElementById('sound-chime-check');
    const togglePanelBtn = document.getElementById('toggle-panel-btn');
    const closePanelBtn = document.getElementById('close-panel-btn');
    const controlsPanel = document.getElementById('controls-panel');
    const resetViewBtn = document.getElementById('reset-view-btn');
    const soundBtn = document.getElementById('sound-btn');
    const soundIconOff = document.getElementById('sound-icon-off');
    const soundIconOn = document.getElementById('sound-icon-on');

    // App State
    let targetText = 'i love you';
    let textCount = 1000;
    let autoRotate = true;
    let soundEnabled = true;
    let bgAudioPlaying = false;

    // 3D Orbit State
    let rotX = -5;
    let rotY = 0;
    let targetRotX = -5;
    let targetRotY = 0;
    let isDragging = false;
    let previousMouseX = 0;
    let previousMouseY = 0;
    let mouseX = 0;
    let mouseY = 0;

    // Web Audio Context & Synthesizer
    let audioCtx = null;
    let bgOscillators = [];
    let bgGainNode = null;

    // Starfield Background Particles
    let bgParticles = [];

    // --- 1. Heart Parametric Math & Mesh Builder ---

    /**
     * Heart curve formula:
     * x(t) = 16 * sin^3(t)
     * y(t) = 13 * cos(t) - 5 * cos(2t) - 2 * cos(3t) - cos(4t)
     */
    function getHeartPoint(t, scale = 18) {
        const x = 16 * Math.pow(Math.sin(t), 3);
        const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
        return { x: x * scale, y: y * scale };
    }

    /**
     * Derivative to compute curve tangent angle
     */
    function getHeartTangentAngle(t) {
        const delta = 0.001;
        const p1 = getHeartPoint(t - delta, 1);
        const p2 = getHeartPoint(t + delta, 1);
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        return Math.atan2(dy, dx) * (180 / Math.PI);
    }

    /**
     * Rebuild the entire 3D heart of text spans
     */
    function buildHeart() {
        heartContainer.innerHTML = '';

        const layersCount = 10; // Overlapping depth ribbon layers
        const itemsPerLayer = Math.floor(textCount / layersCount);
        const scaleBase = Math.min(window.innerWidth, window.innerHeight) < 600 ? 11 : 16;

        let totalCreated = 0;

        for (let l = 0; l < layersCount; l++) {
            const layerProgress = l / (layersCount - 1);
            // Slight depth dispersion (-120px to +120px)
            const zOffset = (layerProgress - 0.5) * 160;
            
            // Concentric scale offset to create thick ribbon effect
            const layerScale = scaleBase * (1.0 - (l * 0.025));
            
            // Angular shift per layer so text strings interlock nicely
            const tOffset = (l * 0.08) % (2 * Math.PI);

            for (let i = 0; i < itemsPerLayer; i++) {
                const fraction = i / itemsPerLayer;
                const t = (fraction * 2 * Math.PI + tOffset) % (2 * Math.PI);

                const point = getHeartPoint(t, layerScale);
                const tangentAngle = getHeartTangentAngle(t);

                // Subtle outward normal displacement
                const normScale = (l % 2 === 0 ? 1 : -1) * 3;
                const normAngle = (tangentAngle + 90) * (Math.PI / 180);
                const finalX = point.x + Math.cos(normAngle) * normScale;
                const finalY = point.y + Math.sin(normAngle) * normScale;

                // Subtle 3D tilt
                const twistY = Math.sin(t * 2) * 15;
                const twistX = Math.cos(t * 2) * 10;

                const span = document.createElement('span');
                span.className = 'heart-text';
                span.textContent = targetText;
                
                // Store base transform properties on dataset
                span.dataset.baseTransform = `translate3d(${finalX.toFixed(2)}px, ${finalY.toFixed(2)}px, ${zOffset.toFixed(2)}px) rotateZ(${tangentAngle.toFixed(2)}deg) rotateY(${twistY.toFixed(2)}deg) rotateX(${twistX.toFixed(2)}deg)`;
                span.style.transform = span.dataset.baseTransform;

                // Subtle opacity gradient along depth
                const depthAlpha = 0.5 + (1 - Math.abs(layerProgress - 0.5) * 2) * 0.5;
                span.style.opacity = depthAlpha.toFixed(2);

                // Attach hover listeners
                attachTextHoverEvents(span, finalY, totalCreated);

                heartContainer.appendChild(span);
                totalCreated++;
            }
        }
    }

    // --- 2. Interactive Text Hover & Sound Effects ---

    const pentatonicPitches = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25, 783.99, 880.00, 1046.50];

    function initAudio() {
        if (!audioCtx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            audioCtx = new AudioContext();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
    }

    function playHoverSound(yPos) {
        if (!soundEnabled) return;
        initAudio();
        if (!audioCtx) return;

        try {
            // Map vertical position to scale pitch index
            const normalizedY = Math.min(Math.max((yPos + 250) / 500, 0), 1);
            const pitchIndex = Math.floor((1 - normalizedY) * (pentatonicPitches.length - 1));
            const freq = pentatonicPitches[pitchIndex] || 440;

            const osc = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

            // Soft chime envelope
            gainNode.gain.setValueAtTime(0.001, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.08, audioCtx.currentTime + 0.03);
            gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.35);

            osc.connect(gainNode);
            gainNode.connect(audioCtx.destination);

            osc.start();
            osc.stop(audioCtx.currentTime + 0.36);
        } catch (e) {
            // Silently swallow audio errors if context is restricted
        }
    }

    function spawnHeartParticle(x, y) {
        const particle = document.createElement('div');
        particle.className = 'heart-particle';
        const icons = ['💖', '✨', '💕', '🌸', '💗', '❤️', '💫'];
        particle.textContent = icons[Math.floor(Math.random() * icons.length)];

        particle.style.left = `${x}px`;
        particle.style.top = `${y}px`;

        const dx = (Math.random() - 0.5) * 80;
        const dy = -40 - Math.random() * 60;
        const rot = (Math.random() - 0.5) * 90;

        particle.style.setProperty('--dx', `${dx}px`);
        particle.style.setProperty('--dy', `${dy}px`);
        particle.style.setProperty('--rot', `${rot}deg`);

        document.body.appendChild(particle);

        setTimeout(() => {
            if (particle.parentNode) {
                particle.parentNode.removeChild(particle);
            }
        }, 1200);
    }

    function attachTextHoverEvents(span, yPos, index) {
        span.addEventListener('mouseenter', (e) => {
            // Scale up & shift Z forward on hover
            span.style.transform = `${span.dataset.baseTransform} scale(1.4) translateZ(40px)`;
            
            // Sound chime
            playHoverSound(yPos);

            // Particle burst (rate limited)
            if (Math.random() < 0.4) {
                spawnHeartParticle(e.clientX, e.clientY);
            }
        });

        span.addEventListener('mouseleave', () => {
            span.style.transform = span.dataset.baseTransform;
        });
    }

    // --- 3. Ambient Romantic Lofi Synthesizer ---

    function toggleBgMusic() {
        initAudio();
        if (!audioCtx) return;

        if (bgAudioPlaying) {
            // Stop background chords
            bgOscillators.forEach(osc => {
                try { osc.stop(); } catch (e) {}
            });
            bgOscillators = [];
            bgAudioPlaying = false;
            soundIconOn.classList.add('hidden');
            soundIconOff.classList.remove('hidden');
        } else {
            // Play warm ambient synth chord progression (Fmaj7 - Cmaj7 - Am7 - G)
            const chords = [
                [174.61, 220.00, 261.63, 329.63], // Fmaj7
                [130.81, 164.81, 196.00, 246.94], // Cmaj7
                [110.00, 130.81, 164.81, 220.00], // Am7
                [146.83, 196.00, 246.94, 293.66]  // G6
            ];

            let chordIdx = 0;
            bgGainNode = audioCtx.createGain();
            bgGainNode.gain.setValueAtTime(0.04, audioCtx.currentTime);

            // Filter for warm lofi sound
            const filter = audioCtx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(600, audioCtx.currentTime);

            bgGainNode.connect(filter);
            filter.connect(audioCtx.destination);

            function playNextChord() {
                if (!bgAudioPlaying) return;

                // Stop active chord
                bgOscillators.forEach(osc => {
                    try { osc.stop(); } catch (e) {}
                });
                bgOscillators = [];

                const currentNotes = chords[chordIdx];
                currentNotes.forEach(freq => {
                    const osc = audioCtx.createOscillator();
                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
                    osc.connect(bgGainNode);
                    osc.start();
                    bgOscillators.push(osc);
                });

                chordIdx = (chordIdx + 1) % chords.length;
                setTimeout(playNextChord, 4000);
            }

            bgAudioPlaying = true;
            soundIconOff.classList.add('hidden');
            soundIconOn.classList.remove('hidden');
            playNextChord();
        }
    }

    // --- 4. Background Star & Dust Canvas ---

    function initBgCanvas() {
        bgCanvas.width = window.innerWidth;
        bgCanvas.height = window.innerHeight;
        bgParticles = [];

        const count = Math.floor((window.innerWidth * window.innerHeight) / 10000);
        for (let i = 0; i < count; i++) {
            bgParticles.push({
                x: Math.random() * bgCanvas.width,
                y: Math.random() * bgCanvas.height,
                radius: Math.random() * 1.5 + 0.5,
                alpha: Math.random() * 0.6 + 0.2,
                speed: Math.random() * 0.3 + 0.1
            });
        }
    }

    function drawBgCanvas() {
        bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
        
        bgParticles.forEach(p => {
            bgCtx.fillStyle = `rgba(238, 181, 215, ${p.alpha})`;
            bgCtx.beginPath();
            bgCtx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            bgCtx.fill();

            p.y -= p.speed;
            if (p.y < 0) {
                p.y = bgCanvas.height;
                p.x = Math.random() * bgCanvas.width;
            }
        });

        requestAnimationFrame(drawBgCanvas);
    }

    // --- 5. 3D Interaction & Animation Loop ---

    function onPointerDown(e) {
        isDragging = true;
        previousMouseX = e.clientX || (e.touches && e.touches[0].clientX);
        previousMouseY = e.clientY || (e.touches && e.touches[0].clientY);
    }

    function onPointerMove(e) {
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);

        // Move cursor follower glow
        if (cursorGlow) {
            cursorGlow.style.transform = `translate3d(${clientX}px, ${clientY}px, 0)`;
        }

        if (!isDragging) {
            // Subtle mouse parallax tilt when moving cursor
            const normX = (clientX / window.innerWidth - 0.5) * 2;
            const normY = (clientY / window.innerHeight - 0.5) * 2;
            mouseX = normX * 10;
            mouseY = -normY * 10;
            return;
        }

        const deltaX = clientX - previousMouseX;
        const deltaY = clientY - previousMouseY;

        targetRotY += deltaX * 0.4;
        targetRotX -= deltaY * 0.4;

        // Clamp rotation X to prevent flip
        targetRotX = Math.max(-60, Math.min(60, targetRotX));

        previousMouseX = clientX;
        previousMouseY = clientY;
    }

    function onPointerUp() {
        isDragging = false;
    }

    function animate() {
        if (autoRotate && !isDragging) {
            targetRotY += 0.25;
        }

        // Smooth rotation damping (lerp)
        rotX += (targetRotX + mouseY - rotX) * 0.08;
        rotY += (targetRotY + mouseX - rotY) * 0.08;

        heartContainer.style.transform = `rotateX(${rotX}deg) rotateY(${rotY}deg)`;

        requestAnimationFrame(animate);
    }

    // --- 6. Event Listeners & UI Controls ---

    viewport.addEventListener('mousedown', onPointerDown);
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);

    viewport.addEventListener('touchstart', onPointerDown, { passive: true });
    window.addEventListener('touchmove', onPointerMove, { passive: true });
    window.addEventListener('touchend', onPointerUp);

    // Custom Text Change
    customTextInput.addEventListener('input', (e) => {
        targetText = e.target.value.trim() || 'i love you';
        buildHeart();
    });

    // Color Theme Selector
    colorThemeSelect.addEventListener('change', (e) => {
        document.body.className = `theme-${e.target.value}`;
    });

    // Density Slider
    densitySlider.addEventListener('input', (e) => {
        textCount = parseInt(e.target.value, 10);
        densityVal.textContent = textCount;
        buildHeart();
    });

    // Auto Rotate Checkbox
    autoRotateCheck.addEventListener('change', (e) => {
        autoRotate = e.target.checked;
    });

    // Sound Chime Checkbox
    soundChimeCheck.addEventListener('change', (e) => {
        soundEnabled = e.target.checked;
    });

    // UI Panel Toggles
    togglePanelBtn.addEventListener('click', () => {
        controlsPanel.classList.toggle('hidden');
    });

    closePanelBtn.addEventListener('click', () => {
        controlsPanel.classList.add('hidden');
    });

    // Reset View Button
    resetViewBtn.addEventListener('click', () => {
        targetRotX = -5;
        targetRotY = 0;
    });

    // Ambient Music Button
    soundBtn.addEventListener('click', () => {
        toggleBgMusic();
    });

    // Resize Handler
    window.addEventListener('resize', () => {
        initBgCanvas();
        buildHeart();
    });

    // --- 7. Initialize Application ---
    document.body.className = 'theme-soft-pink';
    initBgCanvas();
    drawBgCanvas();
    buildHeart();
    animate();
});
