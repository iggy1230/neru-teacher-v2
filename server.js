import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket, { WebSocketServer } from 'ws';
import { parse } from 'url';
import dotenv from 'dotenv';
import fs from 'fs/promises';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));

// --- AI Model Constants ---
// メインで使用する最新モデル（性能は良いが制限が厳しい）
const MODEL_MAIN = "gemini-2.5-flash"; 
// バックアップ用の安定モデル（制限が緩い）
const MODEL_BACKUP = "gemini-1.5-flash";

const MODEL_REALTIME = "gemini-2.5-flash-native-audio-preview-09-2025";

// --- Server Log ---
const MEMORY_FILE = path.join(__dirname, 'server_log.json');
async function appendToServerLog(name, text) {
    try {
        let data = {};
        try { data = JSON.parse(await fs.readFile(MEMORY_FILE, 'utf8')); } catch {}
        const timestamp = new Date().toLocaleString('ja-JP', { 
            timeZone: 'Asia/Tokyo', 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: false 
        });
        const newLog = `[${timestamp}] ${text}`;
        let currentLogs = data[name] || [];
        currentLogs.push(newLog);
        if (currentLogs.length > 50) currentLogs = currentLogs.slice(-50);
        data[name] = currentLogs;
        await fs.writeFile(MEMORY_FILE, JSON.stringify(data, null, 2));
    } catch (e) { console.error("Server Log Error:", e); }
}

// --- AI Initialization ---
let genAI;
try {
    if (!process.env.GEMINI_API_KEY) {
        console.error("⚠️ GEMINI_API_KEY が設定されていません。");
    } else {
        genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        console.log("✅ AI Model Initialized.");
    }
} catch (e) { console.error("Init Error:", e.message); }

// ==========================================
// ★重要: 自動バックアップ生成関数
// ==========================================
async function generateWithFallback(promptParts, useTools = false, isJson = false) {
    // 1. まずメインモデル(2.5)で試す
    try {
        const toolsConfig = useTools ? [{ google_search: {} }] : undefined;
        // JSONモードかつ検索ツールの場合は、モデルによっては競合するためツールをオフにする調整
        const activeTools = isJson ? undefined : toolsConfig; 
        
        const model = genAI.getGenerativeModel({ 
            model: MODEL_MAIN,
            tools: activeTools
        });
        
        const result = await model.generateContent(promptParts);
        return result;
        
    } catch (error) {
        // エラー（特に429 Too Many Requests）が出たらここに来る
        console.warn(`⚠️ Main Model (${MODEL_MAIN}) Failed: ${error.message}`);
        console.log(`🔄 Switching to Backup Model (${MODEL_BACKUP})...`);

        // 2. 失敗したらバックアップモデル(1.5)で即座に再試行
        try {
            // バックアップは検索ツールなしで確実に回答を取りに行く（安定性優先）
            const backupModel = genAI.getGenerativeModel({ model: MODEL_BACKUP });
            const result = await backupModel.generateContent(promptParts);
            return result;
        } catch (backupError) {
            console.error(`❌ Backup Model also Failed: ${backupError.message}`);
            throw backupError; // 両方ダメなら諦めてエラーを返す
        }
    }
}

// ==========================================
// Helper Functions
// ==========================================

function getSubjectInstructions(subject) {
    switch (subject) {
        case 'さんすう': return `- **数式の記号**: 筆算の「横線」と「マイナス記号」を絶対に混同しないこと。\n- **複雑な表記**: 累乗（2^2など）、分数、帯分数を正確に認識すること。\n- **図形問題**: 図の中に書かれた長さや角度の数値も見落とさないこと。`;
        case 'こくご': return `- **縦書きレイアウトの厳格な分離**: 問題文や選択肢は縦書きです。**縦の罫線や行間の余白**を強く意識し、隣の行や列の内容が絶対に混ざらないようにしてください。\n- **列の独立性**: ある問題の列にある文字と、隣の問題の列にある文字を混同しないこと。\n- **読み取り順序**: 右の行から左の行へ、上から下へ読み取ること。`;
        case 'りか': return `- **グラフ・表**: グラフの軸ラベルや単位（g, cm, ℃, A, Vなど）を絶対に省略せず読み取ること。\n- **選択問題**: 記号選択問題（ア、イ、ウ...）の選択肢の文章もすべて書き出すこと。\n- **配置**: 図や表のすぐ近くや上部に「最初の問題」が配置されている場合が多いので、見逃さないこと。`;
        case 'しゃかい': return `- **選択問題**: 記号選択問題（ア、イ、ウ...）の選択肢の文章もすべて書き出すこと。\n- **資料読み取り**: 地図やグラフ、年表の近くにある「最初の問題」を見逃さないこと。\n- **用語**: 歴史用語や地名は正確に（子供の字が崩れていても文脈から補正して）読み取ること。`;
        default: return `- 基本的にすべての文字、図表内の数値を拾うこと。`;
    }
}

