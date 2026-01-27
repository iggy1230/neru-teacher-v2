// --- js/main.js ---
// アプリケーションのメインコントローラー
// UI操作、モード切替、イベントハンドリング、ビジネスロジック（宿題分析など）を担当

// ==========================================
// 1. UI更新・演出関連
// ==========================================

/**
 * ネル先生のメッセージ更新 & 音声再生
 */
window.updateNellMessage = async function(text, mood = "normal", saveToMemory = false, speak = true) {
    // WebSocketがつながっている間、チャットモード以外では喋らせない制御
    if (window.liveSocket && window.liveSocket.readyState === WebSocket.OPEN && window.currentMode !== 'chat') {
        speak = false;
    }

    const gameScreen = document.getElementById('screen-game');
    const isGameHidden = gameScreen ? gameScreen.classList.contains('hidden') : true;
    const targetId = isGameHidden ? 'nell-text' : 'nell-text-game';
    const el = document.getElementById(targetId);
    
    // 表示用テキストの整形
    let displayText = text.replace(/(?:\[|\【)?DISPLAY[:：]\s*(.+?)(?:\]|\】)?/gi, "");
    
    if (el) el.innerText = displayText;
    
    // 効果音 (キーワード反応)
    if (text && text.includes("もぐもぐ")) { 
        window.safePlay(window.sfxBori); 
    }
    
    // 記憶への保存
    if (saveToMemory && window.saveToNellMemory) { 
        window.saveToNellMemory('nell', text); 
    }
    
    // TTS再生 (voice-service.js)
    if (speak && typeof window.speakNell === 'function') {
        let textForSpeech = displayText.replace(/【.*?】/g, "").trim();
        textForSpeech = textForSpeech.replace(/🐾/g, "");
        if (textForSpeech.length > 0) {
            await window.speakNell(textForSpeech, mood);
        }
    }

    // 画像の変更 (口パクアニメーション用)
    const img = document.getElementById('nell-face') || document.querySelector('.nell-avatar-wrap img');
    if (img && window.subjectImages) {
        // 現在の科目に合わせた画像設定（口パクアニメーション関数がこれを参照する）
    }
};

/**
 * 口パクアニメーション
 */
window.startMouthAnimation = function() {
    let toggle = false;
    setInterval(() => {
        const img = document.getElementById('nell-face') || document.querySelector('.nell-avatar-wrap img');
        if (!img) return;
        
        let baseImg = window.defaultIcon;
        let talkImg = window.talkIcon;

        // 科目別画像の適用
        if (window.currentSubject && window.subjectImages[window.currentSubject] && 
           (window.currentMode === 'explain' || window.currentMode === 'grade' || window.currentMode === 'review')) {
            baseImg = window.subjectImages[window.currentSubject].base;
            talkImg = window.subjectImages[window.currentSubject].talk;
        }

        if (window.isNellSpeaking) img.src = toggle ? talkImg : baseImg;
        else img.src = baseImg;
        
        toggle = !toggle;
    }, 150);
};

/**
 * ログ管理 (チャット画面用)
 */
window.addLogItem = function(role, text) {
    const container = document.getElementById('log-content');
    if (!container) return;
    const div = document.createElement('div');
    div.className = `log-item log-${role}`;
    const name = role === 'user' ? (window.currentUser ? window.currentUser.name : 'あなた') : 'ネル先生';
    div.innerHTML = `<span class="log-role">${name}:</span><span>${text}</span>`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
};

// ==========================================
// 2. モード選択ロジック (State Machine)
// ==========================================

window.selectMode = function(m) {
    try {
        console.log(`[UI] selectMode called: ${m}`);
        window.currentMode = m; 
        
        // 履歴をリセット
        window.chatSessionHistory = [];

        // 画面切り替え
        if (typeof window.switchScreen === 'function') {
            window.switchScreen('screen-main'); 
        } else {
            document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
            document.getElementById('screen-main').classList.remove('hidden');
        }

        // 各種ビューの表示リセット
        const ids = ['subject-selection-view', 'upload-controls', 'thinking-view', 'problem-selection-view', 'final-view', 'chalkboard', 'chat-view', 'simple-chat-view', 'chat-free-view', 'lunch-view', 'grade-sheet-container', 'hint-detail-container', 'embedded-chat-section'];
        ids.forEach(id => { 
            const el = document.getElementById(id); 
            if (el) el.classList.add('hidden'); 
        });
        
        // ログエリアリセット
        document.getElementById('conversation-log').classList.add('hidden');
        document.getElementById('log-content').innerHTML = "";
        
        // 黒板・入力欄リセット
        ['embedded-chalkboard', 'chalkboard-simple', 'chalkboard-free'].forEach(bid => {
            const el = document.getElementById(bid);
            if(el) { el.innerText = ""; el.classList.add('hidden'); }
        });
        ['embedded-text-input', 'simple-text-input', 'free-text-input'].forEach(iid => {
            const el = document.getElementById(iid);
            if(el) el.value = "";
        });

        // 戻るボタン設定
        const backBtn = document.getElementById('main-back-btn');
        if (backBtn) { backBtn.classList.remove('hidden'); backBtn.onclick = window.backToLobby; }
        
        // 既存のバックグラウンド処理を停止
        if(window.stopAlwaysOnListening) window.stopAlwaysOnListening();
        if(window.stopLiveChat) window.stopLiveChat();
        if(window.stopPreviewCamera) window.stopPreviewCamera();
        
        window.gameRunning = false;
        
        // アイコンリセット
        const icon = document.querySelector('.nell-avatar-wrap img'); 
        if(icon) icon.src = window.defaultIcon || "assets/images/characters/nell-normal.png";
        
        // カリカリ表示
        const miniKarikari = document.getElementById('mini-karikari-display');
        if(miniKarikari) miniKarikari.classList.remove('hidden');
        if(typeof window.updateMiniKarikari === 'function') window.updateMiniKarikari();
        
        // --- モード別処理 ---
        if (m === 'chat') { 
            // お宝図鑑モード
            document.getElementById('chat-view').classList.remove('hidden'); 
            window.updateNellMessage("お宝を見せてにゃ！お話もできるにゃ！", "excited", false); 
            document.getElementById('conversation-log').classList.remove('hidden');
            if(window.startAlwaysOnListening) window.startAlwaysOnListening();
        } 
        else if (m === 'simple-chat') {
            // 個別指導 (HTTP)
            document.getElementById('simple-chat-view').classList.remove('hidden');
            window.updateNellMessage("今日はお話だけするにゃ？", "gentle", false);
            document.getElementById('conversation-log').classList.remove('hidden');
            if(window.startAlwaysOnListening) window.startAlwaysOnListening();
        }
        else if (m === 'chat-free') {
            // 放課後おしゃべり (WebSocket)
            document.getElementById('chat-free-view').classList.remove('hidden');
            window.updateNellMessage("何でも話していいにゃ！", "happy", false);
        }
        else if (m === 'lunch') { 
            document.getElementById('lunch-view').classList.remove('hidden'); 
            window.updateNellMessage("お腹ペコペコだにゃ……", "thinking", false); 
        } 
        else if (m === 'review') { 
            window.renderMistakeSelection(); 
            document.getElementById('embedded-chat-section').classList.remove('hidden'); 
            document.getElementById('conversation-log').classList.remove('hidden');
            if(window.startAlwaysOnListening) window.startAlwaysOnListening();
        } 
        else { 
            // explain, grade
            const subjectView = document.getElementById('subject-selection-view'); 
            if (subjectView) subjectView.classList.remove('hidden'); 
            window.updateNellMessage("どの教科にするのかにゃ？", "normal", false); 
            if (m === 'explain' || m === 'grade') {
                document.getElementById('embedded-chat-section').classList.remove('hidden');
                document.getElementById('conversation-log').classList.remove('hidden');
                if(window.startAlwaysOnListening) window.startAlwaysOnListening();
            }
        }
    } catch (e) {
        console.error("[UI] selectMode Error:", e);
        alert("エラーが発生したにゃ。再読み込みしてにゃ。");
    }
};

