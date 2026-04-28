const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const { Resend } = require('resend');
const { execFile } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;
const resend = new Resend(process.env.RESEND_API_KEY);

app.use(cors({ origin: '*' }));
app.use(express.json());

// ── Pedidos em memória ──────────────────────────────────────────────────────
const pedidos = {};

// ── Tabela de preços ────────────────────────────────────────────────────────
const PRECOS = {
  'CE TA DOIDO OPEN BAR - SOLIDARIO':         { valor: 80.00,  taxa: 12.00 },
  'CE TA DOIDO OPEN BAR - MEIA':              { valor: 70.00,  taxa: 10.50 },
  'CE TA DOIDO OPEN BAR - INTEIRA SOLIDÁRIA': { valor: 150.00, taxa: 22.50 },
  'CE TA DOIDO OPEN BAR - INTEIRA':           { valor: 140.00, taxa: 21.00 },
  'CAMAROTE EXTRA VIP - SOLIDARIO':           { valor: 60.00,  taxa: 9.00  },
  'CAMAROTE EXTRA VIP - MEIA':                { valor: 50.00,  taxa: 7.50  },
  'CAMAROTE EXTRA VIP - INTEIRA SOLIDÁRIA':   { valor: 80.00,  taxa: 12.00 },
  'CAMAROTE EXTRA VIP - INTEIRA':             { valor: 70.00,  taxa: 10.50 },
  'AREA VIP - SOLIDARIO':                     { valor: 40.00,  taxa: 6.00  },
  'AREA VIP - MEIA':                          { valor: 30.00,  taxa: 4.50  },
  'AREA VIP - INTEIRA SOLIDÁRIA':             { valor: 60.00,  taxa: 9.00  },
  'AREA VIP - INTEIRA':                       { valor: 50.00,  taxa: 7.50  },
};

const PARADISE_HASH = 'pix_7e21ecf98ae4';
const PARADISE_API  = 'https://multi.paradisepags.com/api/v1/generate_api_pix.php';

// ── Gerar ingressos via Python ──────────────────────────────────────────────
function gerarIngressosPython(comprador, itens) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ comprador, itens });
    const scriptPath = path.join(__dirname, 'gerar_ingresso.py');

    execFile('python3', [scriptPath], { input: payload, maxBuffer: 20 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) return reject(new Error(stderr || err.message));
        try {
          const resultado = JSON.parse(stdout);
          resolve(resultado); // array de { nome, base64 }
        } catch (e) {
          reject(new Error('Erro ao parsear output do Python: ' + stdout.substring(0, 200)));
        }
      }
    );
  });
}

