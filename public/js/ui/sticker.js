// --- js/ui/sticker.js (v1.0: ファイルベース・バインダー対応版) ---

// シールデータの構造: { id, src, x, y, rotation, scale, zIndex }

window.showStickerBook = function(targetUserId = null) {
    window.switchScreen('screen-sticker-book');
    window.updateNellMessage("シール帳だにゃ！自由に貼って遊ぶにゃ！", "happy");
    
    // ターゲットユーザー（自分 or 他人）
    const userId = targetUserId || (currentUser ? currentUser.id : null);
    if (!userId) return;

    // 読み込みと描画
    window.loadAndRenderStickers(userId);
};

window.grantRandomSticker = function() {
    if (!currentUser) return;
    
    // 1 ～ MAX_COUNT の乱数を生成
    const max = window.STICKER_FILE_MAX_COUNT || 10; 
    const num = Math.floor(Math.random() * max) + 1;
    const formattedNum = String(num).padStart(3, '0');
    const fileName = `sticker${formattedNum}.png`;
    // ★修正: パスを絶対パス (/assets/...) に変更
    const filePath = `/assets/images/sticker/${fileName}`;
    
    // 新しいシールデータ作成
    const newSticker = {
        id: 'st_' + Date.now() + '_' + Math.floor(Math.random()*1000),
        src: filePath,
        x: 50 + (Math.random() * 20 - 10), // 中央付近にランダム
        y: 50 + (Math.random() * 20 - 10),
        rotation: (Math.random() * 40 - 20), // 軽いランダム回転
        scale: 1.0,
        zIndex: 100 // 最前面へ
    };

    if (!currentUser.stickers) currentUser.stickers = [];
    currentUser.stickers.push(newSticker);
    
    // 保存
    if (typeof window.saveAndSync === 'function') window.saveAndSync();

    // 演出
    if(window.safePlay) window.safePlay(window.sfxHirameku);
    
    // 画像をプリロードして確認（エラーならアラートでごまかす）
    const img = new Image();
    img.onload = () => {
        alert(`🎉 おめでとう！\n累計1000個達成で「シールNo.${num}」をゲットしたにゃ！\nシール帳に貼っておいたにゃ！`);
    };
    img.onerror = () => {
        // 画像がない場合
        alert(`🎉 おめでとう！\n累計1000個達成だにゃ！`);
    };
    img.src = filePath;
};

window.loadAndRenderStickers = function(userId) {
    const board = document.getElementById('sticker-board');
    if (!board) return;
    board.innerHTML = ''; // クリア
    
    // バインダーのリング（装飾）
    const ring = document.createElement('div');
    ring.className = 'binder-ring';
    board.appendChild(ring);
    
    // バインダーの留め具（装飾）
    const clasp = document.createElement('div');
    clasp.className = 'binder-clasp';
    const container = document.getElementById('sticker-board-container');
    if (container) {
        // 留め具はcontainerに追加
        const oldClasp = container.querySelector('.binder-clasp');
        if (oldClasp) oldClasp.remove();
        container.appendChild(clasp);
    }
    
    // ガイドテキスト
    const guide = document.createElement('div');
    guide.id = 'sticker-guide-text';
    guide.style.cssText = "position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); color:rgba(0,0,0,0.1); font-weight:bold; pointer-events:none; font-size:2rem; white-space:nowrap;";
    guide.innerText = "STICKER BOOK";
    board.appendChild(guide);

    // ユーザーデータ取得
    let stickers = [];
    if (currentUser && currentUser.id === userId) {
        stickers = currentUser.stickers || [];
    }

    stickers.forEach(s => {
        const el = window.createStickerElement(s);
        board.appendChild(el);
    });
};