// ジャンルごとの信頼できる参照URLリスト
const GENRE_REFERENCES = {
    "魔法陣グルグル": ["https://dic.pixiv.net/a/%E9%AD%94%E6%B3%95%E9%99%A3%E3%82%B0%E3%83%AB%E3%82%B0%E3%83%AB", "https://ja.wikipedia.org/wiki/%E9%AD%94%E6%B3%95%E9%99%A3%E3%82%B0%E3%83%AB%E3%82%B0%E3%83%AB"],
    "ジョジョの奇妙な冒険": ["https://dic.pixiv.net/a/%E3%82%B8%E3%83%A7%E3%82%B8%E3%83%A7%E3%81%AE%E5%A5%87%E5%A6%99%E3%81%AA%E5%86%92%E9%99%BA", "https://w.atwiki.jp/jojo-dic/"],
    "ポケモン": ["https://dic.pixiv.net/a/%E3%83%9D%E3%82%B1%E3%83%A2%E3%83%B3", "https://wiki.xn--rckteqa2e.com/wiki/%E3%83%A1%E3%82%A4%E3%83%B3%E3%83%9A%E3%83%BC%E3%82%B8"],
    "マインクラフト": ["https://minecraft.fandom.com/ja/wiki/Minecraft_Wiki"],
    "ロブロックス": ["https://roblox.fandom.com/ja/wiki/Roblox_Wiki"],
    "ドラえもん": ["https://dic.pixiv.net/a/%E3%83%89%E3%83%A9%E3%81%88%E3%82%82%E3%83%B3"],
    "歴史・戦国武将": ["https://ja.wikipedia.org/wiki/%E6%88%A6%E5%9B%BD%E6%AD%A6%E5%B0%86"],
    "STPR": ["https://stpr.com/"],
    "夏目友人帳": ["https://dic.pixiv.net/a/%E5%A4%8F%E7%9B%AE%E5%8F%8B%E4%BA%BA%E5%B8%B3"]
};

// クイズ検証関数
async function verifyQuiz(quizData, genre) {
    try {
        const verifyPrompt = `生成AIが作成した以下のクイズが、事実に即しているか判定してください。\n【ジャンル】: ${genre}\n【問題】: ${quizData.question}\n【選択肢】: ${quizData.options.join(", ")}\n【想定正解】: ${quizData.answer}\n出力は "PASS" または "FAIL" のみとしてください。`;
        // 検証はGoogle検索を使いたいので、generateWithFallbackの第2引数をtrueにする
        const result = await generateWithFallback([verifyPrompt], true);
        return result.response.text().trim().includes("PASS");
    } catch (e) {
        return false;
    }
}

// ==========================================
// API Endpoints
// ==========================================

// --- クイズ生成 API (フォールバック & 待機リトライ) ---
app.post('/generate-quiz', async (req, res) => {
    const MAX_RETRIES = 2; // リトライ回数は少なめに（フォールバックがあるため）
    let attempt = 0;
    while (attempt < MAX_RETRIES) {
        attempt++;
        try {
            const { grade, genre, level } = req.body; 
            let targetGenre = genre || "一般知識";
            const prompt = `あなたは「${targetGenre}」のクイズ作家です。小学${grade}年生向けレベル${level}の4択クイズを1問、JSON形式のみで作成してください。{"question":"","options":["","","",""],"answer":"","explanation":"","actual_genre":""}`;
            
            // フォールバック付きで生成 (JSONモード)
            const result = await generateWithFallback([prompt], false, true);
            
            let text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
            const start = text.indexOf('{');
            const end = text.lastIndexOf('}');
            const jsonResponse = JSON.parse(text.substring(start, end + 1));

            // 検証（失敗してもエラーにせず、そのまま返す設定に変更して応答率を上げる）
            if (await verifyQuiz(jsonResponse, targetGenre)) {
                res.json(jsonResponse);
                return;
            } else {
                 // 検証落ちした場合は、とりあえず返す（ユーザー体験優先）
                 console.log("Quiz verification weak, but returning result.");
                 res.json(jsonResponse);
                 return;
            }
        } catch (e) {
            console.error(`Quiz Gen Error (Attempt ${attempt}):`, e.message);
            if (attempt >= MAX_RETRIES) {
                res.status(500).json({ error: "混み合っていて作れなかったにゃ…少し待ってにゃ。" });
            } else {
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        }
    }
});

// --- 間違い修正 ---
app.post('/correct-quiz', async (req, res) => {
    try {
        const { oldQuiz, reason, genre } = req.body;
        const prompt = `クイズの修正依頼です。\n【元の問題】: ${oldQuiz.question}\n【指摘】: ${reason}\n正しい事実に即した新しいクイズをJSONで出力してください。`;
        const result = await generateWithFallback([prompt], false, true);
        let text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        res.json(JSON.parse(text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1)));
    } catch (e) {
        res.status(500).json({ error: "修正できなかったにゃ…" });
    }
});