window.setSubject = function(s) { 
    window.currentSubject = s; 
    const icon = document.querySelector('.nell-avatar-wrap img'); 
    if(icon && window.subjectImages && window.subjectImages[s]){
        icon.src = window.subjectImages[s].base; 
        icon.onerror = () => { icon.src = window.defaultIcon; };
    } 
    document.getElementById('subject-selection-view').classList.add('hidden'); 
    document.getElementById('upload-controls').classList.remove('hidden'); 
    window.updateNellMessage(`${window.currentSubject}の問題をみせてにゃ！`, "happy", false); 
    
    // モードボタンの調整
    const btnFast = document.getElementById('mode-btn-fast');
    const btnPrec = document.getElementById('mode-btn-precision');
    if (btnFast) { 
        btnFast.innerText = "📷 ネル先生に宿題を見せる"; 
        btnFast.className = "main-btn"; 
        btnFast.style.background = "#ff85a1"; 
        btnFast.style.width = "100%"; 
        btnFast.onclick = null; 
    }
    if (btnPrec) btnPrec.style.display = "none";
};

window.setAnalyzeMode = function(type) { window.analysisType = 'precision'; };

// ==========================================
// 3. 宿題分析・結果表示ロジック
// ==========================================

// 分析開始
window.startAnalysis = async function(b64) {
    if (window.isAnalyzing) return;
    window.isAnalyzing = true; 
    
    document.getElementById('cropper-modal').classList.add('hidden'); 
    document.getElementById('thinking-view').classList.remove('hidden'); 
    document.getElementById('upload-controls').classList.add('hidden'); 
    const backBtn = document.getElementById('main-back-btn'); 
    if(backBtn) backBtn.classList.add('hidden');
    
    try { 
        if(window.safePlay) {
            window.safePlay(window.sfxHirameku); 
            window.sfxBunseki.currentTime = 0; 
            window.sfxBunseki.loop = true;
            window.safePlay(window.sfxBunseki);
        }
    } catch(e){}
    
    let p = 0; 
    const timer = setInterval(() => { 
        if (!window.isAnalyzing) { clearInterval(timer); return; } 
        if (p < 30) p += 1; else if (p < 80) p += 0.4; else if (p < 95) p += 0.1; 
        window.updateProgress(p); 
    }, 300);

    // 思考中メッセージループ
    const performAnalysisNarration = async () => {
        const msgs = [ 
            { text: "じーっと見て、問題を書き写してるにゃ…", mood: "thinking" }, 
            { text: "ふむふむ…この問題、なかなか手強いにゃ…", mood: "thinking" }, 
            { text: "しっぽの先まで集中して考え中だにゃ…", mood: "thinking" }, 
            { text: "ネル先生のピピピッ！と光るヒゲが、正解をバッチリ受信してるにゃ！", mood: "thinking" } 
        ];
        for (const item of msgs) { 
            if (!window.isAnalyzing) return; 
            await window.updateNellMessage(item.text, item.mood, false); 
            if (!window.isAnalyzing) return; 
            await new Promise(r => setTimeout(r, 1500)); 
        }
    };
    performAnalysisNarration();

    try {
        const res = await fetch('/analyze', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ 
                image: b64, 
                mode: window.currentMode, 
                grade: window.currentUser.grade, 
                subject: window.currentSubject, 
                name: window.currentUser.name 
            }) 
        });
        
        if (!res.ok) throw new Error("Server Error"); 
        const data = await res.json();
        if (!data || !Array.isArray(data) || data.length === 0) throw new Error("データが空か、正しい形式ではありませんでした。");
        
        // データ加工
        window.transcribedProblems = data.map((prob, index) => {
            let studentArr = Array.isArray(prob.student_answer) ? prob.student_answer : (prob.student_answer ? [prob.student_answer] : []);
            let correctArr = Array.isArray(prob.correct_answer) ? prob.correct_answer : (prob.correct_answer ? [prob.correct_answer] : []);
            return { 
                ...prob, 
                id: index + 1, 
                student_answer: studentArr, 
                correct_answer: correctArr, 
                status: (studentArr.length > 0 && studentArr[0] !== "") ? "answered" : "unanswered", 
                currentHintLevel: 1, 
                maxUnlockedHintLevel: 0 
            };
        });

        window.isAnalyzing = false; 
        clearInterval(timer); 
        window.updateProgress(100); 
        cleanupAnalysis();
        
        if(window.safePlay) window.safePlay(window.sfxHirameku);
        
        setTimeout(() => { 
            document.getElementById('thinking-view').classList.add('hidden'); 
            const doneMsg = "読めたにゃ！"; 
            if (window.currentMode === 'grade') { 
                window.showGradingView(true); 
                window.updateNellMessage(doneMsg, "happy", false)
                    .then(() => setTimeout(window.updateGradingMessage, 1500)); 
            } else { 
                window.renderProblemSelection(); 
                window.updateNellMessage(doneMsg, "happy", false); 
            } 
        }, 1500); 

    } catch (err) { 
        console.error("Analysis Error:", err); 
        window.isAnalyzing = false; 
        cleanupAnalysis(); 
        clearInterval(timer); 
        document.getElementById('thinking-view').classList.add('hidden'); 
        document.getElementById('upload-controls').classList.remove('hidden'); 
        if(backBtn) backBtn.classList.remove('hidden'); 
        window.updateNellMessage("うまく読めなかったにゃ…もう一度お願いにゃ！", "thinking", false); 
    }
};

function cleanupAnalysis() { 
    window.isAnalyzing = false; 
    if(window.sfxBunseki) window.sfxBunseki.pause(); 
    if(window.analysisTimers) { 
        window.analysisTimers.forEach(t => clearTimeout(t)); 
        window.analysisTimers = []; 
    } 
}

// ==========================================
// 4. ゲーム機能連携
// ==========================================
window.showGame = function() { 
    window.switchScreen('screen-game'); 
    document.getElementById('mini-karikari-display').classList.remove('hidden'); 
    if(window.updateMiniKarikari) window.updateMiniKarikari();
    
    // game-engine.js の関数を呼び出し
    if (window.initGame) window.initGame(); 
    
    // スタートボタンの設定
    const startBtn = document.getElementById('start-game-btn'); 
    if (startBtn) { 
        const newBtn = startBtn.cloneNode(true); 
        startBtn.parentNode.replaceChild(newBtn, startBtn); 
        newBtn.onclick = () => { 
            if (window.startGameLogic) window.startGameLogic(); 
        }; 
    } 
};

// ==========================================
// 5. 復習・給食・その他機能
// ==========================================

window.renderMistakeSelection = function() { 
    if (!window.currentUser.mistakes || window.currentUser.mistakes.length === 0) { 
        window.updateNellMessage("ノートは空っぽにゃ！", "happy", false); 
        setTimeout(window.backToLobby, 2000); 
        return; 
    } 
    window.transcribedProblems = window.currentUser.mistakes; 
    window.renderProblemSelection(); 
    window.updateNellMessage("復習するにゃ？", "excited", false); 
};

