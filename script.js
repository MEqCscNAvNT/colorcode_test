// スマホのジェスチャーによる誤動作を防止
document.addEventListener('touchstart', function(event) {
    if (event.touches.length > 1) {
        event.preventDefault();
    }
}, { passive: false });

const colors = [
    { val: 0, name: '黒', hex: '#000000', text: 'white' },
    { val: 1, name: '茶', hex: '#8B4513', text: 'white' },
    { val: 2, name: '赤', hex: '#FF0000', text: 'white' },
    { val: 3, name: '橙', hex: '#FFA500', text: 'black' },
    { val: 4, name: '黄', hex: '#FFFF00', text: 'black' },
    { val: 5, name: '緑', hex: '#008000', text: 'white' },
    { val: 6, name: '青', hex: '#0000FF', text: 'white' },
    { val: 7, name: '紫', hex: '#EE82EE', text: 'black' },
    { val: 8, name: '灰', hex: '#808080', text: 'white' },
    { val: 9, name: '白', hex: '#FFFFFF', text: 'black' }
];

let score = 0;
let combo = 0;
let maxCombo = 0; 
let lives = 3;
let timeLeft = 30.0;
let isPlaying = false;
let currentTarget = null;
let beatCount = 0;

let expectedTime = 0;
let beatTimerId = null; 
let timerIntervalId = null;
let recoveryTimerId = null;

let baseBpm = 100;
let currentBpm = 100;
let beatMs = 600;
let isAnswered = false; 
let isFever = false;
let isRecovering = false; 

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

const bassLines = [
    [65.41, 82.41, 98.00, 110.00],  // Bar 0: C7 (上り)
    [116.54, 110.00, 98.00, 82.41], // Bar 1: C7 (下り)
    [87.31, 110.00, 130.81, 146.83],// Bar 2: F7 (上り)
    [155.56, 146.83, 130.81, 110.00],// Bar 3: F7 (下り)
    [65.41, 82.41, 98.00, 110.00],  // Bar 4: C7 (上り)
    [116.54, 110.00, 98.00, 82.41], // Bar 5: C7 (下り)
    [98.00, 123.47, 146.83, 164.81],// Bar 6: G7 (上り)
    [116.54, 110.00, 98.00, 92.50]  // Bar 7: Bb-A-G-Gb (ターンアラウンド)
];

const pianoChords = [
    [261.63, 329.63, 392.00, 466.16], // Bar 0: C7
    [261.63, 329.63, 392.00, 466.16], // Bar 1: C7
    [349.23, 440.00, 523.25, 622.25], // Bar 2: F7
    [349.23, 440.00, 523.25, 622.25], // Bar 3: F7
    [261.63, 329.63, 392.00, 466.16], // Bar 4: C7
    [261.63, 329.63, 392.00, 466.16], // Bar 5: C7
    [392.00, 493.88, 587.33, 698.46], // Bar 6: G7
    [392.00, 493.88, 587.33, 698.46]  // Bar 7: G7
];

function playTone(freq, type = 'sine', duration = 0.1, timeOffset = 0, vol = 0.5) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime + timeOffset);
    if(type === 'square') osc.frequency.exponentialRampToValueAtTime(freq * 0.5, audioCtx.currentTime + timeOffset + 0.1);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
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

    const noiseSource = audioCtx.createBufferSource();
    noiseSource.buffer = buffer;

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1200;
    filter.Q.value = 1.0;

    const gainNode = audioCtx.createGain();
    gainNode.gain.setValueAtTime(1, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);

    noiseSource.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    noiseSource.start();
}

function playKickSound() {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.8, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.3);
}

function playJazzBass(freq, timeOffset = 0) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();
    
    const duration = beatMs / 1000; 

    osc.type = 'sawtooth'; 
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime + timeOffset);
    
    filter.type = 'lowpass';
    filter.Q.value = 1.0; 
    const start = audioCtx.currentTime + timeOffset;
    
    filter.frequency.setValueAtTime(800, start);
    filter.frequency.exponentialRampToValueAtTime(200, start + duration); 
    
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.4, start + 0.01); 
    gain.gain.exponentialRampToValueAtTime(0.15, start + duration * 0.95); 
    gain.gain.linearRampToValueAtTime(0.0001, start + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start(start);
    osc.stop(start + duration + 0.01); 
}

