// --- START OF FILE self-study.js ---

// --- js/self-study.js (v1.0: 自習室機能) ---

let selfStudyState = {
    drills:[],
    currentDrill: null,
    currentPage: null
};

// ==========================================
// 1. 親モード: ドリルJSONの登録
// ==========================================
window.openDrillImportModal = function() {
    if (!currentUser) return;
    const modal = document.getElementById('drill-import-modal');
    if (modal) {
        document.getElementById('drill-json-input').value = "";
        modal.classList.remove('hidden');
    }
};

window.closeDrillImportModal = function() {
    const modal = document.getElementById('drill-import-modal');
    if (modal) modal.classList.add('hidden');
};

window.importDrillJson = async function() {
    if (!window.db || !currentUser) return alert("データベースに接続されていません。");
    const jsonStr = document.getElementById('drill-json-input').value.trim();
    if (!jsonStr) return alert("JSONデータを貼り付けてにゃ！");

    const btn = document.getElementById('drill-import-btn');
    btn.disabled = true;
    btn.innerText = "登録中...";

    try {
        // AI Studioが出力したJSONからMarkdownのコードブロック(```json)を取り除く
        let cleanStr = jsonStr.replace(/```json/g, '').replace(/```/g, '').trim();
        const drillData = JSON.parse(cleanStr);

        if (!drillData.title || !drillData.pages) {
            throw new Error("フォーマットが違うみたいだにゃ（titleとpagesが必要）");
        }

        // 保存データにメタ情報を追加
        const dataToSave = {
            ...drillData,
            ownerId: currentUser.id,
            createdAt: new Date().toISOString()
        };

        await window.db.collection('custom_drills').add(dataToSave);
        
        alert("ドリルを登録したにゃ！");
        window.closeDrillImportModal();
    } catch (e) {
        console.error("Import Error:", e);
        alert("登録エラーだにゃ...\n" + e.message);
    } finally {
        btn.disabled = false;
        btn.innerText = "登録する！";
    }
};

// ==========================================
// 2. 子供モード: 自習室UI
// ==========================================
window.showSelfStudyMenu = async function() {
    window.switchScreen('screen-self-study');
    window.currentMode = 'self-study';
    
    document.getElementById('self-study-list-view').classList.remove('hidden');
    document.getElementById('self-study-play-view').classList.add('hidden');
    
    window.updateNellMessage("自習室だにゃ！どのドリルをやるにゃ？", "normal");
    
    const container = document.getElementById('self-study-drill-list');
    container.innerHTML = '<p style="text-align:center;">ドリルを探してるにゃ...</p>';
    
    if (!window.db || !currentUser) return;
    
    try {
        const snapshot = await window.db.collection('custom_drills')
            .where('ownerId', '==', currentUser.id)
            .orderBy('createdAt', 'desc')
            .get();
            
        selfStudyState.drills =[];
        container.innerHTML = '';
        
        if (snapshot.empty) {
            container.innerHTML = '<p style="text-align:center; color:#888;">まだドリルが登録されてないにゃ。<br>おうちの人に登録してもらってにゃ！</p>';
            return;
        }
        
        snapshot.forEach(doc => {
            const data = { id: doc.id, ...doc.data() };
            selfStudyState.drills.push(data);
            
            const btn = document.createElement('button');
            btn.className = "main-btn";
            btn.style.cssText = "background: white; color: #333; border: 2px solid #4db6ac; text-align: left; margin-bottom: 10px; box-shadow: 0 4px 0 #b2dfdb; display: flex; justify-content: space-between; align-items: center;";
            
            let icon = "📚";
            if (data.subject === "さんすう") icon = "🔢";
            if (data.subject === "こくご") icon = "📖";
            
            btn.innerHTML = `<span style="font-size:1.1rem; font-weight:bold;">${icon} ${window.cleanDisplayString(data.title)}</span><span style="font-size:0.8rem; color:#888;">${data.pages.length}ページ</span>`;
            btn.onclick = () => window.openDrillDetail(data.id);
            container.appendChild(btn);
        });
        
    } catch (e) {
        console.error("Drill Load Error:", e);
        container.innerHTML = '<p style="text-align:center; color:red;">読み込めなかったにゃ...</p>';
    }
};

window.openDrillDetail = function(drillId) {
    const drill = selfStudyState.drills.find(d => d.id === drillId);
    if (!drill) return;
    
    selfStudyState.currentDrill = drill;
    
    document.getElementById('self-study-list-view').classList.add('hidden');
    document.getElementById('self-study-play-view').classList.remove('hidden');
    document.getElementById('drill-play-title').innerText = drill.title;
    
    window.updateNellMessage("どのページをやるにゃ？", "excited");
    
    const container = document.getElementById('drill-page-container');
    container.innerHTML = '';
    
    drill.pages.forEach((page, pageIndex) => {
        const btn = document.createElement('button');
        btn.className = "main-btn blue-btn";
        btn.style.marginBottom = "10px";
        btn.innerText = `📄 ${page.page_number} (${page.questions.length}問)`;
        btn.onclick = () => window.startDrillPage(pageIndex);
        container.appendChild(btn);
    });
};