window.giveLunch = function() { 
    if (window.currentUser.karikari < 1) return window.updateNellMessage("カリカリがないにゃ……", "thinking", false); 
    window.updateNellMessage("もぐもぐ……", "normal", false); 
    window.currentUser.karikari--; 
    if(typeof window.saveAndSync === 'function') window.saveAndSync(); 
    if(typeof window.updateMiniKarikari === 'function') window.updateMiniKarikari();
    if(typeof window.showKarikariEffect === 'function') window.showKarikariEffect(-1); 
    window.lunchCount++; 
    
    fetch('/lunch-reaction', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ count: window.lunchCount, name: window.currentUser.name }) 
    })
    .then(r => r.json())
    .then(d => { 
        setTimeout(() => { 
            window.updateNellMessage(d.reply || "おいしいにゃ！", d.isSpecial ? "excited" : "happy", true); 
        }, 1500); 
    })
    .catch(e => { 
        setTimeout(() => { window.updateNellMessage("おいしいにゃ！", "happy", false); }, 1500); 
    }); 
};

// ==========================================
// 6. タイマー機能
// ==========================================

window.openTimerModal = function() {
    document.getElementById('timer-modal').classList.remove('hidden');
    window.updateTimerDisplay(); 
};
window.closeTimerModal = function() {
    document.getElementById('timer-modal').classList.add('hidden');
};
window.setTimer = function(minutes) {
    if (window.studyTimerRunning) return;
    window.studyTimerValue += minutes * 60;
    window.updateTimerDisplay();
};
window.resetTimer = function() {
    if (window.studyTimerRunning) {
        clearInterval(window.studyTimerInterval);
        window.studyTimerRunning = false;
        document.getElementById('timer-toggle-btn').innerText = "スタート！";
        document.getElementById('timer-toggle-btn').className = "main-btn pink-btn";
    }
    window.studyTimerValue = 0;
    window.studyTimerCheck = 0;
    window.updateTimerDisplay();
    document.getElementById('mini-timer-display').classList.add('hidden');
};
window.toggleTimer = function() {
    if (window.studyTimerRunning) {
        clearInterval(window.studyTimerInterval);
        window.studyTimerRunning = false;
        document.getElementById('timer-toggle-btn').innerText = "再開する";
        document.getElementById('timer-toggle-btn').className = "main-btn blue-btn";
    } else {
        if (window.studyTimerValue <= 0) return alert("時間をセットしてにゃ！");
        window.studyTimerRunning = true;
        window.studyTimerCheck = 0;
        document.getElementById('timer-toggle-btn').innerText = "一時停止";
        document.getElementById('timer-toggle-btn').className = "main-btn gray-btn";
        document.getElementById('mini-timer-display').classList.remove('hidden');
        window.closeTimerModal();
        
        window.updateNellMessage("今からネル先生が時間を計ってやるにゃ", "normal", false, true);
        
        window.studyTimerInterval = setInterval(() => {
            if (window.studyTimerValue > 0) {
                window.studyTimerValue--;
                window.studyTimerCheck++;
                window.updateTimerDisplay();
                
                if (window.studyTimerValue === 600) window.updateNellMessage("10分前だにゃ〜。お茶でも飲んで落ち着くにゃ。", "gentle", false, true);
                else if (window.studyTimerValue === 300) window.updateNellMessage("あと5分。一歩ずつ、一歩ずつだにゃ〜。", "normal", false, true);
                else if (window.studyTimerValue === 180) window.updateNellMessage("3分前。深呼吸して、もうひと踏ん張りだにゃ。", "excited", false, true);
                else if (window.studyTimerValue === 60) window.updateNellMessage("あと1分だにゃ。最後までネル先生が見守ってるにゃ。", "excited", false, true);
            } else {
                clearInterval(window.studyTimerInterval);
                window.studyTimerRunning = false;
                document.getElementById('timer-toggle-btn').innerText = "スタート！";
                document.getElementById('timer-toggle-btn').className = "main-btn pink-btn";
                if(window.safePlay && window.sfxChime) window.safePlay(window.sfxChime);
                window.updateNellMessage("時間だにゃ！お疲れ様だにゃ〜。さ、ゆっくり休むにゃ。", "happy", false, true);
                document.getElementById('mini-timer-display').classList.add('hidden');
                window.openTimerModal();
            }
        }, 1000);
    }
};
window.updateTimerDisplay = function() {
    const m = Math.floor(window.studyTimerValue / 60).toString().padStart(2, '0');
    const s = (window.studyTimerValue % 60).toString().padStart(2, '0');
    const timeStr = `${m}:${s}`;
    const modalDisplay = document.getElementById('modal-timer-display');
    if(modalDisplay) modalDisplay.innerText = timeStr;
    const miniDisplay = document.getElementById('mini-timer-text');
    if(miniDisplay) miniDisplay.innerText = timeStr;
};

// ==========================================
// 7. 問題表示・採点UIヘルパー (DOM生成)
// ==========================================

window.renderProblemSelection = function() { 
    document.getElementById('problem-selection-view').classList.remove('hidden'); 
    const l = document.getElementById('transcribed-problem-list'); l.innerHTML = ""; 
    window.transcribedProblems.forEach(p => { l.appendChild(createProblemItem(p, 'explain')); }); 
    const btn = document.querySelector('#problem-selection-view button.orange-btn'); 
    if (btn) { btn.disabled = false; btn.innerText = "✨ ぜんぶわかったにゃ！"; } 
};

window.showGradingView = function(silent = false) { 
    document.getElementById('problem-selection-view').classList.add('hidden'); 
    document.getElementById('final-view').classList.remove('hidden'); 
    document.getElementById('grade-sheet-container').classList.remove('hidden'); 
    document.getElementById('hint-detail-container').classList.add('hidden'); 
    const container = document.getElementById('problem-list-grade'); container.innerHTML = ""; 
    window.transcribedProblems.forEach(p => { container.appendChild(createProblemItem(p, 'grade')); }); 
    const btnDiv = document.createElement('div'); 
    btnDiv.style.textAlign = "center"; 
    btnDiv.style.marginTop = "20px"; 
    btnDiv.innerHTML = `<button onclick="window.finishGrading(this)" class="main-btn orange-btn">💯 採点おわり！</button>`; 
    container.appendChild(btnDiv); 
    if (!silent) { window.updateGradingMessage(); } 
};