function playJazzPiano(freqs, timeOffset = 0, duration = 0.8) {
    const start = audioCtx.currentTime + timeOffset;
    freqs.forEach(freq => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.12, start + 0.02); 
        gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(start);
        osc.stop(start + duration + 0.1);

        const tineOsc = audioCtx.createOscillator();
        const tineGain = audioCtx.createGain();
        tineOsc.type = 'triangle';
        tineOsc.frequency.setValueAtTime(freq * 2, start); 
        tineGain.gain.setValueAtTime(0, start);
        tineGain.gain.linearRampToValueAtTime(0.05, start + 0.01); 
        tineGain.gain.exponentialRampToValueAtTime(0.001, start + 0.3); 
        tineOsc.connect(tineGain);
        tineGain.connect(audioCtx.destination);
        tineOsc.start(start);
        tineOsc.stop(start + 0.4);
    });
}

function playSuccessSound(comboCount) {
    const baseFreq = 880; 
    const steps = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
    const stepIndex = Math.min(comboCount, steps.length - 1);
    const freq = baseFreq * Math.pow(2, steps[stepIndex] / 12);
    playTone(freq, 'sine', 0.2, 0, 0.4);
    playTone(freq * 1.5, 'triangle', 0.3, 0.05, 0.2);
}

function startGame(bpm) {
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    
    clearTimeout(beatTimerId);
    clearInterval(timerIntervalId);
    clearTimeout(recoveryTimerId);

    baseBpm = bpm;
    currentBpm = bpm;
    updateTempoVar();
    score = 0;
    combo = 0;
    maxCombo = 0; 
    lives = 3;
    timeLeft = 30.00;
    beatCount = 0;
    isPlaying = true;
    isAnswered = true; 
    isFever = false;
    isRecovering = false;

    ui.classList.remove('shake');
    clapContainer.innerHTML = '';
    colorCard.innerText = 'Ready';
    colorCard.style.backgroundColor = '#fff';
    colorCard.style.color = '#333';

    updateUI();
    resetFever();
    
    phaseBar.style.transition = 'none';
    phaseBar.style.width = '100%';

    settings.classList.add('hidden');
    ui.classList.remove('hidden');
    document.getElementById('result-modal').classList.add('hidden');

    nextQuestion();

    timerIntervalId = setInterval(updateTimer, 100);
    expectedTime = performance.now();
    runBeat(); 
}

function backToTitle() {
    isPlaying = false;
    
    clearTimeout(beatTimerId);
    clearInterval(timerIntervalId);
    clearTimeout(recoveryTimerId);
    
    if (audioCtx.state === 'running') {
        audioCtx.suspend();
    }
    
    resetFever();
    ui.classList.remove('shake'); 
    
    document.getElementById('result-modal').classList.add('hidden');
    ui.classList.add('hidden');
    settings.classList.remove('hidden');
}

function updateTempoVar() {
    beatMs = 60000 / currentBpm;
    bpmDisplay.innerText = `BPM: ${currentBpm}`;
}

function updateTimer() {
    if (!isPlaying) return;
    
    if (timeLeft > 0) {
        timeLeft -= 0.1;
        if (timeLeft <= 0) {
            timeLeft = 0;
            // EXTREMEモード(baseBpm 200)でフィーバー中なら延長戦
            if (baseBpm === 200 && isFever) {
                // タイマーを止めない
            } else {
                endGame("TIME UP!");
                return;
            }
        }
    } else {
        // すでに延長戦中の場合、フィーバーが切れていたら終了
        if (!isFever) {
            endGame("TIME UP!");
            return;
        }
    }
    
    updateUI();
}

function updateUI() {
    if (timeLeft <= 0 && baseBpm === 200 && isFever) {
        timeDisplay.innerText = "∞";
        timeDisplay.style.color = '#ff4757';
    } else {
        timeDisplay.innerText = timeLeft.toFixed(2);
        timeDisplay.style.color = '#fff';
    }

    scoreVal.innerText = score;
    
    let hearts = "";
    for(let i=0; i<lives; i++) hearts += "❤️";
    heartsDisplay.innerText = hearts;

    if (combo >= 1) {
        comboDisplay.innerText = combo + " COMBO!";
        comboDisplay.style.display = 'block';
        comboDisplay.classList.add('combo-active');
    } else {
        comboDisplay.style.display = 'none';
        comboDisplay.classList.remove('combo-active');
    }
}

function nextQuestion() {
    currentTarget = colors[Math.floor(Math.random() * colors.length)];
}

function triggerFlash() {
    flashOverlay.style.opacity = '0.6';
    setTimeout(() => { flashOverlay.style.opacity = '0'; }, 50);
}

function checkFever() {
    if (combo >= 5) { 
        if (!isFever) {
            isFever = true;
            document.body.classList.add('fever-bg'); 
            ui.classList.add('fever-active');
            playTone(600, 'sawtooth', 0.5, 0, 0.3);
            playTone(1200, 'sawtooth', 0.5, 0.1, 0.3);
        }
    } else {
        resetFever();
    }
}

