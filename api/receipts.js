import { timingSafeEqual, randomUUID } from 'node:crypto';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  // Supabase's current Secret key (sb_secret_...) is preferred. The legacy
  // service_role JWT remains supported for existing deployments.
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const usesSecretKey = key?.startsWith('sb_secret_');
  const password = process.env.APP_PASSWORD;
  if (!url || !key) return res.status(503).json({ error: 'VercelにSupabase接続情報を設定してください。' });
  const actual = Buffer.from(String(req.headers['x-app-password'] || ''));
  const expected = Buffer.from(password);
  if (password && (actual.length !== expected.length || !timingSafeEqual(actual, expected))) return res.status(401).json({ error: '設定からアプリのパスワードを入力してください。' });
  const call = async (path, method = 'GET', body, extra = {}) => {
    const authHeaders = usesSecretKey ? { apikey: key } : { apikey: key, Authorization: `Bearer ${key}` };
    const response = await fetch(`${url}${path}`, { method, headers: { ...authHeaders, 'Content-Type': 'application/json', ...extra }, body: body === undefined ? undefined : Buffer.isBuffer(body) ? body : JSON.stringify(body), signal: AbortSignal.timeout(20000) });
    const text = await response.text();
    if (!response.ok) throw new Error(`Supabase処理に失敗しました (${response.status})`);
    return text ? JSON.parse(text) : null;
  };
  try {
    if (req.method === 'GET') {
      const receipts = await call('/rest/v1/receipts?select=*,items:receipt_items(*)&order=purchase_date.desc.nullslast,created_at.desc&limit=100');
      return res.status(200).json({ receipts });
    }
    if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return res.status(405).json({ error: '未対応の操作です。' }); }
    const { receipt, items, image } = req.body || {};
    const validMoney = value => Number.isSafeInteger(value) && Math.abs(value) <= 2147483647;
    if (!receipt || typeof receipt.merchant_name !== 'string' || !receipt.merchant_name.trim() || !validMoney(receipt.total_amount) || !Array.isArray(items) || items.length > 200 || items.some(i => typeof i.name !== 'string' || !i.name.trim() || !Number.isFinite(i.quantity) || i.quantity <= 0 || !validMoney(i.amount))) return res.status(400).json({ error: '店舗名・合計・明細の入力を確認してください。' });
    if (receipt.purchase_date && (!/^\d{4}-\d{2}-\d{2}$/.test(receipt.purchase_date) || new Date(receipt.purchase_date).toISOString().slice(0,10) !== receipt.purchase_date)) return res.status(400).json({ error: '購入日を確認してください。' });
    if (!image || image.type !== 'image/jpeg' || typeof image.data !== 'string' || image.data.length > 4000000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(image.data)) return res.status(400).json({ error: '画像を選び直してください（圧縮後3MB以下）。' });
    const bytes = Buffer.from(image.data, 'base64');
    if (bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255) return res.status(400).json({ error: 'JPEG画像が必要です。' });
    const path = `${new Date().toISOString().slice(0,10)}/${randomUUID()}.jpg`;
    await call(`/storage/v1/object/receipt-images/${path}`, 'POST', bytes, { 'Content-Type': 'image/jpeg' });
    let saved;
    try {
      [saved] = await call('/rest/v1/receipts', 'POST', { merchant_name: receipt.merchant_name.trim(), purchase_date: receipt.purchase_date || null, total_amount: receipt.total_amount, notes: String(receipt.notes || '').slice(0,30000), image_url: `${url}/storage/v1/object/public/receipt-images/${path}`, currency: 'JPY' }, { Prefer: 'return=representation' });
      if (items.length) await call('/rest/v1/receipt_items', 'POST', items.map(i => ({ receipt_id: saved.id, name: i.name.trim(), quantity: i.quantity, amount: i.amount, tax_rate: 0 })));
    } catch (error) {
      let cleanupFailed = false;
      if (saved) { try { await call(`/rest/v1/receipts?id=eq.${saved.id}`, 'DELETE'); } catch { cleanupFailed = true; } }
      if (!cleanupFailed) { try { await call('/storage/v1/object/receipt-images', 'DELETE', { prefixes: [path] }); } catch { cleanupFailed = true; } }
      if (cleanupFailed) throw new Error('保存中にエラーが発生しました。一部データが残った可能性があります。再保存前に一覧とSupabaseを確認してください。');
      throw error;
    }
    return res.status(201).json({ receipt: saved });
  } catch (error) { return res.status(500).json({ error: error.message || '処理に失敗しました。' }); }
}