function createProblemItem(p, mode) {
    const isGradeMode = (mode === 'grade'); 
    let markHtml = "", bgStyle = "background:white;";
    
    let correctList = Array.isArray(p.correct_answer) ? p.correct_answer : [String(p.correct_answer)];
    correctList = correctList.map(s => String(s).trim()).filter(s => s !== ""); 
    let studentList = Array.isArray(p.student_answer) ? p.student_answer : [String(p.student_answer)];
    
    if (isGradeMode) {
        let isCorrect = p.is_correct;
        if (isCorrect === undefined) { 
            if (correctList.length !== studentList.length) isCorrect = false; 
            else { 
                isCorrect = true; 
                for(let i=0; i<correctList.length; i++) { 
                    if (!isMatch(studentList[i] || "", correctList[i])) { isCorrect = false; break; } 
                } 
            } 
        }
        const mark = isCorrect ? "⭕" : "❌"; 
        const markColor = isCorrect ? "#ff5252" : "#4a90e2"; 
        bgStyle = isCorrect ? "background:#fff5f5;" : "background:#f0f8ff;";
        markHtml = `<div id="mark-${p.id}" style="font-weight:900; color:${markColor}; font-size:2rem; width:50px; text-align:center; flex-shrink:0;">${mark}</div>`;
    } else { 
        markHtml = `<div id="mark-${p.id}" style="font-weight:900; color:#4a90e2; font-size:2rem; width:50px; text-align:center; flex-shrink:0;"></div>`; 
    }
    
    let inputHtml = "";
    if (correctList.length > 1) {
        inputHtml = `<div style="display:grid; grid-template-columns: 1fr 1fr; gap:5px; width:100%;">`;
        for (let i = 0; i < correctList.length; i++) { 
            let val = studentList[i] || ""; 
            const onInput = isGradeMode ? `oninput="window.checkMultiAnswer(${p.id}, event)"` : ""; 
            inputHtml += `<input type="text" value="${val}" class="multi-input-${p.id}" ${onInput} style="width:100%; padding:8px; border:2px solid #ddd; border-radius:8px; font-size:1rem; font-weight:bold; color:#333; min-width:0; box-sizing:border-box;">`; 
        }
        inputHtml += `</div>`;
    } else {
        const val = studentList[0] || ""; 
        const onInput = isGradeMode ? `oninput="window.checkAnswerDynamically(${p.id}, this, event)"` : ""; 
        const idAttr = isGradeMode ? "" : `id="single-input-${p.id}"`;
        inputHtml = `<div style="width:100%;"><input type="text" ${idAttr} value="${val}" ${onInput} style="width:100%; padding:8px; border:2px solid #ddd; border-radius:8px; font-size:1rem; font-weight:bold; color:#333; box-sizing:border-box;"></div>`;
    }
    
    let buttonsHtml = "";
    if (isGradeMode) { 
        buttonsHtml = `<div style="display:flex; flex-direction:column; gap:5px; width:80px; flex-shrink:0; justify-content:center; margin-left:auto;"><button class="mini-teach-btn" onclick="window.startHint(${p.id})" style="width:100%;">教えて</button></div>`; 
    } else { 
        buttonsHtml = `<div style="display:flex; flex-direction:column; gap:5px; width:80px; flex-shrink:0; margin-left:auto;"><button class="mini-teach-btn" onclick="window.checkOneProblem(${p.id})" style="background:#ff85a1; width:100%;">採点</button><button class="mini-teach-btn" onclick="window.startHint(${p.id})" style="width:100%;">教えて</button></div>`; 
    }
    
    const div = document.createElement('div'); 
    div.className = "grade-item"; 
    div.id = `grade-item-${p.id}`; 
    div.style.cssText = `border-bottom:1px solid #eee; padding:15px; margin-bottom:10px; border-radius:10px; ${bgStyle}`; 
    div.innerHTML = `<div style="display:flex; align-items:center; width:100%;">${markHtml}<div style="flex:1; margin-left:10px; display:flex; flex-direction:column; min-width:0;"><div style="font-size:0.9rem; color:#888; margin-bottom:4px;">${p.label || '問'}</div><div style="font-weight:bold; font-size:0.9rem; margin-bottom:8px; width:100%; word-break:break-all;">${p.question}</div><div style="display:flex; gap:10px; align-items:flex-start; width:100%; justify-content:space-between;"><div style="flex:1; min-width:0; margin-right:5px;">${inputHtml}<div style="font-size:0.7rem; color:#666; margin-top:4px;">キミの答え (直せるよ)</div></div>${buttonsHtml}</div></div></div>`; 
    return div;
}

// --- 採点ロジック補助 ---
function normalizeAnswer(str) { 
    if (!str) return ""; 
    return str.trim().replace(/[\u30a1-\u30f6]/g, m => String.fromCharCode(m.charCodeAt(0) - 0x60)); 
}
function isMatch(student, correctString) { 
    const s = normalizeAnswer(student); 
    const options = normalizeAnswer(correctString).split('|'); 
    return options.some(opt => opt === s); 
}

// --- イベントリスナー登録 (DOM構築後) ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("🚀 main.js Initializing...");
    window.startMouthAnimation();
    
    // 宿題アップロード用のIDに合わせたリスナー設定
    const camIn = document.getElementById('hw-input-camera'); 
    const albIn = document.getElementById('hw-input-album'); 
    if(camIn && window.handleFileUpload) camIn.addEventListener('change', (e) => { window.handleFileUpload(e.target.files[0]); e.target.value=''; });
    if(albIn && window.handleFileUpload) albIn.addEventListener('change', (e) => { window.handleFileUpload(e.target.files[0]); e.target.value=''; });
    
    const startCamBtn = document.getElementById('start-webcam-btn');
    if (startCamBtn && window.startHomeworkWebcam) startCamBtn.onclick = window.startHomeworkWebcam;
});
// ==========================================
// 8. 記憶・履歴管理 (復元)
// ==========================================
window.saveToNellMemory = async function(role, text) {
    if (!window.currentUser || !window.currentUser.id) return;
    const trimmed = text.trim();
    if (trimmed.length <= 1) return;
    
    window.chatTranscript += `${role === 'user' ? '生徒' : 'ネル'}: ${trimmed}\n`;
    const newItem = { role: role, text: trimmed, time: new Date().toISOString() };
    try {
        const memoryKey = `nell_raw_chat_log_${window.currentUser.id}`;
        let history = JSON.parse(localStorage.getItem(memoryKey) || '[]');
        if (history.length > 0 && history[history.length - 1].text === trimmed) return;
        history.push(newItem);
        if (history.length > 50) history.shift(); 
        localStorage.setItem(memoryKey, JSON.stringify(history));
    } catch(e) {}
};

window.addToSessionHistory = function(role, text) {
    if (!window.chatSessionHistory) window.chatSessionHistory = [];
    window.chatSessionHistory.push({ role: role, text: text });
    if (window.chatSessionHistory.length > 10) {
        window.chatSessionHistory.shift();
    }
};

// ==========================================
// 9. チャット・カメラ連携機能 (復元)
// ==========================================

// HTTPテキスト送信
window.sendHttpText = async function(context) {
    let inputId;
    if (context === 'embedded') inputId = 'embedded-text-input';
    else if (context === 'simple') inputId = 'simple-text-input';
    else return;

    const input = document.getElementById(inputId);
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    if (window.isAlwaysListening && window.stopAlwaysOnListening) {
        window.stopAlwaysOnListening();
    }
    
    window.addLogItem('user', text);
    window.addToSessionHistory('user', text);

    try {
        window.updateNellMessage("ん？どれどれ…", "thinking", false, true);
        
        const res = await fetch('/chat-dialogue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                text: text, 
                name: window.currentUser ? window.currentUser.name : "生徒",
                history: window.chatSessionHistory
            })
        });

        if(res.ok) {
            const data = await res.json();
            const speechText = data.speech || data.reply || "教えてあげるにゃ！";
            window.addLogItem('nell', speechText);
            window.addToSessionHistory('nell', speechText);
            await window.updateNellMessage(speechText, "happy", true, true);
            
            let boardId = (context === 'embedded') ? 'embedded-chalkboard' : 'chalkboard-simple';
            const embedBoard = document.getElementById(boardId);
            if (embedBoard && data.board && data.board.trim() !== "") {
                embedBoard.innerText = data.board;
                embedBoard.classList.remove('hidden');
            }
            input.value = ""; 
        }
    } catch(e) {
        console.error("Text Chat Error:", e);
        window.updateNellMessage("ごめん、ちょっとわからなかったにゃ。", "thinking", false, true);
    } finally {
        if (window.isAlwaysListening && window.startAlwaysOnListening) {
             window.startAlwaysOnListening();
        }
    }
};
window.sendEmbeddedText = function() { window.sendHttpText('embedded'); };
window.sendSimpleText = function() { window.sendHttpText('simple'); };

