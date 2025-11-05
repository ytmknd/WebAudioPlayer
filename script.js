// DOM要素の取得
const audioFileInput = document.getElementById('audio-file');
const audioPlayer = document.getElementById('audio-player');
const fileNameDisplay = document.getElementById('file-name');
const dropZone = document.getElementById('drop-zone');
const playBtn = document.getElementById('play-btn');
const pauseBtn = document.getElementById('pause-btn');
const stopBtn = document.getElementById('stop-btn');
const repeatBtn = document.getElementById('repeat-btn');
const currentTimeDisplay = document.getElementById('current-time');
const durationDisplay = document.getElementById('duration');
const waveformCanvas = document.getElementById('waveform-canvas');
const waveformContainer = document.querySelector('.waveform-container');
const playhead = document.getElementById('playhead');
const startMarker = document.getElementById('start-marker');
const endMarker = document.getElementById('end-marker');
const volumeSlider = document.getElementById('volume');
const volumeValue = document.getElementById('volume-value');

// Canvas設定
const canvasCtx = waveformCanvas.getContext('2d');
let audioBuffer = null;
let audioContext = null;

// Web Audio API用
let sourceNode = null;
let gainNode = null;
let isAudioContextSetup = false;

// 状態管理
let isRepeat = false;
let startTime = 0;
let endTime = 0;
let isPlaying = false;

// マーカードラッグ用の状態
let isDraggingMarker = false;
let currentDraggingMarker = null;

// Web Audio APIのセットアップ
function setupAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    if (!isAudioContextSetup) {
        // MediaElementSourceを作成（一度だけ）
        sourceNode = audioContext.createMediaElementSource(audioPlayer);
        
        // GainNodeを作成
        gainNode = audioContext.createGain();
        gainNode.gain.value = 1.0; // デフォルト100%
        
        // 接続: source -> gain -> destination
        sourceNode.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        isAudioContextSetup = true;
    }
}

// 時間を "分:秒" 形式にフォーマット
function formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// 波形を描画する関数
function drawWaveform() {
    if (!audioBuffer) return;
    
    // Canvas サイズを設定
    const dpr = window.devicePixelRatio || 1;
    const rect = waveformCanvas.getBoundingClientRect();
    waveformCanvas.width = rect.width * dpr;
    waveformCanvas.height = rect.height * dpr;
    canvasCtx.scale(dpr, dpr);
    
    const width = rect.width;
    const height = rect.height;
    const data = audioBuffer.getChannelData(0); // モノラルまたは左チャンネル
    const step = Math.ceil(data.length / width);
    const amp = height / 2;
    
    // 背景をクリア
    canvasCtx.fillStyle = '#1a1a2e';
    canvasCtx.fillRect(0, 0, width, height);
    
    // 中央線
    canvasCtx.strokeStyle = '#2a2a4e';
    canvasCtx.lineWidth = 1;
    canvasCtx.beginPath();
    canvasCtx.moveTo(0, height / 2);
    canvasCtx.lineTo(width, height / 2);
    canvasCtx.stroke();
    
    // 波形を描画
    canvasCtx.strokeStyle = '#667eea';
    canvasCtx.lineWidth = 1.5;
    canvasCtx.beginPath();
    
    for (let i = 0; i < width; i++) {
        let min = 1.0;
        let max = -1.0;
        
        for (let j = 0; j < step; j++) {
            const datum = data[(i * step) + j];
            if (datum < min) min = datum;
            if (datum > max) max = datum;
        }
        
        const yMin = (1 + min) * amp;
        const yMax = (1 + max) * amp;
        
        if (i === 0) {
            canvasCtx.moveTo(i, yMin);
        }
        
        canvasCtx.lineTo(i, yMin);
        canvasCtx.lineTo(i, yMax);
    }
    
    canvasCtx.stroke();
    
    // 範囲指定の表示
    if (startTime > 0 || endTime < audioBuffer.duration) {
        const startX = (startTime / audioBuffer.duration) * width;
        const endX = (endTime / audioBuffer.duration) * width;
        
        // 範囲外をグレーアウト
        canvasCtx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        if (startTime > 0) {
            canvasCtx.fillRect(0, 0, startX, height);
        }
        if (endTime < audioBuffer.duration) {
            canvasCtx.fillRect(endX, 0, width - endX, height);
        }
    }
}