// --- なぞなぞ生成 ---
app.post('/generate-riddle', async (req, res) => {
    try {
        const { grade } = req.body;
        const prompt = `小学${grade}年生向けのなぞなぞを1問作成して。JSON: {"question":"","answer":"","accepted_answers":[]}`;
        const result = await generateWithFallback([prompt], false, true);
        let text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        res.json(JSON.parse(text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1)));
    } catch (e) { res.status(500).json({ error: "なぞなぞ失敗だにゃ" }); }
});

// --- ミニテスト生成 ---
app.post('/generate-minitest', async (req, res) => {
    try {
        const { grade, subject } = req.body;
        const prompt = `小学${grade}年生の${subject}に関する4択クイズを1問。JSON: {"question":"","options":[],"answer":"","explanation":""}`;
        const result = await generateWithFallback([prompt], false, true);
        let text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        res.json(JSON.parse(text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1)));
    } catch (e) { res.status(500).json({ error: "テスト失敗だにゃ" }); }
});

// --- 漢字ドリル生成 ---
app.post('/generate-kanji', async (req, res) => {
    try {
        const { grade, mode } = req.body; 
        let typeInstruction = mode === 'reading' ? `「読み」問題を作成。出題対象の漢字を <span style='color:red;'>漢字</span> タグで囲んで。` : "「書き取り（文章の穴埋め）」問題を作成。";
        const prompt = `小学${grade}年生で習う漢字の問題をランダムに1問作成してください。${typeInstruction} JSON: {"type":"${mode}","kanji":"正解漢字","reading":"読み","question_display":"表示文","question_speech":"読み上げ文"}`;
        const result = await generateWithFallback([prompt], false, true);
        let text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        res.json(JSON.parse(text));
    } catch (e) {
        res.status(500).json({ error: "漢字が見つからないにゃ…" });
    }
});

// --- 漢字採点 ---
app.post('/check-kanji', async (req, res) => {
    try {
        const { image, targetKanji } = req.body;
        const prompt = `これは子供の手書き漢字画像です。「${targetKanji}」として認識できるか判定してください。子供の字なので、多少の崩れは許容してください。JSON: {"is_correct": true/false, "comment": "ネル先生のコメント"}`;
        const result = await generateWithFallback([
            prompt,
            { inlineData: { mime_type: "image/png", data: image } }
        ], false, true);
        let text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        res.json(JSON.parse(text));
    } catch (e) {
        res.status(500).json({ is_correct: false, comment: "よく見えなかったにゃ…" });
    }
});

// --- チャット会話 ---
app.post('/chat-dialogue', async (req, res) => {
    try {
        let { text, name, image, history, memoryContext, currentQuizData } = req.body;
        const now = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

        let systemPrompt = `あなたは猫の「ネル先生」です。相手は「${name}」さん。現在は ${now}。語尾は必ず「〜にゃ」にしてください。`;
        if (currentQuizData) systemPrompt += `\n【重要】ユーザーは今クイズに挑戦中です。問題: ${currentQuizData.question}`;
        
        let promptParts = [systemPrompt];
        if (memoryContext) promptParts.push(`【生徒の記憶】\n${memoryContext}`);
        if (history) promptParts.push(`【会話履歴】\n${JSON.stringify(history)}`);
        promptParts.push(`ユーザー: ${text}`);
        if (image) promptParts.push({ inlineData: { mime_type: "image/jpeg", data: image } });

        const result = await generateWithFallback(promptParts, true); // チャットは検索OK
        res.json({ speech: result.response.text().trim() });
    } catch (error) {
        res.status(200).json({ speech: "ごめんにゃ、頭が回らないにゃ…。" });
    }
});

// --- Analyze (宿題分析) ---
app.post('/analyze', async (req, res) => {
    try {
        const { image, grade, subject, name } = req.body;
        const prompt = `あなたは小学${grade}年生の${name}さんの${subject}担当「ネル先生」です。宿題を解析しJSON形式で出力してください。\n${getSubjectInstructions(subject)}`;

        const result = await generateWithFallback([
            { inlineData: { mime_type: "image/jpeg", data: image } }, 
            prompt
        ], false, true);
        
        let text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        res.json(JSON.parse(text.substring(text.indexOf('['), text.lastIndexOf(']') + 1)));
    } catch (error) {
        res.status(500).json({ error: "解析失敗にゃ" });
    }
});

