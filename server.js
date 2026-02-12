import { GoogleGenerativeAI } from "@google/generative-ai";
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

// --- Server Log (記録用) ---
const MEMORY_FILE = path.join(__dirname, 'server_log.json');
async function appendToServerLog(name, text) {
    try {
        let data = {};
        try { data = JSON.parse(await fs.readFile(MEMORY_FILE, 'utf8')); } catch {}
        const timestamp = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
        const newLog = `[${timestamp}] ${text}`;
        let currentLogs = data[name] || [];
        currentLogs.push(newLog);
        if (currentLogs.length > 50) currentLogs = currentLogs.slice(-50);
        data[name] = currentLogs;
        await fs.writeFile(MEMORY_FILE, JSON.stringify(data, null, 2));
    } catch (e) { console.error("Log Error:", e); }
}

// ==========================================
// ★ AI Initialization (シンプル・安定版)
// ==========================================
let model;

try {
    if (!process.env.GEMINI_API_KEY) {
        console.error("⚠️ GEMINI_API_KEY が設定されていません。");
    } else {
        // 1. 初期化
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

        // 2. モデルの取得
        // 重要: apiVersion: 'v1' を指定して安定版エンドポイントを使用
        model = genAI.getGenerativeModel(
            { model: "gemini-1.5-flash" },
            { apiVersion: "v1" } 
        );
        
        console.log("✅ AI Model Initialized: gemini-1.5-flash (v1)");
    }
} catch (e) { console.error("Init Error:", e.message); }


// ==========================================
// API Endpoints
// ==========================================

// --- 宿題・画像解析 API ---
app.post('/analyze', async (req, res) => {
    try {
        const { image, mode, grade, subject, name } = req.body;
        
        // プロンプトの作成
        const prompt = `
        あなたは小学${grade}年生の${name}さんの${subject}担当の先生「ネル先生」です。
        送られてきた画像を解析し、以下のJSON形式のみで出力してください。
        解説は子供にわかるように優しく、語尾は「〜にゃ」にしてください。

        【出力JSONフォーマット】
        [
          {
            "id": 1,
            "label": "①",
            "question": "問題文を書き起こし",
            "correct_answer": ["正解"], 
            "student_answer": ["手書きの答え"],
            "is_correct": true, 
            "hints": ["ヒント1", "ヒント2"]
          }
        ]
        `;

        // 画像データを整形して送信
        const result = await model.generateContent([
            prompt,
            { inlineData: { data: image, mimeType: "image/jpeg" } }
        ]);

        const responseText = result.response.text();
        
        // JSON部分だけを取り出す処理
        let cleanText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        const firstBracket = cleanText.indexOf('[');
        const lastBracket = cleanText.lastIndexOf(']');
        if (firstBracket !== -1 && lastBracket !== -1) {
            cleanText = cleanText.substring(firstBracket, lastBracket + 1);
        }

        const jsonResponse = JSON.parse(cleanText);
        res.json(jsonResponse);

    } catch (error) {
        console.error("解析エラー:", error);
        res.status(500).json({ error: "解析に失敗したにゃ。もう一度試してにゃ。" });
    }
});

// --- チャット会話 API ---
app.post('/chat-dialogue', async (req, res) => {
    try {
        const { text, name, image, history } = req.body;
        
        let promptParts = [];
        
        // システム設定
        const systemPrompt = `あなたは猫の「ネル先生」です。相手は「${name}」さん。語尾は「〜にゃ」で、優しく話してください。`;
        promptParts.push(systemPrompt);

        // 履歴の追加
        if (history && history.length > 0) {
            const context = "【これまでの会話】\n" + history.map(h => `${h.role}: ${h.text}`).join("\n");
            promptParts.push(context);
        }

        // ユーザー入力
        promptParts.push(`ユーザー: ${text}`);

        // 画像がある場合
        if (image) {
            promptParts.push({ inlineData: { data: image, mimeType: "image/jpeg" } });
        }

        const result = await model.generateContent(promptParts);
        const responseText = result.response.text();

        res.json({ speech: responseText });

    } catch (error) {
        console.error("Chat Error:", error);
        res.status(200).json({ speech: "ごめんにゃ、ちょっと聞こえなかったにゃ。" });
    }
});

