// スマホのジェスチャーによる誤動作を防止
document.addEventListener('touchstart', (e) => {
    if (e.touches.length > 1) e.preventDefault();
}, { passive: false });

const colors = [
    { val: 0, name: '黒', hex: '#000000' },
    { val: 1, name: '茶', hex: '#8B4513' },
    { val: 2, name: '赤', hex: '#FF0000' },
    { val: 3, name: '橙', hex: '#FFA500' },
    { val: 4, name: '黄', hex: '#FFFF00' },
    { val: 5, name: '緑', hex: '#008000' },
    { val: 6, name: '青', hex: '#0000FF' },
    { val: 7, name: '紫', hex: '#EE82EE' },
    { val: 8, name: '灰', hex: '#808080' },
    { val: 9, name: '白', hex: '#FFFFFF' }
];

let score = 0, combo = 0, maxCombo = 0, lives = 3, timeLeft = 30.0;
let isPlaying = false, currentTarget = null, beatCount = 0;
let expectedTime = 0, beatTimerId = null, timerIntervalId = null;
let baseBpm = 100, currentBpm = 100, beatMs = 600;
let isAnswered = false, isFever = false, isRecovering = false;

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

const ui = document.getElementById('game-ui');
const settings = document.getElementById('settings-area');
const timeDisplay = document.getElementById('time-display');
const heartsDisplay = document.getElementById('hearts-display');
const bpmDisplay = document.getElementById('bpm-display');
const scoreVal = document.getElementById('score-val');
const comboDisplay = document.getElementById('combo-display');
const colorCard = document.getElementById('color-card');
const rhythmArea = document.getElementById('rhythm-area');
const clapContainer = document.getElementById('clap-container');
const phaseBar = document.getElementById('phase-bar');
const flashOverlay = document.getElementById('flash-overlay');
const resultModal = document.getElementById('result-modal');

// BGMデータ：王道ブルース
const bassLines = [
    [65.41, 82.41, 98.00, 110.00], [116.54, 110.00, 98.00, 82.41],
    [87.31, 110.00, 130.81, 146.83], [155.56, 146.83, 130.81, 110.00],
    [65.41, 82.41, 98.00, 110.00], [116.54, 110.00, 98.00, 82.41],
    [98.00, 123.47, 146.83, 164.81], [116.54, 110.00, 98.00, 92.50]
];
const pianoChords = [
    [261.63, 329.63, 392.00, 466.16], [261.63, 329.63, 392.00, 466.16],
    [349.23, 440.00, 523.25, 622.25], [349.23, 440.00, 523.25, 622.25],
    [261.63, 329.63, 392.00, 466.16], [261.63, 329.63, 392.00, 466.16],
    [392.00, 493.88, 587.33, 698.46], [392.00, 493.88, 587.33, 698.46]
];

function playTone(freq, type = 'sine', duration = 0.1, timeOffset = 0, vol = 0.5) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime + timeOffset);
    osc.connect(gain); gain.connect(audioCtx.destination);
    const now = audioCtx.currentTime + timeOffset;
    osc.start(now);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.stop(now + duration);
}

function playClapSound() {
    const bufferSize = audioCtx.sampleRate * 0.1;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass'; filter.frequency.value = 1200;
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(1, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
    source.connect(filter); filter.connect(gain); gain.connect(audioCtx.destination);
    source.start();
}

function playKickSound() {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine'; osc.frequency.setValueAtTime(120, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.8, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + 0.3);
}

function playJazzBass(freq, timeOffset = 0) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();
    const duration = beatMs / 1000;
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime + timeOffset);
    filter.type = 'lowpass'; filter.Q.value = 1.0;
    const start = audioCtx.currentTime + timeOffset;
    filter.frequency.setValueAtTime(800, start);
    filter.frequency.exponentialRampToValueAtTime(200, start + duration);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.7, start + 0.01);
    // 次の拍までしっかり繋げる
    gain.gain.linearRampToValueAtTime(0.3, start + duration * 0.9);
    gain.gain.linearRampToValueAtTime(0.0001, start + duration);
    osc.connect(filter); filter.connect(gain); gain.connect(audioCtx.destination);
    osc.start(start); osc.stop(start + duration + 0.01);
}

