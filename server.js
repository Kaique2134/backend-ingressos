const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const { Resend } = require('resend');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const resend = new Resend(process.env.RESEND_API_KEY);

app.use(cors({ origin: '*' }));
app.use(express.json());

// ── Pedidos em memória ──
const pedidos = {};

// ── Tabela de preços ──
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

// ── Gerar PDF do ingresso ──
async function gerarIngresso(comprador, itens, codigoIngresso) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: [400, 600], margin: 30 });
      const buffers = [];
      doc.on('data', b => buffers.push(b));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      // QR Code único
      const qrDataUrl = await QRCode.toDataURL(codigoIngresso, { width: 150 });
      const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');

      // Header
      doc.fillColor('#1B1F6E').rect(0, 0, 400, 80).fill();
      doc.fillColor('#ffffff').fontSize(22).font('Helvetica-Bold')
         .text('CÊ TÁ DOIDO', 30, 20);
      doc.fontSize(11).font('Helvetica')
         .text('Chapecó/SC — 08 de Agosto de 2026 · 17h', 30, 50);

      // Linha separadora
      doc.fillColor('#f5c830').rect(0, 80, 400, 4).fill();

      // Dados do comprador
      doc.fillColor('#1B1F6E').fontSize(10).font('Helvetica-Bold')
         .text('DADOS DO COMPRADOR', 30, 100);
      doc.fillColor('#333333').fontSize(11).font('Helvetica')
         .text(`Nome: ${comprador.nome}`, 30, 118)
         .text(`CPF: ${comprador.cpf}`, 30, 136)
         .text(`Email: ${comprador.email}`, 30, 154);

      // Ingressos
      doc.fillColor('#1B1F6E').fontSize(10).font('Helvetica-Bold')
         .text('INGRESSOS', 30, 182);
      let y = 200;
      for (const item of itens) {
        doc.fillColor('#333333').fontSize(11).font('Helvetica')
           .text(`• ${item.nome} (x${item.qty})`, 30, y);
        y += 18;
      }

      // QR Code
      doc.image(qrBuffer, 125, y + 20, { width: 150 });
      doc.fillColor('#666666').fontSize(10)
         .text('Apresente este QR Code na entrada do evento', 30, y + 180, { align: 'center', width: 340 });

      // Código
      doc.fillColor('#999999').fontSize(9)
         .text(`Código: ${codigoIngresso}`, 30, y + 200, { align: 'center', width: 340 });

      // Footer
      doc.fillColor('#1B1F6E').rect(0, 560, 400, 40).fill();
      doc.fillColor('#ffffff').fontSize(10)
         .text('proshowoficial.com', 30, 572, { align: 'center', width: 340 });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// ── Enviar ingresso por email ──
async function enviarIngresso(comprador, itens) {
  const codigoIngresso = crypto.randomUUID();
  const pdfBuffer = await gerarIngresso(comprador, itens, codigoIngresso);

  await resend.emails.send({
    from: 'Cê Tá Doido Chapecó <onboarding@resend.dev>',
    to: comprador.email,
    subject: '🎟️ Seu ingresso — Cê Tá Doido Chapecó 08/08/2026',
    html: `
      <div style="font-family:sans-serif;max-width:500px;margin:0 auto;">
        <div style="background:#1B1F6E;padding:24px;border-radius:8px 8px 0 0;">
          <h1 style="color:#fff;margin:0;font-size:22px;">Cê Tá Doido — Chapecó</h1>
          <p style="color:rgba(255,255,255,0.7);margin:6px 0 0;font-size:14px;">08 de Agosto de 2026 · 17h</p>
        </div>
        <div style="background:#f9f9f9;padding:24px;border-radius:0 0 8px 8px;">
          <p style="font-size:16px;margin-top:0;">Olá, <strong>${comprador.nome}</strong>! 🎉</p>
          <p>Seu pagamento foi confirmado. O ingresso está anexado neste email em PDF.</p>
          <p><strong>Apresente o QR Code na entrada do evento.</strong></p>
          <hr style="border:none;border-top:1px solid #eee;margin:16px 0;">
          <p style="font-size:13px;color:#555;">📅 Data: 08 de Agosto de 2026 às 17h</p>
          <p style="font-size:13px;color:#555;">📍 Local: Chapecó — Santa Catarina</p>
          <hr style="border:none;border-top:1px solid #eee;margin:16px 0;">
          <p style="font-size:11px;color:#999;">Código do ingresso: ${codigoIngresso}</p>
        </div>
      </div>
    `,
    attachments: [{
      filename: `ingresso-ce-ta-doido-${comprador.nome.replace(/\s+/g, '-').toLowerCase()}.pdf`,
      content: pdfBuffer.toString('base64'),
    }]
  });
}

// ── ROTA: gerar PIX ──
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

    // Salvar pedido aguardando confirmação
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

// ── ROTA: verificar status (polling do frontend) ──
app.get('/api/status/:transaction_id', async (req, res) => {
  try {
    const { transaction_id } = req.params;
    const resp = await fetch(
      `https://multi.paradisepags.com/api/v1/check_transaction.php?transaction_id=${transaction_id}`
    );
    const data = await resp.json();
    const pago = data.status === 'approved' || data.status === 'paid';

    // Se pago e ainda não enviou — envia agora
    if (pago && pedidos[transaction_id] && !pedidos[transaction_id].enviado) {
      pedidos[transaction_id].enviado = true;
      const { comprador, itens } = pedidos[transaction_id];
      enviarIngresso(comprador, itens).catch(err =>
        console.error('Erro ao enviar ingresso:', err)
      );
    }

    res.json({ pago, status: data.status });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao verificar status.' });
  }
});

// ── ROTA: webhook da Paradise (backup) ──
app.post('/api/webhook', async (req, res) => {
  try {
    const { transaction_id, status } = req.body;
    const pago = status === 'approved' || status === 'paid';

    if (pago && pedidos[transaction_id] && !pedidos[transaction_id].enviado) {
      pedidos[transaction_id].enviado = true;
      const { comprador, itens } = pedidos[transaction_id];
      enviarIngresso(comprador, itens).catch(err =>
        console.error('Erro webhook ingresso:', err)
      );
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ erro: 'Erro no webhook.' });
  }
});

// ── ROTA: saúde ──
app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`✅ Servidor na porta ${PORT}`));
