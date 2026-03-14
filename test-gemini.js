const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf-8');
const keyMatch = env.match(/GEMINI_API_KEY="?(.*?)"?(\n|$)/);
const key = keyMatch ? keyMatch[1] : null;

const promptTemplate = "Say hello";
const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${key}`;

fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: promptTemplate }] }] })
}).then(r => r.json()).then(r => console.log(JSON.stringify(r))).catch(console.error);