function playJazzPiano(freqs, timeOffset = 0) {
    const start = audioCtx.currentTime + timeOffset;
    freqs.forEach(freq => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine'; osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.08, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.8);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(start); osc.stop(start + 0.9);
    });
}

function startGame(bpm) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    baseBpm = bpm; currentBpm = bpm;
    updateTempoVar();
    score = 0; combo = 0; maxCombo = 0; lives = 3; timeLeft = 30.00; beatCount = 0;
    isPlaying = true; isAnswered = true; isFever = false; isRecovering = false;
    updateUI();
    resetFever();
    settings.classList.add('hidden');
    ui.classList.remove('hidden');
    resultModal.classList.add('hidden');
    nextQuestion();
    clearInterval(timerIntervalId);
    timerIntervalId = setInterval(updateTimer, 100);
    expectedTime = performance.now();
    runBeat();
}

// ★追加：タイトル画面に戻る処理
function backToTitle() {
    isPlaying = false;
    clearTimeout(beatTimerId);
    clearInterval(timerIntervalId);
    resultModal.classList.add('hidden');
    ui.classList.add('hidden');
    settings.classList.remove('hidden');
}

function updateTempoVar() {
    beatMs = 60000 / currentBpm;
    bpmDisplay.innerText = `BPM: ${currentBpm}`;
}

function updateTimer() {
    if (!isPlaying) return;
    timeLeft -= 0.1;
    if (timeLeft <= 0) {
        timeLeft = 0; endGame("TIME UP!");
    }
    updateUI();
}

function updateUI() {
    timeDisplay.innerText = timeLeft.toFixed(2);
    scoreVal.innerText = score;
    heartsDisplay.innerText = "❤️".repeat(lives);
    if (combo >= 1) {
        comboDisplay.innerText = combo + " COMBO!";
        comboDisplay.style.display = 'block';
        comboDisplay.classList.add('combo-active');
    } else {
        comboDisplay.style.display = 'none';
    }
}

function nextQuestion() {
    currentTarget = colors[Math.floor(Math.random() * colors.length)];
}

function runBeat(isFeverStart = false) {
    if (!isPlaying || isRecovering) return;
    const phase = beatCount % 4;
    const bar = Math.floor(beatCount / 4) % 8;
    const sec = beatMs / 1000;
    const eighth = sec / 2;

    if (phase === 0) {
        playTone(300, 'sine', 0.1, 0, 0.4); playKickSound();
        if (isFever) {
            playJazzBass(bassLines[bar][0], 0);
            if ([2, 5, 7].includes(bar)) playJazzPiano(pianoChords[bar], 0);
        }
    } else if (phase === 1) {
        playClapSound();
        if (isFever) {
            playJazzBass(bassLines[bar][1], 0);
            if (bar === 0) playJazzPiano(pianoChords[bar], 0);
            if (bar === 4) playJazzPiano(pianoChords[bar], eighth);
        }
    } else if (phase === 2) {
        playClapSound(); playKickSound();
        if (isFever) {
            playJazzBass(bassLines[bar][2], 0);
            if (bar === 6) playJazzPiano(pianoChords[bar], 0);
            if (bar === 1) playJazzPiano(pianoChords[bar], eighth);
        }
    } else if (phase === 3) {
        if (isFever) {
            playJazzBass(bassLines[bar][3], 0);
            if (bar === 3) playJazzPiano(pianoChords[bar], 0);
        }
    }

    if (phase === 0) {
        if (beatCount > 0 && !isAnswered && !isFeverStart) {
            handleMiss("TOO SLOW!"); return;
        }
        isAnswered = false;
        phaseBar.style.transition = 'none';
        phaseBar.style.width = '100%';
        colorCard.style.backgroundColor = currentTarget.hex;
        if (!isFeverStart) clapContainer.innerHTML = '';
    } else if (phase === 2 && !isAnswered) {
        phaseBar.style.transition = `width ${beatMs * 2}ms linear`;
        requestAnimationFrame(() => phaseBar.style.width = '0%');
    }

    beatCount++;
    expectedTime += beatMs;
    beatTimerId = setTimeout(runBeat, Math.max(0, expectedTime - performance.now()));
}