function resetFever() {
    isFever = false;
    document.body.classList.remove('fever-bg');
    ui.classList.remove('fever-active');
    document.body.style.backgroundColor = '#1a1a1a';
    if (currentBpm !== baseBpm) {
        currentBpm = baseBpm;
        updateTempoVar();
    }
}

function runBeat(isFeverStart = false) {
    if (!isPlaying || isRecovering) return;

    const phase = beatCount % 4; 
    const bar = Math.floor(beatCount / 4) % 8;

    if (phase === 0) {
        playTone(300, 'sine', 0.1, 0, 0.4); 
        playKickSound();
        if (isFever) {
            playJazzBass(bassLines[bar][0], 0);
            if ([2, 5, 7].includes(bar)) playJazzPiano(pianoChords[bar], 0);
        }
        if (beatCount > 0 && !isAnswered && !isFeverStart) { 
            handleMiss("TOO SLOW!"); 
            return; 
        }
        isAnswered = false;
        
        resetPhaseBar();
        colorCard.innerText = ''; 
        colorCard.style.backgroundColor = currentTarget.hex;
        colorCard.style.transform = "scale(1)"; 
        
        colorCard.animate([
            { transform: 'scale(0.8) translateY(-10px)', opacity: 0 },
            { transform: 'scale(1) translateY(0)', opacity: 1 }
        ], { duration: 150, easing: 'ease-out' });

        if (!isFeverStart) {
            clapContainer.innerHTML = '';
        }
        rhythmArea.style.fontSize = "2.8rem";

    } else if (phase === 1) {
        playClapSound();
        if (isFever) {
            playJazzBass(bassLines[bar][1], 0);
            if (bar === 0) playJazzPiano(pianoChords[bar], 0);
            if (bar === 4) playJazzPiano(pianoChords[bar], beatMs/2000);
        }
        if (!isAnswered) {
            clapContainer.innerHTML = '<span class="clap-item clap-visible">👏</span><span class="clap-item">👏</span>';
        }

    } else if (phase === 2) {
        playClapSound();
        playKickSound();
        if (isFever) {
            playJazzBass(bassLines[bar][2], 0);
            if (bar === 6) playJazzPiano(pianoChords[bar], 0);
            if (bar === 1) playJazzPiano(pianoChords[bar], beatMs/2000);
        }
        if (!isAnswered) {
            const items = clapContainer.querySelectorAll('.clap-item');
            if (items.length > 1) items[1].classList.add('clap-visible');
            startPhaseBar(beatMs * 2);
        }

    } else if (phase === 3) {
        if (isFever) {
            playJazzBass(bassLines[bar][3], 0);
            if (bar === 3) playJazzPiano(pianoChords[bar], 0);
        }
        if (!isAnswered) {
            clapContainer.innerHTML = '<span class="sharp-text" style="color:#e74c3c;">???</span>';
            playTone(800, 'sine', 0.1, 0, 0.2);
        }
    }

    beatCount++;
    expectedTime += beatMs;
    let delay = expectedTime - performance.now();
    if (delay < 0) { expectedTime = performance.now(); delay = 0; }
    beatTimerId = setTimeout(runBeat, delay);
}

function resetPhaseBar() {
    phaseBar.style.transition = 'none';
    phaseBar.style.width = '100%';
}

function startPhaseBar(duration) {
    phaseBar.style.transition = `width ${duration}ms linear`;
    requestAnimationFrame(() => { phaseBar.style.width = '0%'; });
}