// マーカーの位置を更新する関数
function updateMarkerPositions() {
    if (!audioBuffer) return;
    
    const startPercent = (startTime / audioBuffer.duration) * 100;
    const endPercent = (endTime / audioBuffer.duration) * 100;
    
    startMarker.style.left = `${startPercent}%`;
    endMarker.style.left = `${endPercent}%`;
}

// ファイル選択時の処理
audioFileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
        await loadAudioFile(file);
    }
});

// ファイル読み込み処理を関数化
async function loadAudioFile(file) {
    // ファイルタイプチェック
    if (!file.type.match('audio/(mpeg|wav|mp3)') && !file.name.match(/\.(mp3|wav)$/i)) {
        alert('MP3またはWAVファイルを選択してください。');
        return;
    }
    
    const url = URL.createObjectURL(file);
    audioPlayer.src = url;
    fileNameDisplay.textContent = file.name;
    
    // 再生開始位置をリセット
    startTime = 0;
    
    // 再生状態をリセット
    isPlaying = false;
    pauseBtn.disabled = true;
    
    // Web Audio APIをセットアップ
    setupAudioContext();
    
    // ボタンを有効化
    playBtn.disabled = false;
    stopBtn.disabled = false;
    repeatBtn.disabled = false;
    
    // 音声ファイルのメタデータ読み込み完了時
    audioPlayer.addEventListener('loadedmetadata', () => {
        // 再生終了位置をファイル末尾にリセット
        endTime = audioPlayer.duration;
        durationDisplay.textContent = formatTime(endTime);
        
        // マーカー位置を更新
        if (audioBuffer) {
            updateMarkerPositions();
        }
    });
    
    // 波形データを読み込み
    try {
        const arrayBuffer = await file.arrayBuffer();
        audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        // メタデータが既に読み込まれている場合は終了位置を設定
        if (audioPlayer.duration) {
            endTime = audioPlayer.duration;
        }
        
        drawWaveform();
        updateMarkerPositions();
    } catch (error) {
        console.error('波形の読み込みに失敗しました:', error);
    }
}

// ドラッグアンドドロップイベント
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('drag-over');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        await loadAudioFile(files[0]);
    }
});

// 再生ボタン
playBtn.addEventListener('click', () => {
    if (audioPlayer.src) {
        // AudioContextを再開（ブラウザのポリシー対応）
        if (audioContext && audioContext.state === 'suspended') {
            audioContext.resume();
        }
        
        // 開始位置が設定されていて、現在位置が範囲外の場合は開始位置に移動
        if (audioPlayer.currentTime < startTime || audioPlayer.currentTime >= endTime) {
            audioPlayer.currentTime = startTime;
        }
        audioPlayer.play();
        isPlaying = true;
        pauseBtn.disabled = false;
    }
});

// 一時停止ボタン
pauseBtn.addEventListener('click', () => {
    audioPlayer.pause();
    isPlaying = false;
});

// 停止ボタン
stopBtn.addEventListener('click', () => {
    audioPlayer.pause();
    audioPlayer.currentTime = startTime;
    isPlaying = false;
    pauseBtn.disabled = true;
});

// リピートボタン
repeatBtn.addEventListener('click', () => {
    isRepeat = !isRepeat;
    repeatBtn.classList.toggle('active');
    repeatBtn.textContent = isRepeat ? '🔁 リピート: ON' : '🔁 リピート: OFF';
});

// 時間更新時の処理
audioPlayer.addEventListener('timeupdate', () => {
    // 現在時刻の表示更新
    currentTimeDisplay.textContent = formatTime(audioPlayer.currentTime);
    
    // プレイヘッドの更新
    if (audioPlayer.duration) {
        const progress = (audioPlayer.currentTime / audioPlayer.duration) * 100;
        playhead.style.left = `${progress}%`;
    }
    
    // 終了位置に達したら処理
    if (audioPlayer.currentTime >= endTime) {
        if (isRepeat) {
            audioPlayer.currentTime = startTime;
            audioPlayer.play();
        } else {
            audioPlayer.pause();
            audioPlayer.currentTime = startTime;
            isPlaying = false;
            pauseBtn.disabled = true;
        }
    }
});

