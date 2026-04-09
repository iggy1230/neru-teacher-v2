// --- START OF FILE library.js ---

// --- js/library.js (v2.0: 図書館モード - PDF対応版 寄贈機能) ---

// pdf.js のワーカーを設定（これがないとPDFが読み込めません）
if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
}

let libraryState = {
    tempPdfFile: null,
    tempPdfMeta: {}
};

// Base64 -> Blob 変換ヘルパー
function dataURLtoBlob(dataurl) {
    let arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
        bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
    while(n--){
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], {type:mime});
}

window.openPdfImportModal = function() {
    if (!currentUser) return;
    const modal = document.getElementById('pdf-import-modal');
    if (modal) {
        // 初期化
        libraryState.tempPdfFile = null;
        libraryState.tempPdfMeta = {};
        document.getElementById('pdf-file-input').value = "";
        document.getElementById('pdf-meta-area').classList.add('hidden');
        const btn = document.getElementById('pdf-upload-btn');
        btn.innerText = "ファイルを選んでにゃ";
        btn.disabled = true;
        
        modal.classList.remove('hidden');
        
        if(typeof window.updateNellMessage === 'function') {
            window.updateNellMessage("PDF形式のファイルをアップロードしてにゃ！", "normal", false, true);
        }
    }
};

window.closePdfImportModal = function() {
    const modal = document.getElementById('pdf-import-modal');
    if (modal) modal.classList.add('hidden');
};

// PDFファイルが選択された時の処理
window.onPdfFileSelected = async function(event) {
    const file = event.target.files[0];
    if(!file) return;
    
    if (file.type !== "application/pdf") {
        return alert("PDFファイルを選んでにゃ！");
    }

    libraryState.tempPdfFile = file;

    const btn = document.getElementById('pdf-upload-btn');
    btn.innerText = "表紙を作ってるにゃ...";
    btn.disabled = true;
    
    const metaArea = document.getElementById('pdf-meta-area');
    metaArea.classList.remove('hidden');
    document.getElementById('pdf-preview-cover').src = "assets/images/characters/nell-thinking.png"; 

    // ファイル名から拡張子(.pdf)を取ってタイトル候補にする
    const defaultTitle = file.name.replace(/\.[^/.]+$/, "");
    document.getElementById('pdf-title-input').value = defaultTitle;
    document.getElementById('pdf-author-input').value = currentUser.name + "の親";

    try {
        // PDFの1ページ目を読み込んでCanvasに描画し、表紙画像(Base64)を作る
        const fileReader = new FileReader();
        fileReader.onload = async function() {
            const typedarray = new Uint8Array(this.result);
            try {
                const pdf = await pdfjsLib.getDocument(typedarray).promise;
                const page = await pdf.getPage(1); // 1ページ目を取得
                
                // サムネイル用のサイズ計算 (幅300px程度に縮小)
                const viewport = page.getViewport({scale: 1.0});
                const scale = 300 / viewport.width;
                const scaledViewport = page.getViewport({scale: scale});

                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.height = scaledViewport.height;
                canvas.width = scaledViewport.width;

                // PDFをCanvasにレンダリング
                await page.render({canvasContext: context, viewport: scaledViewport}).promise;

                // Base64のJPEG画像として保存
                libraryState.tempPdfMeta.coverBase64 = canvas.toDataURL('image/jpeg', 0.8);
                document.getElementById('pdf-preview-cover').src = libraryState.tempPdfMeta.coverBase64;

                btn.innerText = "この本を寄贈する！";
                btn.disabled = false;
                
                if(typeof window.updateNellMessage === 'function') {
                    window.updateNellMessage("1ページ目から表紙を作ったにゃ！タイトルを確認してにゃ。", "happy", false, true);
                }

            } catch(e) {
                console.error("PDF Render Error:", e);
                document.getElementById('pdf-preview-cover').src = "assets/images/items/student-id-base.png";
                libraryState.tempPdfMeta.coverBase64 = null;
                btn.innerText = "この本を寄贈する！";
                btn.disabled = false;
                window.updateNellMessage("表紙が作れなかったにゃ…。でも寄贈はできるにゃ！", "sad", false, true);
            }
        };
        fileReader.readAsArrayBuffer(file);

    } catch(e) {
        console.error(e);
        alert("PDFファイルの読み込みに失敗したにゃ...");
        btn.innerText = "ファイルを選んでにゃ";
        metaArea.classList.add('hidden');
    }
};

window.uploadPdfToFirebase = async function() {
    if(!libraryState.tempPdfFile) return alert("本が選ばれてないにゃ！");
    if(!window.fireStorage || !window.db) return alert("データベースに繋がってないにゃ！");

    const btn = document.getElementById('pdf-upload-btn');
    btn.disabled = true;
    btn.innerText = "アップロード中にゃ...（数分かかるかも！）";

    try {
        const title = document.getElementById('pdf-title-input').value || "タイトルなし";
        const author = document.getElementById('pdf-author-input').value || "作者不明";
        const timestamp = Date.now();
        
        // 1. 表紙画像のアップロード (あれば)
        let coverUrl = "";
        if (libraryState.tempPdfMeta.coverBase64) {
            const coverRef = window.fireStorage.ref('library_covers/' + timestamp + '.jpg');
            const coverBlob = dataURLtoBlob(libraryState.tempPdfMeta.coverBase64);
            await coverRef.put(coverBlob);
            coverUrl = await coverRef.getDownloadURL();
        }

        // 2. PDFファイルのアップロード
        const pdfRef = window.fireStorage.ref('library_pdfs/' + timestamp + '.pdf');
        await pdfRef.put(libraryState.tempPdfFile);
        const pdfUrl = await pdfRef.getDownloadURL();

        // 3. Firestoreにメタデータを登録（みんなの図書館）
        await window.db.collection('library_books').add({
            title: title,
            author: author,
            coverUrl: coverUrl, // URL文字列
            pdfUrl: pdfUrl,     // URL文字列
            uploadedBy: currentUser.id,
            uploadedByName: currentUser.name,
            createdAt: new Date().toISOString()
        });

        alert("図書館に本を寄贈したにゃ！ありがとうにゃ！");
        window.closePdfImportModal();
        
        if(window.safePlay && window.sfxHirameku) window.safePlay(window.sfxHirameku);

    } catch(e) {
        console.error(e);
        alert("アップロードに失敗したにゃ...\n" + e.message);
        btn.disabled = false;
        btn.innerText = "この本を寄贈する！";
    }
};