// HTTPカメラトグル
window.toggleHttpCamera = function(context) {
    let videoId, containerId, btnId;
    if (context === 'embedded') {
        videoId = 'live-chat-video-embedded'; containerId = 'live-chat-video-container-embedded'; btnId = 'live-camera-btn-embedded';
    } else if (context === 'simple') {
        videoId = 'live-chat-video-simple'; containerId = 'live-chat-video-container-simple'; btnId = 'live-camera-btn-simple';
    } else return;

    const btn = document.getElementById(btnId);
    
    if (window.previewStream && window.previewStream.active) {
        window.captureAndSendLiveImageHttp(context);
    } else {
        if(window.startPreviewCamera) {
            window.startPreviewCamera(videoId, containerId).then(() => {
                if (btn) {
                    btn.innerHTML = "<span>📸</span> 撮影して送信";
                    btn.style.backgroundColor = "#ff5252"; 
                }
            });
        }
    }
};
window.toggleEmbeddedCamera = function() { window.toggleHttpCamera('embedded'); };
window.toggleSimpleCamera = function() { window.toggleHttpCamera('simple'); };

// HTTP画像送信処理
window.captureAndSendLiveImageHttp = async function(context = 'embedded') {
    if (window.isLiveImageSending) return;
    
    if (window.isAlwaysListening && window.stopAlwaysOnListening) {
        window.stopAlwaysOnListening();
    }
    
    let videoId, btnId, activeColor;
    if (context === 'embedded') { videoId = 'live-chat-video-embedded'; btnId = 'live-camera-btn-embedded'; activeColor = '#66bb6a'; }
    else if (context === 'simple') { videoId = 'live-chat-video-simple'; btnId = 'live-camera-btn-simple'; activeColor = '#66bb6a'; }

    const video = document.getElementById(videoId);
    if (!video || !video.srcObject || !video.srcObject.active) return alert("カメラが動いてないにゃ...");
    
    window.isLiveImageSending = true;
    const btn = document.getElementById(btnId);
    if (btn) {
        btn.innerHTML = "<span>📡</span> 送信中にゃ...";
        btn.style.backgroundColor = "#ccc";
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const base64Data = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
    
    // フラッシュ効果
    const flash = document.createElement('div');
    flash.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:white; opacity:0.8; z-index:9999; pointer-events:none; transition:opacity 0.3s;";
    document.body.appendChild(flash);
    setTimeout(() => { flash.style.opacity = 0; setTimeout(() => flash.remove(), 300); }, 50);

    window.addLogItem('user', '（画像送信）');

    try {
        window.updateNellMessage("ん？どれどれ…", "thinking", false, true);

        const res = await fetch('/chat-dialogue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                image: base64Data,
                text: "この問題を教えてください。", 
                name: window.currentUser ? window.currentUser.name : "生徒",
                history: window.chatSessionHistory
            })
        });

        if (!res.ok) throw new Error("Server response not ok");
        const data = await res.json();
        
        const speechText = data.speech || data.reply || "教えてあげるにゃ！";
        window.addLogItem('nell', speechText);
        window.addToSessionHistory('nell', speechText);
        await window.updateNellMessage(speechText, "happy", true, true);
        
        let boardId = (context === 'embedded') ? 'embedded-chalkboard' : 'chalkboard-simple';
        const embedBoard = document.getElementById(boardId);
        if (embedBoard && data.board && data.board.trim() !== "") {
            embedBoard.innerText = data.board;
            embedBoard.classList.remove('hidden');
        }

    } catch(e) {
        console.error("HTTP Image Error:", e);
        window.updateNellMessage("よく見えなかったにゃ…もう一回お願いにゃ！", "thinking", false, true);
    } finally {
        window.isLiveImageSending = false;
        
        if(window.stopPreviewCamera) window.stopPreviewCamera(); 
        if (btn) {
            btn.innerHTML = "<span>📷</span> カメラで見せて質問";
            btn.style.backgroundColor = activeColor;
        }
        
        if (window.isAlwaysListening && window.startAlwaysOnListening) {
             window.startAlwaysOnListening();
        }
    }
};

// お宝図鑑カメラトグル
window.toggleTreasureCamera = function() {
    const videoId = 'live-chat-video';
    const containerId = 'live-chat-video-container';
    const btnId = 'live-camera-btn';
    const btn = document.getElementById(btnId);
    
    if (window.previewStream && window.previewStream.active) {
        window.captureAndIdentifyItem();
    } else {
        if(window.startPreviewCamera) {
            window.startPreviewCamera(videoId, containerId).then(() => {
                if (btn) {
                    btn.innerHTML = "<span>📸</span> 撮影する";
                    btn.style.backgroundColor = "#ff5252"; 
                }
            });
        }
    }
};

// お宝図鑑 撮影＆鑑定
window.captureAndIdentifyItem = async function() {
    if (window.isLiveImageSending) return;
    
    if (window.isAlwaysListening && window.stopAlwaysOnListening) {
        window.stopAlwaysOnListening();
    }

    const video = document.getElementById('live-chat-video');
    if (!video || !video.srcObject || !video.srcObject.active) {
        return alert("カメラが動いてないにゃ...。");
    }

    window.isLiveImageSending = true;
    const btn = document.getElementById('live-camera-btn');
    if (btn) {
        btn.innerHTML = "<span>📡</span> 解析中にゃ...";
        btn.style.backgroundColor = "#ccc";
        btn.disabled = true;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const base64Data = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
    
    // 図鑑用サムネイル生成 (camera-service.jsの関数)
    let treasureDataUrl = null;
    if(window.createTreasureImage) {
        treasureDataUrl = window.createTreasureImage(canvas);
    }

    const flash = document.createElement('div');
    flash.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:white; opacity:0.8; z-index:9999; pointer-events:none; transition:opacity 0.3s;";
    document.body.appendChild(flash);
    setTimeout(() => { flash.style.opacity = 0; setTimeout(() => flash.remove(), 300); }, 50);

    try {
        window.updateNellMessage("ん？どれどれ…", "thinking", false, true);

        const res = await fetch('/identify-item', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                image: base64Data,
                name: window.currentUser ? window.currentUser.name : "生徒"
            })
        });

        if (!res.ok) throw new Error("Server response not ok");
        const data = await res.json();
        
        if (data.speechText) {
            await window.updateNellMessage(data.speechText, "happy", true, true);
        } else if (data.text) {
            await window.updateNellMessage(data.text, "happy", true, true); 
        }

        if (data.itemName && window.NellMemory && treasureDataUrl) {
            console.log(`[Collection] Registering: ${data.itemName}`);
            const description = data.description || "（解説はないにゃ）";
            await window.NellMemory.addToCollection(window.currentUser.id, data.itemName, treasureDataUrl, description);
            
            const notif = document.createElement('div');
            notif.innerText = `📖 図鑑に「${data.itemName}」を登録したにゃ！`;
            notif.style.cssText = "position:fixed; top:20%; left:50%; transform:translateX(-50%); background:rgba(255,255,255,0.95); border:4px solid #00bcd4; color:#006064; padding:15px 25px; border-radius:30px; font-weight:900; z-index:10000; animation: popIn 0.5s ease; box-shadow:0 10px 25px rgba(0,0,0,0.3);";
            document.body.appendChild(notif);
            setTimeout(() => notif.remove(), 4000);
            if(window.safePlay && window.sfxHirameku) window.safePlay(window.sfxHirameku);
        }

    } catch (e) {
        console.error("Identify Error:", e);
        window.updateNellMessage("よく見えなかったにゃ…もう一回お願いにゃ！", "thinking", false, true);
    } finally {
        window.isLiveImageSending = false;
        
        if(window.stopPreviewCamera) window.stopPreviewCamera(); 
        if (btn) {
            btn.innerHTML = "<span>📷</span> お宝を見せる（図鑑登録）";
            btn.style.backgroundColor = "#ff85a1"; 
            btn.disabled = false;
        }
        
        if (window.isAlwaysListening && window.currentMode === 'chat' && window.startAlwaysOnListening) {
             window.startAlwaysOnListening();
        }
    }
};