// 再生終了時の処理
audioPlayer.addEventListener('ended', () => {
    if (isRepeat) {
        audioPlayer.currentTime = startTime;
        audioPlayer.play();
    } else {
        audioPlayer.currentTime = startTime;
        isPlaying = false;
        pauseBtn.disabled = true;
    }
});

// マーカーのドラッグイベント
startMarker.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    isDraggingMarker = true;
    currentDraggingMarker = 'start';
    startMarker.classList.add('dragging');
    waveformContainer.classList.add('dragging-marker');
});

endMarker.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    isDraggingMarker = true;
    currentDraggingMarker = 'end';
    endMarker.classList.add('dragging');
    waveformContainer.classList.add('dragging-marker');
});

document.addEventListener('mousemove', (e) => {
    if (isDraggingMarker && audioBuffer) {
        const rect = waveformContainer.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const width = rect.width;
        
        // 範囲を0〜widthに制限
        const clampedX = Math.max(0, Math.min(x, width));
        const percentage = clampedX / width;
        const newTime = percentage * audioBuffer.duration;
        
        if (currentDraggingMarker === 'start') {
            // 開始位置は終了位置より前でなければならない
            if (newTime < endTime - 0.1) { // 最小0.1秒の範囲を確保
                startTime = newTime;
                updateMarkerPositions();
                drawWaveform();
            }
        } else if (currentDraggingMarker === 'end') {
            // 終了位置は開始位置より後でなければならない
            if (newTime > startTime + 0.1) { // 最小0.1秒の範囲を確保
                endTime = newTime;
                updateMarkerPositions();
                drawWaveform();
            }
        }
    }
});

document.addEventListener('mouseup', () => {
    if (isDraggingMarker) {
        isDraggingMarker = false;
        currentDraggingMarker = null;
        startMarker.classList.remove('dragging');
        endMarker.classList.remove('dragging');
        waveformContainer.classList.remove('dragging-marker');
        
        // 現在の再生位置が範囲外の場合は開始位置に移動
        if (audioPlayer.currentTime < startTime || audioPlayer.currentTime >= endTime) {
            audioPlayer.currentTime = startTime;
        }
    }
});

// 波形クリックでシーク
waveformContainer.addEventListener('click', (e) => {
    if (audioPlayer.duration && !isDraggingMarker) {
        const rect = waveformContainer.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const width = rect.width;
        const percentage = clickX / width;
        const newTime = percentage * audioPlayer.duration;
        
        // 範囲内にシークする場合のみ許可
        if (newTime >= startTime && newTime <= endTime) {
            audioPlayer.currentTime = newTime;
        } else {
            alert('指定された範囲内でシークしてください。');
        }
    }
});

// ウィンドウリサイズ時に波形を再描画
window.addEventListener('resize', () => {
    if (audioBuffer) {
        drawWaveform();
    }
});

// 音量調整
volumeSlider.addEventListener('input', (e) => {
    const volume = e.target.value;
    const gainValue = volume / 100; // 0.0 - 2.0
    
    // Web Audio APIのGainNodeで音量を設定
    if (gainNode) {
        gainNode.gain.value = gainValue;
    }
    
    volumeValue.textContent = `${volume}%`;
    
    // 100%を超える場合は視覚的なフィードバック
    if (volume > 100) {
        volumeValue.style.color = '#ff6600';
        volumeValue.style.fontWeight = 'bold';
    } else {
        volumeValue.style.color = '#333';
        volumeValue.style.fontWeight = 'bold';
    }
});

// キーボードショートカット
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && audioPlayer.src) {
        e.preventDefault();
        if (isPlaying) {
            pauseBtn.click();
        } else {
            playBtn.click();
        }
    }
});