// --- クイズ生成 API ---
app.post('/generate-quiz', async (req, res) => {
    try {
        const { genre, level } = req.body;
        
        const prompt = `
        「${genre}」に関する4択クイズを1問作成してください。難易度はレベル${level}です。
        以下のJSON形式のみを出力してください。
        {
            "question": "問題文",
            "options": ["選択肢1", "選択肢2", "選択肢3", "選択肢4"],
            "answer": "正解の選択肢",
            "explanation": "解説",
            "fact_basis": "根拠"
        }
        `;

        const result = await model.generateContent(prompt);
        let text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        const firstBrace = text.indexOf('{');
        const lastBrace = text.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1) {
            text = text.substring(firstBrace, lastBrace + 1);
        }
        
        res.json(JSON.parse(text));

    } catch (e) {
        console.error("Quiz Error:", e);
        res.status(500).json({ error: "クイズが作れなかったにゃ…" });
    }
});

// --- 共通JSON生成用ヘルパー ---
async function generateSimpleJson(prompt, res) {
    try {
        const result = await model.generateContent(prompt);
        let text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        const firstBrace = text.indexOf('{');
        const lastBrace = text.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1) text = text.substring(firstBrace, lastBrace + 1);
        res.json(JSON.parse(text));
    } catch (e) {
        console.error("Gen Error:", e);
        res.status(500).json({ error: "生成エラーだにゃ" });
    }
}

// --- その他のAPI ---
app.post('/generate-riddle', async (req, res) => {
    const { grade } = req.body;
    const prompt = `小学${grade}年生向けのなぞなぞを1問作成してください。JSON形式: {"question":"問題","answer":"答え","accepted_answers":["別解"]}`;
    await generateSimpleJson(prompt, res);
});

app.post('/generate-minitest', async (req, res) => {
    const { grade, subject } = req.body;
    const prompt = `小学${grade}年生の${subject}の4択問題を1問作成してください。JSON形式: {"question":"問題","options":["A","B","C","D"],"answer":"正解","explanation":"解説"}`;
    await generateSimpleJson(prompt, res);
});

app.post('/generate-kanji', async (req, res) => {
    const { grade, mode } = req.body;
    const prompt = `小学${grade}年生の漢字の${mode === 'reading' ? '読み' : '書き取り'}問題を1問作成してください。JSON形式: {"type":"${mode}","kanji":"正解漢字","reading":"読み","question_display":"表示文","question_speech":"読み上げ文"}`;
    await generateSimpleJson(prompt, res);
});

app.post('/identify-item', async (req, res) => {
    try {
        const { image } = req.body;
        const prompt = `
        この画像を解析し、以下のJSON形式で答えてください。
        {"itemName":"名称","rarity":1,"description":"ネル先生の解説","realDescription":"本当の解説","speechText":"読み上げ文"}
        レアリティは1〜5の数値。解説は猫語で。
        `;
        const result = await model.generateContent([
            prompt,
            { inlineData: { data: image, mimeType: "image/jpeg" } }
        ]);
        let text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        const firstBrace = text.indexOf('{');
        const lastBrace = text.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1) text = text.substring(firstBrace, lastBrace + 1);
        res.json(JSON.parse(text));
    } catch(e) {
        console.error("Identify Error:", e);
        res.status(500).json({ error: "解析失敗" });
    }
});

// --- 反応系 ---
app.post('/lunch-reaction', async (req, res) => {
    const prompt = "給食をもらいました。猫として喜んでください。一言で。";
    try {
        const result = await model.generateContent(prompt);
        res.json({ reply: result.response.text() });
    } catch { res.json({ reply: "おいしいにゃ！" }); }
});

app.post('/game-reaction', async (req, res) => {
    const prompt = "ゲームの結果について猫の先生として一言コメントして。ポジティブに。";
    try {
        const result = await model.generateContent(prompt);
        res.json({ reply: result.response.text() });
    } catch { res.json({ reply: "ナイスだにゃ！" }); }
});

app.get('*', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// --- WebSocket (簡易維持) ---
const wss = new WebSocketServer({ server });
wss.on('connection', (ws) => {
    ws.on('message', () => {}); 
    ws.send(JSON.stringify({ type: "server_ready" }));
});