// WebSocket用画像送信
window.captureAndSendLiveImage = function(context = 'main') {
    if (context === 'main') {
        if (window.currentMode === 'chat-free') context = 'free';
        else if (window.activeChatContext === 'embedded') context = 'embedded';
        else if (window.currentMode === 'simple-chat') context = 'simple';
    }
    
    if (context === 'embedded' || context === 'simple') {
        window.captureAndSendLiveImageHttp(context);
        return;
    }

    if (!window.liveSocket || window.liveSocket.readyState !== WebSocket.OPEN) {
        return alert("まずは「おはなしする」でネル先生とつながってにゃ！");
    }
    if (window.isLiveImageSending) return; 

    let videoId = 'live-chat-video-free';
    const video = document.getElementById(videoId);
    if (!video || !video.srcObject || !video.srcObject.active) return alert("カメラが動いてないにゃ...");

    // 音声停止ロジック (voice-service.js側で対応済み想定だが念のため)
    if(window.cancelNellSpeech) window.cancelNellSpeech();
    window.ignoreIncomingAudio = true; 
    window.isLiveImageSending = true;
    
    const btn = document.getElementById('live-camera-btn-free');
    if (btn) {
        btn.innerHTML = "<span>📡</span> 送信中にゃ...";
        btn.style.backgroundColor = "#ccc";
    }
    window.isMicMuted = true;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const notif = document.createElement('div');
    notif.innerText = `📝 問題を送ったにゃ！`;
    notif.style.cssText = "position:fixed; top:20%; left:50%; transform:translateX(-50%); background:rgba(255,255,255,0.95); border:4px solid #8bc34a; color:#558b2f; padding:10px 20px; border-radius:30px; font-weight:bold; z-index:10000; animation: popIn 0.5s ease; box-shadow:0 4px 10px rgba(0,0,0,0.2);";
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), 2000);
    
    const base64Data = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
    
    const flash = document.createElement('div');
    flash.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:white; opacity:0.8; z-index:9999; pointer-events:none; transition:opacity 0.3s;";
    document.body.appendChild(flash);
    setTimeout(() => { flash.style.opacity = 0; setTimeout(() => flash.remove(), 300); }, 50);

    const videoContainer = document.getElementById('live-chat-video-container-free');
    if (videoContainer) {
        const oldPreview = document.getElementById('snapshot-preview-overlay');
        if(oldPreview) oldPreview.remove();
        const previewImg = document.createElement('img');
        previewImg.id = 'snapshot-preview-overlay';
        previewImg.src = canvas.toDataURL('image/jpeg', 0.8);
        previewImg.style.cssText = "position:absolute; top:0; left:0; width:100%; height:100%; object-fit:cover; z-index:10; border:4px solid #ffeb3b; box-sizing:border-box; animation: fadeIn 0.2s;";
        videoContainer.style.position = "relative"; 
        videoContainer.appendChild(previewImg);
        setTimeout(() => { if(previewImg && previewImg.parentNode) previewImg.remove(); }, 3000);
    }

    window.updateNellMessage("ん？どれどれ…", "thinking", false, false);
    if (window.liveSocket && window.liveSocket.readyState === WebSocket.OPEN) {
        let promptText = "（ユーザーが勉強の問題や画像を見せました）この画像の内容を詳しく、子供にもわかるように丁寧に教えてください。図鑑登録は不要です。";
        window.liveSocket.send(JSON.stringify({ 
            clientContent: { 
                turns: [{ role: "user", parts: [ { text: promptText }, { inlineData: { mime_type: "image/jpeg", data: base64Data } } ] }],
                turnComplete: true 
            } 
        }));
    }

    setTimeout(() => {
        window.isLiveImageSending = false;
        window.isMicMuted = false;
        if (btn) {
             btn.innerHTML = "<span>📷</span> 写真を見せてお話";
             btn.style.backgroundColor = "#009688";
        }
    }, 3000);
    setTimeout(() => { window.ignoreIncomingAudio = false; }, 300);
};

// ==========================================
// 10. 採点・ヒント機能 (復元)
// ==========================================

window.checkMultiAnswer = function(id, event) {
    if (window.isComposing) return; 
    const problem = window.transcribedProblems.find(p => p.id === id);
    if (problem) { 
        const inputs = document.querySelectorAll(`.multi-input-${id}`); 
        const userValues = Array.from(inputs).map(input => input.value); 
        problem.student_answer = userValues; 
    }
    if(window.gradingTimer) clearTimeout(window.gradingTimer); 
    window.gradingTimer = setTimeout(() => { _performCheckMultiAnswer(id); }, 1000);
};

function _performCheckMultiAnswer(id) {
    const problem = window.transcribedProblems.find(p => p.id === id); if (!problem) return;
    const userValues = problem.student_answer; 
    const correctList = Array.isArray(problem.correct_answer) ? problem.correct_answer : [problem.correct_answer];
    let allCorrect = false;
    
    if (userValues.length === correctList.length) { 
        const usedIndices = new Set(); 
        let matchCount = 0; 
        for (const uVal of userValues) { 
            for (let i = 0; i < correctList.length; i++) { 
                if (!usedIndices.has(i)) { 
                    if (isMatch(uVal, correctList[i])) { usedIndices.add(i); matchCount++; break; } 
                } 
            } 
        } 
        allCorrect = (matchCount === correctList.length); 
    }
    
    problem.is_correct = allCorrect; 
    window.updateMarkDisplay(id, allCorrect); 
    if (window.currentMode === 'grade') window.updateGradingMessage();
    
    if (allCorrect) { if(window.safePlay) window.safePlay(window.sfxMaru); } 
    else if (userValues.some(v => v.trim().length > 0)) { if(window.safePlay) window.safePlay(window.sfxBatu); }
}

window.checkAnswerDynamically = function(id, inputElem, event) { 
    if (window.isComposing) return; 
    const problem = window.transcribedProblems.find(p => p.id === id); 
    if(problem) problem.student_answer = [inputElem.value]; 
    const val = inputElem.value;
    if(window.gradingTimer) clearTimeout(window.gradingTimer); 
    window.gradingTimer = setTimeout(() => { _performCheckAnswerDynamically(id, val); }, 1000);
};

function _performCheckAnswerDynamically(id, val) {
    const problem = window.transcribedProblems.find(p => p.id === id); if (!problem) return;
    const correctVal = Array.isArray(problem.correct_answer) ? problem.correct_answer[0] : problem.correct_answer;
    const isCorrect = isMatch(val, String(correctVal)); 
    problem.is_correct = isCorrect; 
    window.updateMarkDisplay(id, isCorrect); 
    if (window.currentMode === 'grade') window.updateGradingMessage();
    
    if (isCorrect) { if(window.safePlay) window.safePlay(window.sfxMaru); } 
    else if (val.trim().length > 0) { if(window.safePlay) window.safePlay(window.sfxBatu); }
}