window.backToDrillList = function() {
    selfStudyState.currentDrill = null;
    selfStudyState.currentPage = null;
    document.getElementById('self-study-list-view').classList.remove('hidden');
    document.getElementById('self-study-play-view').classList.add('hidden');
    window.updateNellMessage("自習室だにゃ！どのドリルをやるにゃ？", "normal");
};

// ==========================================
// 3. ページプレイ画面（ヒントと答え合わせ）
// ==========================================
window.startDrillPage = function(pageIndex) {
    const page = selfStudyState.currentDrill.pages[pageIndex];
    selfStudyState.currentPage = page;
    
    // UIの切り替え
    const playArea = document.getElementById('drill-page-container');
    playArea.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
            <button onclick="window.openDrillDetail('${selfStudyState.currentDrill.id}')" class="mini-teach-btn" style="background:#78909c; width:auto;">← ページ選択へ</button>
            <span style="font-weight:bold; color:#00796b;">${page.page_number}</span>
        </div>
        <p style="text-align:center; font-size:0.9rem; color:#666; margin-bottom:15px;">紙のドリルを解きながら、わからない問題のボタンを押してにゃ！</p>
        <div id="drill-questions-grid" style="display:flex; flex-direction:column; gap:10px;"></div>
        <button onclick="window.finishDrillPage()" class="main-btn orange-btn" style="margin-top:20px;">🎉 このページおわり！</button>
    `;
    
    const qGrid = document.getElementById('drill-questions-grid');
    
    page.questions.forEach((q, qIndex) => {
        // 問題ごとの状態（0: 未タッチ, 1: ヒント1, 2: ヒント2, 3: 答え）
        q.currentState = 0; 
        
        const card = document.createElement('div');
        card.className = "grade-item"; // 既存のスタイル流用
        card.style.flexDirection = "column";
        card.style.alignItems = "flex-start";
        
        // ヘッダー（問題番号）
        const header = document.createElement('div');
        header.style.cssText = "display:flex; justify-content:space-between; width:100%; align-items:center; margin-bottom:10px;";
        header.innerHTML = `<span style="font-size:1.2rem; font-weight:bold; color:#333;">第 ${q.q_number} 問</span>`;
        
        // アクションボタン
        const btnArea = document.createElement('div');
        btnArea.style.cssText = "display:flex; gap:10px; width:100%;";
        
        const hintBtn = document.createElement('button');
        hintBtn.className = "main-btn green-btn";
        hintBtn.style.flex = "1";
        hintBtn.style.margin = "0";
        hintBtn.style.padding = "10px";
        hintBtn.innerText = "💡 ヒントを聞く";
        
        const ansBtn = document.createElement('button');
        ansBtn.className = "main-btn pink-btn";
        ansBtn.style.flex = "1";
        ansBtn.style.margin = "0";
        ansBtn.style.padding = "10px";
        ansBtn.innerText = "⭕ 答え合わせ";
        
        // ネル先生の言葉表示エリア
        const speechArea = document.createElement('div');
        speechArea.id = `q-speech-${qIndex}`;
        speechArea.style.cssText = "width:100%; margin-top:10px; padding:10px; background:#e0f2f1; border-radius:8px; color:#00695c; font-size:0.9rem; font-weight:bold; display:none;";
        
        // ボタンイベント
        hintBtn.onclick = () => {
            let hintText = "";
            if (q.currentState === 0) {
                hintText = q.hints[0] || "ヒントはないみたいだにゃ。";
                q.currentState = 1;
                hintBtn.innerText = "💡 もっとヒント！";
            } else if (q.currentState === 1 || q.currentState === 2) {
                hintText = q.hints[1] || q.hints[0] || "これが最大のヒントだにゃ！";
                q.currentState = 2;
                hintBtn.disabled = true;
                hintBtn.style.background = "#ccc";
                hintBtn.style.boxShadow = "none";
            }
            speechArea.style.display = "block";
            speechArea.innerText = hintText;
            window.updateNellMessage(hintText, "thinking", false, true);
        };
        
        ansBtn.onclick = () => {
            const ansText = `正解は「${q.answer}」だにゃ！`;
            q.currentState = 3;
            speechArea.style.display = "block";
            speechArea.style.background = "#fff3e0";
            speechArea.style.color = "#e65100";
            speechArea.style.fontSize = "1.2rem";
            speechArea.innerText = ansText;
            window.updateNellMessage(ansText, "happy", false, true);
        };
        
        btnArea.appendChild(hintBtn);
        btnArea.appendChild(ansBtn);
        
        card.appendChild(header);
        card.appendChild(btnArea);
        card.appendChild(speechArea);
        qGrid.appendChild(card);
    });
    
    window.updateNellMessage(`「${page.page_number}」をはじめるにゃ！`, "excited");
};

window.finishDrillPage = function() {
    // 報酬付与
    const reward = 50; // 1ページ終わったら50カリカリ
    window.giveGameReward(reward);
    
    window.updateNellMessage(`よくがんばったにゃ！えらいにゃ！！ご褒美にカリカリ${reward}個あげるにゃ！`, "excited", false, true);
    
    if(window.safePlay) window.safePlay(window.sfxHirameku);
    
    // ページ一覧に戻る
    setTimeout(() => {
        window.openDrillDetail(selfStudyState.currentDrill.id);
    }, 2000);
};