window.createStickerElement = function(data) {
    const div = document.createElement('div');
    div.className = 'sticker-item';
    div.id = data.id;
    
    // 初期配置
    div.style.left = data.x + '%';
    div.style.top = data.y + '%';
    div.style.transform = `translate(-50%, -50%) rotate(${data.rotation || 0}deg) scale(${data.scale || 1})`;
    div.style.zIndex = data.zIndex || 1;

    // 画像
    const img = document.createElement('img');
    // data.src があればそれを使う
    if (data.src) {
        img.src = data.src;
    } else if (window.STICKER_TYPES) {
        const typeDef = window.STICKER_TYPES.find(t => t.id === data.typeId);
        if (typeDef && typeDef.src) img.src = typeDef.src;
        else img.src = 'assets/images/items/nikukyuhanko.png'; // fallback
    }
    
    img.className = 'sticker-img';
    
    // 画像読み込みエラー時の処理
    img.onerror = () => {
        img.src = 'assets/images/items/nikukyuhanko.png'; // デフォルト画像
    };
    
    div.appendChild(img);

    // イベントリスナー登録 (操作ロジック)
    window.attachStickerEvents(div, data);

    return div;
};

// 操作ロジック（ドラッグ＆回転）
window.attachStickerEvents = function(el, data) {
    let isDragging = false;
    let startX, startY;
    let initialLeft, initialTop;
    let moved = false;

    // ドラッグ開始
    const startDrag = (e) => {
        if (e.target.closest('.main-btn')) return; // ボタン等は除外
        e.preventDefault();
        e.stopPropagation(); // 他のシールへの干渉防止

        isDragging = true;
        moved = false;
        
        // 最前面へ
        el.style.zIndex = 999;
        
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        
        startX = clientX;
        startY = clientY;
        
        // 現在の％位置を読み取る
        initialLeft = parseFloat(el.style.left);
        initialTop = parseFloat(el.style.top);
    };

    // ドラッグ中
    const onDrag = (e) => {
        if (!isDragging) return;
        e.preventDefault();
        
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        
        const dx = clientX - startX;
        const dy = clientY - startY;
        
        // 移動量判定（タップ判定用）
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) moved = true;

        const parentRect = el.parentElement.getBoundingClientRect();
        
        // ピクセル移動量を％に変換
        const dxPercent = (dx / parentRect.width) * 100;
        const dyPercent = (dy / parentRect.height) * 100;
        
        let newX = initialLeft + dxPercent;
        let newY = initialTop + dyPercent;
        
        // 画面外へのはみ出し制限 (0% ~ 100%)
        newX = Math.max(0, Math.min(100, newX));
        newY = Math.max(0, Math.min(100, newY));

        el.style.left = newX + '%';
        el.style.top = newY + '%';
        
        // データ更新（一時的）
        data.x = newX;
        data.y = newY;
    };

    // ドラッグ終了
    const endDrag = (e) => {
        if (!isDragging) return;
        isDragging = false;
        
        if (!moved) {
            // クリック（タップ）時の動作：回転
            data.rotation = (data.rotation || 0) + 45;
            el.style.transform = `translate(-50%, -50%) rotate(${data.rotation}deg) scale(${data.scale || 1})`;
            if (window.sfxBtn) window.safePlay(window.sfxBtn);
        } else {
            // 移動終了時
            // zIndexを確定
            data.zIndex = 10 + Math.floor(Math.random() * 50); 
            el.style.zIndex = data.zIndex;
        }
    };

    el.addEventListener('mousedown', startDrag);
    el.addEventListener('touchstart', startDrag, { passive: false });

    window.addEventListener('mousemove', onDrag);
    window.addEventListener('touchmove', onDrag, { passive: false });

    window.addEventListener('mouseup', endDrag);
    window.addEventListener('touchend', endDrag);
};

window.saveStickers = function() {
    if (!currentUser) return;
    
    // 現在のcurrentUser.stickers は、参照渡しされている data オブジェクトが
    // 操作によって直接更新されているため、そのまま保存すればOK。
    // ただし、念のためFirestoreへ同期
    
    if (typeof window.saveAndSync === 'function') {
        window.saveAndSync();
        alert("シール帳を保存したにゃ！");
    }
};