// ── Enviar ingressos por email ──────────────────────────────────────────────
async function enviarIngressos(comprador, itens) {
  const pdfs = await gerarIngressosPython(comprador, itens);
  const totalIngressos = pdfs.length;

  const attachments = pdfs.map(p => ({
    filename: p.nome,
    content: p.base64,
  }));

  const listaHTML = pdfs.map(p =>
    `<li style="margin:4px 0;color:#555;font-size:13px;">${p.nome.replace('.pdf','').replace(/-/g,' ')}</li>`
  ).join('');

  await resend.emails.send({
    from: 'Cê Tá Doido Chapecó <onboarding@resend.dev>',
    to: comprador.email,
    subject: `🎟️ Seus ingressos — Cê Tá Doido Chapecó 08/08/2026`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;">
        <div style="background:#1B1F6E;padding:24px;border-radius:8px 8px 0 0;">
          <h1 style="color:#fff;margin:0;font-size:22px;">Cê Tá Doido — Chapecó</h1>
          <p style="color:rgba(255,255,255,0.7);margin:6px 0 0;font-size:14px;">08 de Agosto de 2026 · 17h</p>
        </div>
        <div style="background:#f9f9f9;padding:24px;border-radius:0 0 8px 8px;">
          <p style="font-size:16px;margin-top:0;">Olá, <strong>${comprador.nome}</strong>! 🎉</p>
          <p style="color:#555;">Seu pagamento foi confirmado. Seus <strong>${totalIngressos} ingresso(s)</strong> estão anexados neste email:</p>
          <ul style="padding-left:20px;">${listaHTML}</ul>
          <p style="color:#555;"><strong>Apresente o QR Code de cada ingresso na entrada do evento.</strong></p>
          <hr style="border:none;border-top:1px solid #eee;margin:16px 0;">
          <p style="font-size:13px;color:#555;">📅 Sábado, 08 de Agosto de 2026 às 17h</p>
          <p style="font-size:13px;color:#555;">📍 Chapecó — Santa Catarina</p>
          <hr style="border:none;border-top:1px solid #eee;margin:16px 0;">
          <p style="font-size:11px;color:#999;">Verifique sua caixa de entrada e spam caso não encontre os anexos.</p>
        </div>
      </div>
    `,
    attachments,
  });

  console.log(`✅ ${totalIngressos} ingresso(s) enviados para ${comprador.email}`);
}

// ── ROTA: gerar PIX ─────────────────────────────────────────────────────────
app.post('/api/gerar-pix', async (req, res) => {
  try {
    const { itens, comprador } = req.body;

    if (!itens || !Array.isArray(itens) || itens.length === 0)
      return res.status(400).json({ erro: 'Nenhum item informado.' });

    let totalCentavos = 0;
    for (const item of itens) {
      const preco = PRECOS[item.nome];
      if (!preco) return res.status(400).json({ erro: `Ingresso inválido: ${item.nome}` });
      const qty = parseInt(item.qty) || 0;
      if (qty <= 0) continue;
      totalCentavos += Math.round((preco.valor + preco.taxa) * qty * 100);
    }

    if (totalCentavos <= 0)
      return res.status(400).json({ erro: 'Total inválido.' });

    const paradiseResp = await fetch(PARADISE_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hash: PARADISE_HASH, amount: String(totalCentavos) })
    });

    const data = await paradiseResp.json();

    if (!data.success || !data.qr_code)
      return res.status(502).json({ erro: 'Erro ao gerar PIX.', detalhe: data });

    pedidos[data.transaction_id] = { comprador, itens, enviado: false };

    return res.json({
      sucesso: true,
      qr_code: data.qr_code,
      transaction_id: data.transaction_id,
      total_reais: (totalCentavos / 100).toFixed(2)
    });

  } catch (err) {
    console.error('Erro /api/gerar-pix:', err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

// ── ROTA: verificar status (polling) ────────────────────────────────────────
app.get('/api/status/:transaction_id', async (req, res) => {
  try {
    const { transaction_id } = req.params;
    const resp = await fetch(
      `https://multi.paradisepags.com/api/v1/check_transaction.php?transaction_id=${transaction_id}`
    );
    const data = await resp.json();
    const pago = data.status === 'approved' || data.status === 'paid';

    if (pago && pedidos[transaction_id] && !pedidos[transaction_id].enviado) {
      pedidos[transaction_id].enviado = true;
      const { comprador, itens } = pedidos[transaction_id];
      enviarIngressos(comprador, itens).catch(err =>
        console.error('Erro ao enviar ingressos:', err)
      );
    }

    res.json({ pago, status: data.status });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao verificar status.' });
  }
});

// ── ROTA: webhook Paradise (backup) ─────────────────────────────────────────
app.post('/api/webhook', async (req, res) => {
  try {
    const { transaction_id, status } = req.body;
    const pago = status === 'approved' || status === 'paid';

    if (pago && pedidos[transaction_id] && !pedidos[transaction_id].enviado) {
      pedidos[transaction_id].enviado = true;
      const { comprador, itens } = pedidos[transaction_id];
      enviarIngressos(comprador, itens).catch(err =>
        console.error('Erro webhook ingressos:', err)
      );
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ erro: 'Erro no webhook.' });
  }
});

// ── ROTA: teste de email ──────────────────────────────────────────────────────
app.post('/api/test-email', async (req, res) => {
  try {
    const comprador = { nome: 'Kaique Antoniolli', cpf: '000.000.000-00', email: 'kaiqueantoniolli@gmail.com' };
    const itens = [
      { nome: 'CE TA DOIDO OPEN BAR - INTEIRA', qty: 1 },
      { nome: 'AREA VIP - MEIA', qty: 1 }
    ];
    await enviarIngressos(comprador, itens);
    res.json({ ok: true, mensagem: 'Email enviado!' });
  } catch (err) {
    res.status(500).json({ erro: err.message, stack: err.stack });
  }
});
// ── ROTA: saúde ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`✅ Servidor na porta ${PORT}`));
