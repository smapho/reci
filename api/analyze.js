export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const password = process.env.APP_PASSWORD;
  if (password && req.headers['x-app-password'] !== password) return res.status(401).json({ error: 'パスワードが違います。' });
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'GOOGLE_GENERATIVE_AI_API_KEY が未設定です。' });
  const image = req.body?.image;
  if (!image?.data || image.type !== 'image/jpeg') return res.status(400).json({ error: 'JPEG画像が必要です。' });
  const prompt = '日本のレシート画像を正確に読み取り、JSONだけを返してください。形式: {"merchant_name":"","purchase_date":"YYYY-MM-DDまたは空","total_amount":0,"items":[{"name":"","quantity":1,"amount":0,"tax_rate":0}],"notes":"OCR全文"}。読めない値は空文字または0、tax_rateは8、10、不明は0、値引きは負数です。';
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ contents:[{parts:[{inline_data:{mime_type:'image/jpeg',data:image.data}},{text:prompt}]}], generationConfig:{responseMimeType:'application/json',temperature:0.1} }), signal:AbortSignal.timeout(60000) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error?.message || 'Geminiの読み取りに失敗しました。');
    const text = data.candidates?.[0]?.content?.parts?.find(p=>p.text)?.text; if (!text) throw new Error('Geminiから結果が返りませんでした。');
    const result = JSON.parse(text.replace(/^```json\s*|\s*```$/g,'')); return res.status(200).json({ result });
  } catch (error) { return res.status(500).json({ error:error.message || '解析に失敗しました。' }); }
}