function handleInput(num) {
    if (!isPlaying || isRecovering) return;
    if (isAnswered) return;

    const phase = (beatCount - 1) % 4;
    if (phase === 0 || phase === 1) {
        isAnswered = true;
        clapContainer.innerHTML = '<span class="sharp-text" style="color:#e74c3c; font-size:1.5rem;">EARLY!</span>';
        handleMiss("EARLY!");
        return;
    }

    isAnswered = true;

    const currentWidth = phaseBar.getBoundingClientRect().width;
    const parentWidth = phaseBar.parentElement.getBoundingClientRect().width;
    const percentage = (currentWidth / parentWidth) * 100;

    phaseBar.style.transition = 'none';
    phaseBar.style.width = percentage + '%';

    if (num === currentTarget.val) {
        combo++;
        if (combo > maxCombo) maxCombo = combo;
        
        let justEnteredFever = false;
        if (combo === 5 && !isFever) {
            justEnteredFever = true;
        }

        checkFever();

        let baseScore = 0;
        let okText = "";
        let okColor = "";
        let fontSize = "2rem";

        if (percentage >= 33.33 && percentage <= 66.66) {
            baseScore = 100;
            okText = isFever ? 'FEVER GREAT!!' : 'GREAT!!';
            okColor = isFever ? '#f1c40f' : '#2ecc71'; 
            fontSize = "2.4rem"; 
        } else {
            baseScore = 50;
            okText = isFever ? 'FEVER GOOD!' : 'GOOD!';
            okColor = isFever ? '#e67e22' : '#3498db'; 
        }

        const bpmMultiplier = currentBpm / 100;
        const feverMultiplier = isFever ? 3 : 1;
        const earnedScore = Math.floor((baseScore * bpmMultiplier * feverMultiplier) + (combo * 10 * bpmMultiplier));
        
        score += earnedScore;

        playSuccessSound(combo);
        triggerFlash(); 
        
        clapContainer.innerHTML = `<span class="sharp-text" style="color:${okColor}; font-size:${fontSize};">${okText}</span>`;
        
        if (isFever && !justEnteredFever) {
            currentBpm += 5;
            updateTempoVar();
        } else if (justEnteredFever) {
            updateTempoVar(); 
        }

        updateUI();
        nextQuestion();

        if (justEnteredFever) {
            clearTimeout(beatTimerId);
            beatCount = 0;
            expectedTime = performance.now();
            runBeat(true); 
            return;
        }

    } else {
        clapContainer.innerHTML = '<span class="sharp-text" style="color:#e74c3c; font-size:3rem;">✖</span>';
        handleMiss("MISS!"); 
    }
}

function handleMiss(reason) {
    if (isRecovering) return;
    
    // EXTREME延長戦時の即死判定
    if (timeLeft <= 0) {
        playTone(150, 'sawtooth', 0.4);
        playTone(110, 'sawtooth', 0.4);
        endGame("FINISHED!"); 
        return;
    }

    isRecovering = true;
    
    combo = 0; 
    resetFever(); 
    
    ui.classList.add('shake');
    setTimeout(() => { ui.classList.remove('shake'); }, 400);
    
    playTone(150, 'sawtooth', 0.4);
    playTone(110, 'sawtooth', 0.4);

    lives--;
    updateUI();

    if (lives <= 0) {
        endGame("GAME OVER");
        return;
    }

    clearTimeout(beatTimerId);
    clapContainer.innerHTML = `<span class="sharp-text" style="color:#e74c3c; font-size:2rem;">${reason}</span>`;
    colorCard.innerText = 'WAIT...';
    colorCard.style.backgroundColor = '#95a5a6';
    colorCard.style.color = '#fff';
    colorCard.style.transform = "scale(0.9)";
    resetPhaseBar();

    recoveryTimerId = setTimeout(() => {
        if (!isPlaying) return;
        isRecovering = false;
        beatCount = 0; 
        expectedTime = performance.now(); 
        nextQuestion();
        runBeat();
    }, 1500);
}

function endGame(msg) {
    isPlaying = false;
    
    clearTimeout(beatTimerId);
    clearInterval(timerIntervalId);
    clearTimeout(recoveryTimerId);
    
    phaseBar.style.transition = 'none';
    resetFever();
    ui.classList.remove('shake');
    
    let rank = 'D';
    let rankColor = '#95a5a6'; 
    
    if (score >= 30000) {
        rank = 'SSS';
        rankColor = '#ff9ff3'; 
    } else if (score >= 20000) {
        rank = 'SS';
        rankColor = '#f368e0'; 
    } else if (score >= 8000) {
        rank = 'S';
        rankColor = '#f1c40f'; 
    } else if (score >= 5500) {
        rank = 'A';
        rankColor = '#e74c3c'; 
    } else if (score >= 3500) {
        rank = 'B';
        rankColor = '#3498db'; 
    } else if (score >= 1500) {
        rank = 'C';
        rankColor = '#2ecc71'; 
    }
    
    document.getElementById('result-title').innerText = msg;
    document.getElementById('result-score').innerText = score;
    document.getElementById('result-combo').innerText = maxCombo;
    
    const rankEl = document.getElementById('result-rank');
    rankEl.innerText = rank;
    rankEl.style.color = rankColor;
    
    document.getElementById('result-modal').classList.remove('hidden');
}

// ★追加：X（旧Twitter）へのシェア機能
function shareOnX() {
    let diffName = "EASY";
    if (baseBpm === 120) diffName = "NORMAL";
    if (baseBpm === 200) diffName = "EXTREME";
    
    const rank = document.getElementById('result-rank').innerText;
    
    // シェアするテキストの組み立て
    const text = `COLOR CODE PANIC で遊んだよ！\n[${diffName}] SCORE: ${score} / MAX COMBO: ${maxCombo}\nRANK: ${rank}\n#COLORCODEPANIC\nhttps://meqcscnavnt.github.io/colorcode_test/`;
    
    // URLエンコードしてTwitterのIntent URLを開く
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
}