// --- お宝図鑑解析 (ここが重要！) ---
app.post('/identify-item', async (req, res) => {
    try {
        const { image, name, address } = req.body;
        const prompt = `
        この画像を解析して、子供向けのお宝図鑑データを作成してください。
        以下のJSON形式のみを出力してください。
        {
          "itemName": "モノの名前",
          "rarity": 1〜5の数値, 
          "description": "ネル先生（猫）の解説（語尾はにゃ）",
          "realDescription": "真面目な解説",
          "speechText": "話しかけ文"
        }
        ユーザーの現在地情報（参考）: ${address || '不明'}
        `;

        // フォールバック機能を使って解析
        // JSONを返してほしいので第3引数をtrueに
        const result = await generateWithFallback([
            prompt,
            { inlineData: { mime_type: "image/jpeg", data: image } }
        ], false, true); // 検索ツールはオフ(false)にして安定化

        let text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        
        if (start === -1 || end === -1) {
            throw new Error("JSON not found");
        }

        res.json(JSON.parse(text.substring(start, end + 1)));
    } catch (error) {
        console.error("Identify Error:", error);
        res.status(500).json({ error: "解析失敗にゃ", speechText: "よく見えなかったにゃ…もう一回お願いにゃ。" });
    }
});

// --- Memory Update ---
app.post('/update-memory', async (req, res) => {
    try {
        const { currentProfile, chatLog } = req.body;
        const prompt = `以下のプロフィールと会話ログを分析し、最新のプロフィールJSONを作成してください。\nプロフィール: ${JSON.stringify(currentProfile)}\nログ: ${chatLog}\nJSON形式: {"profile": {...}, "summary_text": "要約"}`;
        const result = await generateWithFallback([prompt], false, true);
        let text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        res.json(JSON.parse(text));
    } catch (error) {
        res.json({ profile: req.body.currentProfile, summary_text: "" });
    }
});

// --- 反応系 ---
app.post('/lunch-reaction', async (req, res) => {
    const { count, name } = req.body;
    const prompt = `ネル先生が生徒の${name}さんから給食をもらいました。面白くお礼を言って。語尾はにゃ。`;
    try {
        const result = await generateWithFallback([prompt]);
        res.json({ reply: result.response.text().trim() });
    } catch { res.json({ reply: "おいしいにゃ！" }); }
});

app.post('/game-reaction', async (req, res) => {
    const { type, name, score } = req.body;
    let prompt = "";
    if (type === 'start') prompt = `「${name}さん」がゲーム開始。応援して。`;
    else if (type === 'end') prompt = `ゲーム終了。「${name}さん」のスコアは${score}点。コメントして。`;
    try {
        const result = await generateWithFallback([prompt]);
        res.json({ reply: result.response.text().trim(), mood: "excited" });
    } catch { res.json({ reply: "ナイスにゃ！", mood: "excited" }); }
});

app.get('*', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// --- WebSocket (Realtime API) ---
const wss = new WebSocketServer({ server });
wss.on('connection', async (clientWs, req) => {
    let geminiWs = null;
    const GEMINI_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${process.env.GEMINI_API_KEY}`;
    
    clientWs.on('message', async (data) => {
        const msg = JSON.parse(data);
        if (msg.type === 'init') {
            geminiWs = new WebSocket(GEMINI_URL);
            geminiWs.on('open', () => {
                geminiWs.send(JSON.stringify({
                    setup: {
                        model: `models/${MODEL_REALTIME}`,
                        generationConfig: { responseModalities: ["AUDIO"] },
                        systemInstruction: { parts: [{ text: "あなたはネル先生だにゃ。語尾はにゃ。" }] }
                    }
                }));
                clientWs.send(JSON.stringify({ type: "server_ready" }));
            });
            geminiWs.on('message', (gData) => clientWs.send(gData));
            geminiWs.on('close', () => clientWs.close());
        } else if (geminiWs && geminiWs.readyState === WebSocket.OPEN) {
            if (msg.base64Audio) geminiWs.send(JSON.stringify({ realtimeInput: { mediaChunks: [{ mimeType: "audio/pcm;rate=16000", data: msg.base64Audio }] } }));
            if (msg.base64Image) geminiWs.send(JSON.stringify({ realtimeInput: { mediaChunks: [{ mimeType: "image/jpeg", data: msg.base64Image }] } }));
            if (msg.clientContent) geminiWs.send(JSON.stringify({ client_content: msg.clientContent }));
        }
    });

    clientWs.on('close', () => {
        if (geminiWs) geminiWs.close();
    });
});