function handleInput(num) {
    if (!isPlaying || isRecovering || isAnswered) return;
    const phase = (beatCount - 1) % 4;
    if (phase < 2) {
        isAnswered = true; handleMiss("EARLY!"); return;
    }
    isAnswered = true;
    const percentage = (phaseBar.getBoundingClientRect().width / phaseBar.parentElement.getBoundingClientRect().width) * 100;
    phaseBar.style.transition = 'none';
    phaseBar.style.width = percentage + '%';

    if (num === currentTarget.val) {
        combo++; maxCombo = Math.max(maxCombo, combo);
        let justEnteredFever = (combo === 5 && !isFever);
        if (justEnteredFever) {
            isFever = true; document.body.classList.add('fever-bg'); ui.classList.add('fever-active');
            playTone(600, 'sawtooth', 0.5, 0, 0.3);
        }
        let base = (percentage >= 33 && percentage <= 66) ? 100 : 50;
        score += Math.floor((base * (currentBpm/100) * (isFever ? 3 : 1)) + (combo * 0.1 * currentBpm));
        if (isFever && !justEnteredFever) { currentBpm += 5; updateTempoVar(); }
        updateUI(); nextQuestion();
        if (justEnteredFever) {
            clearTimeout(beatTimerId); beatCount = 0; expectedTime = performance.now(); runBeat(true);
        }
    } else {
        handleMiss("MISS!");
    }
}

function handleMiss(reason) {
    isRecovering = true; combo = 0; resetFever();
    ui.classList.add('shake'); setTimeout(() => ui.classList.remove('shake'), 400);
    playTone(150, 'sawtooth', 0.4); lives--; updateUI();
    if (lives <= 0) { endGame("GAME OVER"); return; }
    clearTimeout(beatTimerId);
    clapContainer.innerHTML = `<span class="sharp-text" style="color:#e74c3c; font-size:2rem;">${reason}</span>`;
    setTimeout(() => {
        if (!isPlaying) return;
        isRecovering = false; beatCount = 0; expectedTime = performance.now(); nextQuestion(); runBeat();
    }, 1500);
}

function resetFever() {
    isFever = false; document.body.classList.remove('fever-bg'); ui.classList.remove('fever-active');
    currentBpm = baseBpm; updateTempoVar();
}

function endGame(msg) {
    isPlaying = false; clearTimeout(beatTimerId); clearInterval(timerIntervalId);
    let rank = 'D', rc = '#95a5a6';
    if (score >= 30000) { rank = 'SSS'; rc = '#ff9ff3'; }
    else if (score >= 20000) { rank = 'SS'; rc = '#f368e0'; }
    else if (score >= 8000) { rank = 'S'; rc = '#f1c40f'; }
    else if (score >= 5500) { rank = 'A'; rc = '#e74c3c'; }
    else if (score >= 3500) { rank = 'B'; rc = '#3498db'; }
    else if (score >= 1500) { rank = 'C'; rc = '#2ecc71'; }
    document.getElementById('result-title').innerText = msg;
    document.getElementById('result-score').innerText = score;
    document.getElementById('result-combo').innerText = maxCombo;
    const rankEl = document.getElementById('result-rank');
    rankEl.innerText = rank; rankEl.style.color = rc;
    resultModal.classList.remove('hidden');
}