window.checkOneProblem = function(id) { 
    const problem = window.transcribedProblems.find(p => p.id === id); if (!problem) return; 
    const correctList = Array.isArray(problem.correct_answer) ? problem.correct_answer : [problem.correct_answer];
    let userValues = []; 
    if (correctList.length > 1) { 
        const inputs = document.querySelectorAll(`.multi-input-${id}`); 
        userValues = Array.from(inputs).map(i => i.value); 
    } else { 
        const input = document.getElementById(`single-input-${id}`); 
        if(input) userValues = [input.value]; 
    } 
    
    let isCorrect = false; 
    if (userValues.length === correctList.length) { 
        const usedIndices = new Set(); 
        let matchCount = 0; 
        for (const uVal of userValues) { 
            for (let i = 0; i < correctList.length; i++) { 
                if (!usedIndices.has(i)) { 
                    if (isMatch(uVal, correctList[i])) { usedIndices.add(i); matchCount++; break; } 
                } 
            } 
        } 
        isCorrect = (matchCount === correctList.length); 
    } 
    
    if (isCorrect) { if(window.safePlay) window.safePlay(window.sfxMaru); } else { if(window.safePlay) window.safePlay(window.sfxBatu); } 
    
    const markElem = document.getElementById(`mark-${id}`); 
    const container = document.getElementById(`grade-item-${id}`); 
    if (markElem && container) { 
        if (isCorrect) { 
            markElem.innerText = "⭕"; markElem.style.color = "#ff5252"; container.style.backgroundColor = "#fff5f5"; 
            window.updateNellMessage("正解だにゃ！すごいにゃ！", "excited", false); 
        } else { 
            markElem.innerText = "❌"; markElem.style.color = "#4a90e2"; container.style.backgroundColor = "#f0f8ff"; 
            window.updateNellMessage("おしい！もう一回考えてみて！", "gentle", false); 
        } 
    } 
};

window.updateMarkDisplay = function(id, isCorrect) { 
    const container = document.getElementById(`grade-item-${id}`); 
    const markElem = document.getElementById(`mark-${id}`); 
    if (container && markElem) { 
        if (isCorrect) { markElem.innerText = "⭕"; markElem.style.color = "#ff5252"; container.style.backgroundColor = "#fff5f5"; } 
        else { markElem.innerText = "❌"; markElem.style.color = "#4a90e2"; container.style.backgroundColor = "#f0f8ff"; } 
    } 
};

window.updateGradingMessage = function() { 
    let correctCount = 1; 
    window.transcribedProblems.forEach(p => { if (p.is_correct) correctCount++; }); 
    const scoreRate = correctCount / (window.transcribedProblems.length || 1); 
    if (scoreRate === 1.0) window.updateNellMessage(`全問正解だにゃ！天才だにゃ〜！！`, "excited", false); 
    else if (scoreRate >= 0.5) window.updateNellMessage(`あと${window.transcribedProblems.length - correctCount}問！直してみるにゃ！`, "happy", false); 
    else window.updateNellMessage(`間違ってても大丈夫！入力し直してみて！`, "gentle", false); 
};

window.startHint = function(id) {
    if (window.ensureAudioContext) window.ensureAudioContext();
    window.selectedProblem = window.transcribedProblems.find(p => p.id == id); 
    if (!window.selectedProblem) return window.updateNellMessage("データエラーだにゃ", "thinking", false);
    
    if (!window.selectedProblem.currentHintLevel) window.selectedProblem.currentHintLevel = 1;
    if (window.selectedProblem.maxUnlockedHintLevel === undefined) window.selectedProblem.maxUnlockedHintLevel = 0;
    
    ['problem-selection-view', 'grade-sheet-container', 'answer-display-area', 'chalkboard'].forEach(i => { 
        const el = document.getElementById(i); if(el) el.classList.add('hidden'); 
    });
    
    document.getElementById('final-view').classList.remove('hidden'); 
    document.getElementById('hint-detail-container').classList.remove('hidden');
    
    const board = document.getElementById('chalkboard'); 
    if(board) { board.innerText = window.selectedProblem.question; board.classList.remove('hidden'); }
    
    const backBtn = document.getElementById('main-back-btn');
    if(backBtn) backBtn.classList.add('hidden');
    
    window.updateNellMessage("ヒントを見るにゃ？", "thinking", false);
    window.renderHintUI();
    window.scrollTo({ top: 0, behavior: 'instant' });
};

window.renderHintUI = function() {
    const p = window.selectedProblem; 
    const maxUnlocked = p.maxUnlockedHintLevel;
    const hintBtnsContainer = document.querySelector('.hint-btns');
    
    hintBtnsContainer.innerHTML = `<div class="hint-step-badge" id="hint-step-label">考え方</div>`;
    
    let nextCost = 0, nextLabel = ""; 
    let nextLevel = maxUnlocked + 1;
    
    if (nextLevel === 1) { nextCost = 5; nextLabel = "カリカリ(×5)でヒントをもらう"; }
    else if (nextLevel === 2) { nextCost = 5; nextLabel = "カリカリ(×5)でさらにヒントをもらう"; }
    else if (nextLevel === 3) { nextCost = 10; nextLabel = "カリカリ(×10)で大ヒントをもらう"; }
    
    if (nextLevel <= 3) {
        const unlockBtn = document.createElement('button'); 
        unlockBtn.className = "main-btn blue-btn"; 
        unlockBtn.innerText = nextLabel; 
        unlockBtn.onclick = () => window.unlockNextHint(nextLevel, nextCost); 
        hintBtnsContainer.appendChild(unlockBtn);
    } else {
        const revealBtn = document.createElement('button'); 
        revealBtn.className = "main-btn orange-btn"; 
        revealBtn.innerText = "答えを見る"; 
        revealBtn.onclick = window.revealAnswer; 
        hintBtnsContainer.appendChild(revealBtn);
    }
    
    if (maxUnlocked > 0) {
        const reviewContainer = document.createElement('div'); 
        reviewContainer.style.display = "flex"; 
        reviewContainer.style.gap = "5px"; 
        reviewContainer.style.marginTop = "10px"; 
        reviewContainer.style.flexWrap = "wrap";
        
        for (let i = 1; i <= maxUnlocked; i++) { 
            const btn = document.createElement('button'); 
            btn.className = "main-btn gray-btn"; 
            btn.style.fontSize = "0.9rem"; 
            btn.style.padding = "8px"; 
            btn.style.flex = "1"; 
            btn.innerText = `ヒント${i}を見る`; 
            btn.onclick = () => window.showHintText(i); 
            reviewContainer.appendChild(btn); 
        }
        hintBtnsContainer.appendChild(reviewContainer);
    }
    
    const ansDiv = document.createElement('div'); 
    ansDiv.id = "answer-display-area"; 
    ansDiv.className = "answer-box hidden"; 
    ansDiv.innerHTML = `ネル先生の答え：<br><span id="final-answer-text"></span>`; 
    hintBtnsContainer.appendChild(ansDiv);
};

window.unlockNextHint = function(level, cost) {
    if (window.ensureAudioContext) window.ensureAudioContext();
    if (window.currentUser.karikari < cost) return window.updateNellMessage(`カリカリが足りないにゃ…あと${cost}個！`, "thinking", false);
    
    window.currentUser.karikari -= cost; 
    if(window.saveAndSync) window.saveAndSync(); 
    if(window.updateMiniKarikari) window.updateMiniKarikari(); 
    if(window.showKarikariEffect) window.showKarikariEffect(-cost);
    
    window.selectedProblem.maxUnlockedHintLevel = level;
    window.showHintText(level); 
    window.renderHintUI();
};

