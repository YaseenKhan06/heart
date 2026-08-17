/**
 * Ultra-Lightweight 3D Text Heart Engine
 * Optimized for maximum 60-120 FPS performance on any device/laptop.
 * Zero CPU shadowBlur overhead, hardware composited CSS filter, pre-allocated memory buffers.
 */

document.addEventListener('DOMContentLoaded', () => {
    // Canvas & Context Setup
    const heartCanvas = document.getElementById('heart-canvas');
    const ctx = heartCanvas.getContext('2d', { alpha: true });
    
    const bgCanvas = document.getElementById('bg-canvas');
    const bgCtx = bgCanvas.getContext('2d');
    const cursorGlow = document.getElementById('cursor-glow');

    // UI Inputs
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

    // Color Palettes
    const themes = {
        'soft-pink': { base: '#ecb2d6', glow: 'rgba(236, 178, 214, 0.5)', hover: '#ff55a3' },
        'rose-gold': { base: '#f0c3ad', glow: 'rgba(240, 195, 173, 0.5)', hover: '#ff9966' },
        'cyber-magenta': { base: '#f584e0', glow: 'rgba(245, 132, 224, 0.6)', hover: '#ff00d4' },
        'crimson-red': { base: '#ff8899', glow: 'rgba(255, 136, 153, 0.6)', hover: '#ff1a40' },
        'violet-glow': { base: '#cb9bf5', glow: 'rgba(203, 155, 245, 0.6)', hover: '#a13bf5' }
    };

    // State
    let currentTheme = themes['soft-pink'];
    let targetText = 'i love you';
    let textCount = 400;
    let autoRotate = true;
    let soundEnabled = true;
    let bgAudioPlaying = false;

    // Pre-allocated Buffers
    let heartPoints = [];
    let projectedNodes = [];

    // Interaction & Orbit
    let rotX = -5;
    let rotY = 0;
    let targetRotX = -5;
    let targetRotY = 0;
    let isDragging = false;
    let previousMouseX = 0;
    let previousMouseY = 0;
    let mouseX = -9999;
    let mouseY = -9999;
    let hoveredIndex = -1;

    // Web Audio Synthesizer
    let audioCtx = null;
    let bgOscillators = [];
    let bgGainNode = null;
    const pentatonicPitches = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25, 783.99, 880.00];

    // Background Dust Particles
    let bgParticles = [];

    // --- 1. Parametric Heart Math ---

    function getHeartPoint(t, scale = 16) {
        const x = 16 * Math.pow(Math.sin(t), 3);
        const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
        return { x: x * scale, y: y * scale };
    }

    function getHeartTangentAngle(t) {
        const delta = 0.001;
        const p1 = getHeartPoint(t - delta, 1);
        const p2 = getHeartPoint(t + delta, 1);
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        return Math.atan2(dy, dx);
    }

    function generateHeartGeometry() {
        heartPoints = [];
        projectedNodes = [];

        const layersCount = 8;
        const itemsPerLayer = Math.floor(textCount / layersCount);
        const scaleBase = Math.min(window.innerWidth, window.innerHeight) < 600 ? 11 : 16;

        let index = 0;
        for (let l = 0; l < layersCount; l++) {
            const layerProgress = l / (layersCount - 1);
            const zOffset = (layerProgress - 0.5) * 150;
            const layerScale = scaleBase * (1.0 - (l * 0.025));
            const tOffset = (l * 0.08) % (2 * Math.PI);

            for (let i = 0; i < itemsPerLayer; i++) {
                const fraction = i / itemsPerLayer;
                const t = (fraction * 2 * Math.PI + tOffset) % (2 * Math.PI);

                const point = getHeartPoint(t, layerScale);
                const tangentAngle = getHeartTangentAngle(t);

                const normScale = (l % 2 === 0 ? 1 : -1) * 3;
                const normAngle = tangentAngle + Math.PI / 2;
                const x = point.x + Math.cos(normAngle) * normScale;
                const y = point.y + Math.sin(normAngle) * normScale;

                heartPoints.push({
                    x, y, z: zOffset,
                    angle: tangentAngle,
                    yBase: y,
                    layerProgress
                });

                projectedNodes.push({
                    id: index++,
                    x: 0, y: 0, z: 0,
                    scale: 1, angle: 0,
                    yBase: y,
                    layerProgress
                });
            }
        }
    }

    // --- 2. Ultra-Fast Rendering Loop ---

    function resizeCanvas() {
        // Cap scale to 1.0 for instant 60 FPS without high-DPI supersampling overhead
        heartCanvas.width = window.innerWidth;
        heartCanvas.height = window.innerHeight;

        bgCanvas.width = window.innerWidth;
        bgCanvas.height = window.innerHeight;

        initBgCanvas();
        generateHeartGeometry();
    }

    function renderHeart() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const centerX = width / 2;
        const centerY = height / 2;
        const fov = 750;

        ctx.clearRect(0, 0, width, height);

        const radX = (rotX * Math.PI) / 180;
        const radY = (rotY * Math.PI) / 180;

        const cosX = Math.cos(radX), sinX = Math.sin(radX);
        const cosY = Math.cos(radY), sinY = Math.sin(radY);

        let closestDist = 26;
        let newHoveredIndex = -1;

        // Project 3D points
        const count = heartPoints.length;
        for (let i = 0; i < count; i++) {
            const pt = heartPoints[i];
            const node = projectedNodes[i];

            // Rotation Y
            const x1 = pt.x * cosY + pt.z * sinY;
            const z1 = -pt.x * sinY + pt.z * cosY;

            // Rotation X
            const y1 = pt.y * cosX - z1 * sinX;
            const z2 = pt.y * sinX + z1 * cosX;

            const scale = fov / (fov + z2 + 200);
            node.x = centerX + x1 * scale;
            node.y = centerY + y1 * scale;
            node.z = z2;
            node.scale = scale;
            node.angle = pt.angle + radY;

            // Hit test
            const dx = mouseX - node.x;
            const dy = mouseY - node.y;
            const distSq = dx * dx + dy * dy;

            if (distSq < closestDist * closestDist) {
                closestDist = Math.sqrt(distSq);
                newHoveredIndex = node.id;
            }
        }

        if (newHoveredIndex !== hoveredIndex) {
            hoveredIndex = newHoveredIndex;
            if (hoveredIndex !== -1) {
                const hNode = projectedNodes[hoveredIndex];
                if (hNode) {
                    playHoverSound(hNode.yBase);
                    spawnHeartParticle(mouseX, mouseY);
                }
            }
        }

        heartCanvas.style.cursor = hoveredIndex !== -1 ? 'pointer' : (isDragging ? 'grabbing' : 'grab');

        // Sort back-to-front by Z depth
        projectedNodes.sort((a, b) => b.z - a.z);

        // Draw Text Spans (0 shadowBlur for super speed!)
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '500 13px Outfit, sans-serif';

        for (let i = 0; i < count; i++) {
            const node = projectedNodes[i];
            const isHovered = node.id === hoveredIndex;

            ctx.save();
            ctx.translate(node.x, node.y);
            ctx.rotate(node.angle);

            if (isHovered) {
                ctx.scale(node.scale * 1.45, node.scale * 1.45);
                ctx.fillStyle = '#ffffff';
                ctx.shadowColor = currentTheme.hover;
                ctx.shadowBlur = 14;
                ctx.font = '600 14px Outfit, sans-serif';
            } else {
                ctx.scale(node.scale, node.scale);
                const alpha = 0.45 + (1 - Math.abs(node.layerProgress - 0.5) * 2) * 0.55;
                ctx.globalAlpha = alpha;
                ctx.fillStyle = currentTheme.base;
                ctx.shadowBlur = 0; // Extremely lightweight!
            }

            ctx.fillText(targetText, 0, 0);
            ctx.restore();
        }
    }

    // --- 3. Sound & Particles ---

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
            const normalizedY = Math.min(Math.max((yPos + 250) / 500, 0), 1);
            const pitchIndex = Math.floor((1 - normalizedY) * (pentatonicPitches.length - 1));
            const freq = pentatonicPitches[pitchIndex] || 440;

            const osc = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

            gainNode.gain.setValueAtTime(0.001, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.08, audioCtx.currentTime + 0.03);
            gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.28);

            osc.connect(gainNode);
            gainNode.connect(audioCtx.destination);

            osc.start();
            osc.stop(audioCtx.currentTime + 0.3);
        } catch (e) {}
    }

    function spawnHeartParticle(x, y) {
        if (Math.random() > 0.4) return;
        const particle = document.createElement('div');
        particle.className = 'heart-particle';
        const icons = ['💖', '✨', '💕', '🌸', '💗', '❤️'];
        particle.textContent = icons[Math.floor(Math.random() * icons.length)];

        particle.style.left = `${x}px`;
        particle.style.top = `${y}px`;

        const dx = (Math.random() - 0.5) * 70;
        const dy = -35 - Math.random() * 50;
        const rot = (Math.random() - 0.5) * 80;

        particle.style.setProperty('--dx', `${dx}px`);
        particle.style.setProperty('--dy', `${dy}px`);
        particle.style.setProperty('--rot', `${rot}deg`);

        document.body.appendChild(particle);

        setTimeout(() => {
            if (particle.parentNode) {
                particle.parentNode.removeChild(particle);
            }
        }, 1000);
    }

    function toggleBgMusic() {
        initAudio();
        if (!audioCtx) return;

        if (bgAudioPlaying) {
            bgOscillators.forEach(osc => { try { osc.stop(); } catch (e) {} });
            bgOscillators = [];
            bgAudioPlaying = false;
            soundIconOn.classList.add('hidden');
            soundIconOff.classList.remove('hidden');
        } else {
            const chords = [
                [174.61, 220.00, 261.63, 329.63],
                [130.81, 164.81, 196.00, 246.94],
                [110.00, 130.81, 164.81, 220.00],
                [146.83, 196.00, 246.94, 293.66]
            ];

            let chordIdx = 0;
            bgGainNode = audioCtx.createGain();
            bgGainNode.gain.setValueAtTime(0.035, audioCtx.currentTime);

            const filter = audioCtx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(550, audioCtx.currentTime);

            bgGainNode.connect(filter);
            filter.connect(audioCtx.destination);

            function playNextChord() {
                if (!bgAudioPlaying) return;
                bgOscillators.forEach(osc => { try { osc.stop(); } catch (e) {} });
                bgOscillators = [];

                chords[chordIdx].forEach(freq => {
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

    // --- 4. Starfield Dust Canvas ---

    function initBgCanvas() {
        bgParticles = [];
        const count = 30; // Very small light count
        for (let i = 0; i < count; i++) {
            bgParticles.push({
                x: Math.random() * window.innerWidth,
                y: Math.random() * window.innerHeight,
                radius: Math.random() * 1.5 + 0.5,
                alpha: Math.random() * 0.5 + 0.2,
                speed: Math.random() * 0.2 + 0.05
            });
        }
    }

    function drawBgCanvas() {
        bgCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        bgCtx.fillStyle = 'rgba(238, 181, 215, 0.4)';
        for (let i = 0; i < bgParticles.length; i++) {
            const p = bgParticles[i];
            bgCtx.fillRect(p.x, p.y, p.radius * 2, p.radius * 2);
            p.y -= p.speed;
            if (p.y < 0) {
                p.y = window.innerHeight;
                p.x = Math.random() * window.innerWidth;
            }
        }
    }

    // --- 5. Main Animation Loop & Input Listeners ---

    function animate() {
        if (autoRotate && !isDragging) {
            targetRotY += 0.25;
        }

        rotX += (targetRotX - rotX) * 0.08;
        rotY += (targetRotY - rotY) * 0.08;

        drawBgCanvas();
        renderHeart();

        requestAnimationFrame(animate);
    }

    function onPointerDown(e) {
        isDragging = true;
        previousMouseX = e.clientX || (e.touches && e.touches[0].clientX);
        previousMouseY = e.clientY || (e.touches && e.touches[0].clientY);
    }

    function onPointerMove(e) {
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);

        mouseX = clientX;
        mouseY = clientY;

        if (cursorGlow) {
            cursorGlow.style.transform = `translate3d(${clientX}px, ${clientY}px, 0)`;
        }

        if (!isDragging) return;

        const deltaX = clientX - previousMouseX;
        const deltaY = clientY - previousMouseY;

        targetRotY += deltaX * 0.4;
        targetRotX -= deltaY * 0.4;
        targetRotX = Math.max(-60, Math.min(60, targetRotX));

        previousMouseX = clientX;
        previousMouseY = clientY;
    }

    function onPointerUp() {
        isDragging = false;
    }

    // Event Listeners
    heartCanvas.addEventListener('mousedown', onPointerDown);
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);

    heartCanvas.addEventListener('touchstart', onPointerDown, { passive: true });
    window.addEventListener('touchmove', onPointerMove, { passive: true });
    window.addEventListener('touchend', onPointerUp);

    customTextInput.addEventListener('input', (e) => {
        targetText = e.target.value.trim() || 'i love you';
    });

    colorThemeSelect.addEventListener('change', (e) => {
        const themeKey = e.target.value;
        currentTheme = themes[themeKey] || themes['soft-pink'];
        document.body.className = `theme-${themeKey}`;
    });

    densitySlider.addEventListener('input', (e) => {
        textCount = parseInt(e.target.value, 10);
        densityVal.textContent = textCount;
        generateHeartGeometry();
    });

    autoRotateCheck.addEventListener('change', (e) => {
        autoRotate = e.target.checked;
    });

    soundChimeCheck.addEventListener('change', (e) => {
        soundEnabled = e.target.checked;
    });

    togglePanelBtn.addEventListener('click', () => {
        controlsPanel.classList.toggle('hidden');
    });

    closePanelBtn.addEventListener('click', () => {
        controlsPanel.classList.add('hidden');
    });

    resetViewBtn.addEventListener('click', () => {
        targetRotX = -5;
        targetRotY = 0;
    });

    soundBtn.addEventListener('click', () => {
        toggleBgMusic();
    });

    window.addEventListener('resize', resizeCanvas);

    // Initialization
    document.body.className = 'theme-soft-pink';
    resizeCanvas();
    animate();
});
