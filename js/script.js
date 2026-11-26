/* QRCodeGen — monta o conteúdo, desenha o QR Code e exporta PNG/SVG */

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const escapar = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const banco = {
  ler(k, padrao) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? padrao; } catch { return padrao; } },
  salvar(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem storage */ } }
};

const PALETAS = [['#111827', '#ffffff'], ['#4c1d95', '#f5f3ff'], ['#065f46', '#ecfdf5'], ['#9a3412', '#fff7ed'], ['#1e3a8a', '#eff6ff'], ['#be123c', '#fff1f2'], ['#ffffff', '#111827']];
let tipo = 'link', atual = null, historico = banco.ler('qr_hist', []);

/* ---------- Conteúdo de cada tipo ---------- */
const v = (id) => $('#' + id).value.trim();
const escWifi = (s) => s.replace(/([\\;,:"])/g, '\\$1');
const escVcard = (s) => s.replace(/([\\;,])/g, '\\$1').replace(/\n/g, '\\n');
function montar() {
  switch (tipo) {
    case 'link': {
      let u = v('c-link'); if (!u) return { erro: 'Digite o endereço do site.' };
      if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = 'https://' + u;
      try { new URL(u); } catch { return { erro: 'Esse endereço não parece válido.' }; }
      return { texto: u, rotulo: u.replace(/^https?:\/\//, '').replace(/\/$/, '') };
    }
    case 'texto': { const t = $('#c-texto').value; return t.trim() ? { texto: t, rotulo: t.slice(0, 30) } : { erro: 'Escreva um texto.' }; }
    case 'whatsapp': {
      const ddi = v('c-wa-ddi').replace(/\D/g, ''), num = v('c-wa-num').replace(/\D/g, '');
      if (num.length < 8) return { erro: 'Digite o número com DDD.' };
      const msg = v('c-wa-msg');
      return { texto: `https://wa.me/${ddi}${num}${msg ? `?text=${encodeURIComponent(msg)}` : ''}`, rotulo: `WhatsApp ${num}` };
    }
    case 'wifi': {
      const ssid = v('c-wifi-ssid'), t = $('#c-wifi-tipo').value, senha = $('#c-wifi-senha').value;
      if (!ssid) return { erro: 'Digite o nome da rede.' };
      if (t !== 'nopass' && !senha) return { erro: 'Digite a senha da rede (ou escolha “Sem senha”).' };
      return { texto: `WIFI:T:${t};S:${escWifi(ssid)};${t !== 'nopass' ? `P:${escWifi(senha)};` : ''}${$('#c-wifi-oculta').checked ? 'H:true;' : ''};`, rotulo: `Wi-Fi ${ssid}` };
    }
    case 'contato': {
      const n = v('c-ct-nome'), s = v('c-ct-sobre');
      if (!n && !s) return { erro: 'Digite pelo menos o nome.' };
      const l = ['BEGIN:VCARD', 'VERSION:3.0', `N:${escVcard(s)};${escVcard(n)};;;`, `FN:${escVcard(`${n} ${s}`.trim())}`];
      if (v('c-ct-tel')) l.push(`TEL;TYPE=CELL:${v('c-ct-tel')}`);
      if (v('c-ct-email')) l.push(`EMAIL:${v('c-ct-email')}`);
      if (v('c-ct-emp')) l.push(`ORG:${escVcard(v('c-ct-emp'))}`);
      if (v('c-ct-cargo')) l.push(`TITLE:${escVcard(v('c-ct-cargo'))}`);
      if (v('c-ct-site')) l.push(`URL:${v('c-ct-site')}`);
      l.push('END:VCARD');
      return { texto: l.join('\n'), rotulo: `${n} ${s}`.trim() };
    }
    case 'email': {
      const para = v('c-em-para'); if (!para) return { erro: 'Digite o e-mail de destino.' };
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(para)) return { erro: 'Esse e-mail não parece válido.' };
      const q = [];
      if (v('c-em-assunto')) q.push(`subject=${encodeURIComponent(v('c-em-assunto'))}`);
      if (v('c-em-corpo')) q.push(`body=${encodeURIComponent(v('c-em-corpo'))}`);
      return { texto: `mailto:${para}${q.length ? '?' + q.join('&') : ''}`, rotulo: para };
    }
  }
}

/* ---------- Desenho ---------- */
function luminancia(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contraste(a, b) { const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); }
const opcoes = () => ({ frente: $('#cor-frente').value, fundo: $('#cor-fundo').value, forma: document.querySelector('[name=forma]:checked').value, margem: $('#margem').checked ? 4 : 1, nivel: $('#nivel').value });

// desenha a matriz em qualquer canvas, no tamanho pedido
function desenharQR(cv, qr, op, px) {
  const n = qr.tamanho + op.margem * 2, m = px / n, ctx = cv.getContext('2d');
  cv.width = cv.height = px;
  ctx.fillStyle = op.fundo; ctx.fillRect(0, 0, px, px);
  ctx.fillStyle = op.frente;
  const ehOlho = (x, y) => (x < 7 && y < 7) || (x >= qr.tamanho - 7 && y < 7) || (x < 7 && y >= qr.tamanho - 7);
  for (let y = 0; y < qr.tamanho; y++) for (let x = 0; x < qr.tamanho; x++) {
    if (!qr.escuro(x, y)) continue;
    const X = (x + op.margem) * m, Y = (y + op.margem) * m;
    if (op.forma === 'quadrado' || ehOlho(x, y)) { ctx.fillRect(Math.floor(X), Math.floor(Y), Math.ceil(m + (X % 1)), Math.ceil(m + (Y % 1))); continue; }
    ctx.beginPath();
    if (op.forma === 'ponto') ctx.arc(X + m / 2, Y + m / 2, m * 0.42, 0, Math.PI * 2);
    else ctx.roundRect(X + m * 0.04, Y + m * 0.04, m * 0.92, m * 0.92, m * 0.32);
    ctx.fill();
  }
  if (op.forma !== 'quadrado') {
    // olhos com cantos arredondados
    [[0, 0], [qr.tamanho - 7, 0], [0, qr.tamanho - 7]].forEach(([ox, oy]) => {
      const X = (ox + op.margem) * m, Y = (oy + op.margem) * m;
      ctx.fillStyle = op.fundo; ctx.fillRect(X - 1, Y - 1, 7 * m + 2, 7 * m + 2);
      ctx.fillStyle = op.frente; ctx.beginPath(); ctx.roundRect(X, Y, 7 * m, 7 * m, m * 1.8); ctx.fill();
      ctx.fillStyle = op.fundo; ctx.beginPath(); ctx.roundRect(X + m, Y + m, 5 * m, 5 * m, m * 1.2); ctx.fill();
      ctx.fillStyle = op.frente; ctx.beginPath(); ctx.roundRect(X + 2 * m, Y + 2 * m, 3 * m, 3 * m, m * 0.9); ctx.fill();
    });
  }
}
function svgQR(qr, op) {
  const n = qr.tamanho + op.margem * 2;
  let p = '';
  for (let y = 0; y < qr.tamanho; y++) for (let x = 0; x < qr.tamanho; x++) if (qr.escuro(x, y)) {
    const X = x + op.margem, Y = y + op.margem;
    p += op.forma === 'ponto' ? `<circle cx="${X + 0.5}" cy="${Y + 0.5}" r="0.42"/>` : op.forma === 'arredondado' ? `<rect x="${X + 0.04}" y="${Y + 0.04}" width="0.92" height="0.92" rx="0.32"/>` : `<rect x="${X}" y="${Y}" width="1.02" height="1.02"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="${op.forma === 'quadrado' ? 'crispEdges' : 'geometricPrecision'}"><rect width="${n}" height="${n}" fill="${op.fundo}"/><g fill="${op.frente}">${p}</g></svg>`;
}

let timerHist;
function atualizar() {
  const c = montar(), op = opcoes();
  $('#aviso').textContent = '';
  $('#moldura').style.background = op.fundo;
  if (!c || c.erro) { atual = null; $('#aviso').textContent = c?.erro || ''; $('#info').textContent = ''; $('#conteudo').textContent = ''; limparCanvas(); return; }
  let qr;
  try { qr = QR.gerar(c.texto, op.nivel); } catch (e) { atual = null; $('#aviso').textContent = 'Conteúdo grande demais para um QR Code. Diminua o texto ou use correção baixa.'; limparCanvas(); return; }
  atual = { ...c, qr, op };
  desenharQR($('#canvas'), qr, op, 640);
  $('#info').textContent = `Versão ${qr.versao} · ${qr.tamanho}×${qr.tamanho} módulos · ${qr.bytes} bytes`;
  $('#conteudo').textContent = c.texto;
  const ct = contraste(op.frente, op.fundo);
  if (ct < 3) $('#aviso').textContent = '⚠️ Pouco contraste entre as cores: muitas câmeras não vão conseguir ler.';
  else if (luminancia(op.frente) > luminancia(op.fundo)) $('#aviso').textContent = '⚠️ Código claro em fundo escuro: alguns leitores antigos não leem cores invertidas.';
  if (c.texto.length > 800) $('#aviso').textContent += (($('#aviso').textContent ? ' ' : '') + 'Conteúdo longo deixa o código denso — teste antes de imprimir.');
  clearTimeout(timerHist); timerHist = setTimeout(guardarHistorico, 1500);
}
function limparCanvas() { const cv = $('#canvas'); cv.width = cv.height = 320; const ctx = cv.getContext('2d'); ctx.fillStyle = '#f1f1f6'; ctx.fillRect(0, 0, 320, 320); ctx.fillStyle = '#b8b8c8'; ctx.font = '600 16px Sora, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('Preencha os campos', 160, 165); }

/* ---------- Histórico ---------- */
function guardarHistorico() {
  if (!atual) return;
  const item = { tipo, texto: atual.texto, rotulo: atual.rotulo, campos: lerCampos(), op: atual.op };
  historico = [item, ...historico.filter((h) => h.texto !== item.texto)].slice(0, 8);
  banco.salvar('qr_hist', historico); desenharHistorico();
}
function desenharHistorico() {
  $('#hist').innerHTML = historico.length ? historico.map((h, i) => `<li><button data-h="${i}" title="${escapar(h.texto)}"><canvas width="70" height="70"></canvas><span>${escapar(h.rotulo)}</span></button></li>`).join('') : '<li class="vazio">Os códigos que você gerar aparecem aqui.</li>';
  $$('#hist canvas').forEach((cv, i) => { try { desenharQR(cv, QR.gerar(historico[i].texto, historico[i].op.nivel), historico[i].op, 140); } catch { /* ignora */ } });
}
const IDS = ['c-link', 'c-texto', 'c-wa-ddi', 'c-wa-num', 'c-wa-msg', 'c-wifi-ssid', 'c-wifi-senha', 'c-wifi-tipo', 'c-wifi-oculta', 'c-ct-nome', 'c-ct-sobre', 'c-ct-tel', 'c-ct-email', 'c-ct-emp', 'c-ct-cargo', 'c-ct-site', 'c-em-para', 'c-em-assunto', 'c-em-corpo'];
const lerCampos = () => Object.fromEntries(IDS.map((id) => [id, $('#' + id).type === 'checkbox' ? $('#' + id).checked : $('#' + id).value]));
$('#hist').addEventListener('click', (e) => {
  const b = e.target.closest('[data-h]'); if (!b) return;
  const h = historico[+b.dataset.h];
  Object.entries(h.campos).forEach(([id, val]) => { const el = $('#' + id); if (!el) return; if (el.type === 'checkbox') el.checked = val; else el.value = val; });
  $('#cor-frente').value = h.op.frente; $('#cor-fundo').value = h.op.fundo; $('#nivel').value = h.op.nivel; $('#margem').checked = h.op.margem === 4;
  document.querySelector(`[name=forma][value=${h.op.forma}]`).checked = true;
  trocarTipo(h.tipo);
});

/* ---------- Eventos ---------- */
function trocarTipo(t) {
  tipo = t;
  $$('[data-tipo]').forEach((b) => b.setAttribute('aria-selected', b.dataset.tipo === t));
  $$('[data-campos]').forEach((d) => { d.hidden = d.dataset.campos !== t; });
  atualizarHex(); atualizar();
}
$$('[data-tipo]').forEach((b) => b.addEventListener('click', () => { trocarTipo(b.dataset.tipo); $(`[data-campos="${b.dataset.tipo}"] input, [data-campos="${b.dataset.tipo}"] textarea`)?.focus(); }));
$('#form').addEventListener('input', atualizar);
$('#form').addEventListener('change', atualizar);
$('#form').addEventListener('submit', (e) => e.preventDefault());
$('#c-texto').addEventListener('input', (e) => { $('#cont-texto').textContent = `${e.target.value.length}/1500`; });
function atualizarHex() { $('#hex-frente').textContent = $('#cor-frente').value; $('#hex-fundo').textContent = $('#cor-fundo').value; }
['cor-frente', 'cor-fundo', 'nivel', 'margem'].forEach((id) => $('#' + id).addEventListener('input', () => { atualizarHex(); atualizar(); }));
$$('[name=forma]').forEach((r) => r.addEventListener('change', atualizar));
$('#paletas').innerHTML = PALETAS.map(([a, b]) => `<button type="button" style="--a:${a};--b:${b}" data-pal="${a},${b}" aria-label="Cores ${a} e ${b}"></button>`).join('');
$('#paletas').addEventListener('click', (e) => { const b = e.target.closest('[data-pal]'); if (!b) return; const [a, c] = b.dataset.pal.split(','); $('#cor-frente').value = a; $('#cor-fundo').value = c; atualizarHex(); atualizar(); });
$('#tam').addEventListener('input', (e) => { $('#tam-val').textContent = `${e.target.value} px`; });

function nomeArquivo(ext) { return `qrcode-${(atual.rotulo || tipo).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'codigo'}.${ext}`; }
function baixar(href, nome) { const a = document.createElement('a'); a.href = href; a.download = nome; a.click(); }
$('#baixar-png').addEventListener('click', () => {
  if (!atual) { toast('Preencha os campos primeiro'); return; }
  const cv = document.createElement('canvas'); desenharQR(cv, atual.qr, atual.op, +$('#tam').value);
  baixar(cv.toDataURL('image/png'), nomeArquivo('png')); guardarHistorico(); toast('PNG baixado');
});
$('#baixar-svg').addEventListener('click', () => {
  if (!atual) { toast('Preencha os campos primeiro'); return; }
  const url = URL.createObjectURL(new Blob([svgQR(atual.qr, atual.op)], { type: 'image/svg+xml' }));
  baixar(url, nomeArquivo('svg')); setTimeout(() => URL.revokeObjectURL(url), 1000); guardarHistorico(); toast('SVG baixado');
});
$('#copiar').addEventListener('click', async () => {
  if (!atual) { toast('Preencha os campos primeiro'); return; }
  try {
    const cv = document.createElement('canvas'); desenharQR(cv, atual.qr, atual.op, +$('#tam').value);
    const blob = await new Promise((ok) => cv.toBlob(ok, 'image/png'));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); toast('Imagem copiada');
  } catch { toast('Seu navegador não permite copiar imagens — use o download'); }
});

let timerToast;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(timerToast); timerToast = setTimeout(() => { t.hidden = true; }, 2200); }

desenharHistorico();
trocarTipo('link');