window.showHintText = function(level) {
    const hints = window.selectedProblem.hints || []; 
    const text = hints[level - 1] || "ヒントが見つからないにゃ...";
    window.updateNellMessage(text, "thinking", false);
    const hl = document.getElementById('hint-step-label'); 
    if(hl) hl.innerText = `ヒント Lv.${level}`; 
};

window.revealAnswer = function() {
    const ansArea = document.getElementById('answer-display-area'); 
    const finalTxt = document.getElementById('final-answer-text');
    const correctArr = Array.isArray(window.selectedProblem.correct_answer) ? window.selectedProblem.correct_answer : [window.selectedProblem.correct_answer];
    let displayAnswer = correctArr.map(part => part.split('|')[0]).join(', ');
    
    if (ansArea && finalTxt) { 
        finalTxt.innerText = displayAnswer; 
        ansArea.classList.remove('hidden'); 
        ansArea.style.display = "block"; 
    }
    
    const btns = document.querySelectorAll('.hint-btns button.orange-btn'); 
    btns.forEach(b => b.classList.add('hidden'));
    
    window.updateNellMessage(`答えは「${displayAnswer}」だにゃ！`, "gentle", false); 
};

window.backToProblemSelection = function() { 
    document.getElementById('final-view').classList.add('hidden'); 
    document.getElementById('hint-detail-container').classList.add('hidden'); 
    document.getElementById('chalkboard').classList.add('hidden'); 
    document.getElementById('answer-display-area').classList.add('hidden'); 
    
    if (window.currentMode === 'grade') {
        window.showGradingView(); 
    } else { 
        window.renderProblemSelection(); 
        window.updateNellMessage("他も見るにゃ？", "normal", false); 
    } 
    
    const backBtn = document.getElementById('main-back-btn'); 
    if(backBtn) { 
        backBtn.classList.remove('hidden'); 
        backBtn.onclick = window.backToLobby; 
    } 
    
    if (window.selectedProblem && window.selectedProblem.id) { 
        setTimeout(() => { 
            const targetId = `grade-item-${window.selectedProblem.id}`; 
            const targetElement = document.getElementById(targetId); 
            if (targetElement) { 
                targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' }); 
                const originalBg = targetElement.style.backgroundColor; 
                targetElement.style.transition = "background-color 0.3s"; 
                targetElement.style.backgroundColor = "#fff9c4"; 
                setTimeout(() => { targetElement.style.backgroundColor = originalBg; }, 800); 
            } 
        }, 100); 
    }
};

window.pressThanks = function() { window.backToProblemSelection(); };

window.finishGrading = async function(btnElement) { 
    if(btnElement) { btnElement.disabled = true; btnElement.innerText = "採点完了！"; } 
    if (window.currentUser) { 
        window.currentUser.karikari += 100; 
        if(window.saveAndSync) window.saveAndSync(); 
        if(window.updateMiniKarikari) window.updateMiniKarikari(); 
        if(window.showKarikariEffect) window.showKarikariEffect(100); 
    } 
    await window.updateNellMessage("よくがんばったにゃ！カリカリ100個あげる！", "excited", false); 
    setTimeout(() => { 
        if(typeof window.backToLobby === 'function') window.backToLobby(true); 
    }, 3000); 
};

window.pressAllSolved = function(btnElement) { 
    if(btnElement) { btnElement.disabled = true; btnElement.innerText = "すごい！"; } 
    if (window.currentUser) { 
        window.currentUser.karikari += 100; 
        if(window.saveAndSync) window.saveAndSync(); 
        if(window.showKarikariEffect) window.showKarikariEffect(100); 
        if(window.updateMiniKarikari) window.updateMiniKarikari(); 
        window.updateNellMessage("よくがんばったにゃ！カリカリ100個あげるにゃ！", "excited", false).then(() => { 
            setTimeout(() => { 
                if(typeof window.backToLobby === 'function') window.backToLobby(true); 
            }, 3000); 
        }); 
    } 
};
// --- js/main.js に追記 ---

// 11. 宿題分析ロジック (重要)
window.startAnalysis = async function(imageBlob) {
    if (window.isAnalyzing) return;
    window.isAnalyzing = true;

    // 読み込み中表示
    window.updateNellMessage("問題を読んでるにゃ…ちょっと待ってにゃ！", "thinking", false);
    
    // UIを隠す
    const hwSection = document.getElementById('homework-section');
    if(hwSection) hwSection.classList.add('hidden');
    document.getElementById('mode-selection').classList.add('hidden');

    const formData = new FormData();
    formData.append('image', imageBlob);

    try {
        const response = await fetch('/analyze-homework', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) throw new Error("Server Error");

        const data = await response.json();
        console.log("Analysis Result:", data);

        // 結果を保存
        window.transcribedProblems = data.problems || [];
        
        // 問題選択画面へ
        if (window.renderProblemSelection) {
            window.renderProblemSelection();
        } else {
            // 万が一関数がない場合のフォールバック
            console.error("renderProblemSelection missing");
            alert("分析できたけど、表示機能が見当たらないにゃ…。");
        }

    } catch (e) {
        console.error("Analysis Error:", e);
        window.updateNellMessage("ごめん、読み取れなかったにゃ。もう一回綺麗に撮ってほしいにゃ！", "sad");
        // 失敗したら元の画面に戻す
        if(hwSection) hwSection.classList.remove('hidden');
    } finally {
        window.isAnalyzing = false;
    }
};

// 問題選択画面の描画
window.renderProblemSelection = function() {
    const container = document.getElementById('problem-list-container');
    const view = document.getElementById('problem-selection-view');
    if (!container || !view) return;

    container.innerHTML = ""; // クリア
    view.classList.remove('hidden');
    
    // 戻るボタンの設定
    const backBtn = document.getElementById('main-back-btn');
    if(backBtn) {
        backBtn.classList.remove('hidden');
        backBtn.onclick = window.backToLobby;
    }

    window.updateNellMessage("どの問題を教えてほしいにゃ？", "normal");

    if (window.transcribedProblems.length === 0) {
        container.innerHTML = "<p>問題が見つからなかったにゃ…。</p>";
        return;
    }

    window.transcribedProblems.forEach((prob, index) => {
        const item = document.createElement('div');
        item.className = "problem-item";
        item.innerHTML = `
            <div class="problem-number">問${index + 1}</div>
            <div class="problem-text">${prob.question.substring(0, 40)}${prob.question.length > 40 ? '...' : ''}</div>
        `;
        item.onclick = () => {
            // 解説モードへ
            window.startHint(prob.id);
        };
        container.appendChild(item);
    });
};

// ロビー（モード選択）に戻る
window.backToLobby = function(refresh = false) {
    // 画面リセット
    document.querySelectorAll('.app-section, #problem-selection-view, #final-view, #hint-detail-container, #chalkboard').forEach(el => el.classList.add('hidden'));
    
    document.getElementById('mode-selection').classList.remove('hidden');
    const backBtn = document.getElementById('main-back-btn');
    if(backBtn) backBtn.classList.add('hidden');
    
    window.updateNellMessage("次はなにするにゃ？", "normal");
    
    // カメラ停止
    if(window.stopPreviewCamera) window.stopPreviewCamera();
};
console.log("✅ main.js loaded.");