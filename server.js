const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const { Resend } = require('resend');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const resend = new Resend(process.env.RESEND_API_KEY);

app.use(cors({ origin: '*' }));
app.use(express.json());

const pedidos = {};

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

const SETOR_DISPLAY = {
  'CE TA DOIDO OPEN BAR - SOLIDARIO':         { setor: 'OPEN BAR',  tipo: 'Solidário (Meia)',     valor: 80.00  },
  'CE TA DOIDO OPEN BAR - MEIA':              { setor: 'OPEN BAR',  tipo: 'Meia Entrada',         valor: 70.00  },
  'CE TA DOIDO OPEN BAR - INTEIRA SOLIDÁRIA': { setor: 'OPEN BAR',  tipo: 'Solidário (Inteira)',  valor: 150.00 },
  'CE TA DOIDO OPEN BAR - INTEIRA':           { setor: 'OPEN BAR',  tipo: 'Inteira',              valor: 140.00 },
  'CAMAROTE EXTRA VIP - SOLIDARIO':           { setor: 'EXTRA VIP', tipo: 'Solidário (Meia)',     valor: 60.00  },
  'CAMAROTE EXTRA VIP - MEIA':                { setor: 'EXTRA VIP', tipo: 'Meia Entrada',         valor: 50.00  },
  'CAMAROTE EXTRA VIP - INTEIRA SOLIDÁRIA':   { setor: 'EXTRA VIP', tipo: 'Solidário (Inteira)',  valor: 80.00  },
  'CAMAROTE EXTRA VIP - INTEIRA':             { setor: 'EXTRA VIP', tipo: 'Inteira',              valor: 70.00  },
  'AREA VIP - SOLIDARIO':                     { setor: 'ÁREA VIP',  tipo: 'Solidário (Meia)',     valor: 40.00  },
  'AREA VIP - MEIA':                          { setor: 'ÁREA VIP',  tipo: 'Meia Entrada',         valor: 30.00  },
  'AREA VIP - INTEIRA SOLIDÁRIA':             { setor: 'ÁREA VIP',  tipo: 'Solidário (Inteira)',  valor: 60.00  },
  'AREA VIP - INTEIRA':                       { setor: 'ÁREA VIP',  tipo: 'Inteira',              valor: 50.00  },
};

const PARADISE_HASH = 'pix_7e21ecf98ae4';
const PARADISE_API  = 'https://multi.paradisepags.com/api/v1/generate_api_pix.php';

// Cores em RGB para pdfkit
const NAVY   = '#1B1F6E';
const NAVY2  = '#2d35a8';
const GOLD   = '#f5c830';
const LGRAY  = '#f2f2f2';
const DGRAY  = '#333333';
const MGRAY  = '#777777';
const BORD   = '#e0e0e0';
const WHITE  = '#ffffff';

const mm = 2.8346; // 1mm em pontos

function mmToPt(v) { return v * mm; }

async function gerarPdfIngresso(comprador, setor, tipo, valor, numIngresso, totalIngressos, codigo) {
  return new Promise(async (resolve, reject) => {
    try {
      const W = mmToPt(90);
      const H = mmToPt(240);

      const IMG_H    = mmToPt(85);
      const CARD_H   = mmToPt(72);
      const FAIXA_H  = mmToPt(9);
      const FOOTER_H = mmToPt(9);
      const QR_H     = mmToPt(65);

      const footerTop = FOOTER_H;
      const qrBot     = footerTop;
      const qrTop     = qrBot + QR_H;
      const faixaBot  = qrTop + mmToPt(1);
      const faixaTop  = faixaBot + FAIXA_H;
      const cardBot   = faixaTop + mmToPt(3);
      const cardTop   = cardBot + CARD_H;
      const imgBot    = cardTop + mmToPt(2);

      const doc = new PDFDocument({ size: [W, H], margin: 0, autoFirstPage: true });
      const buffers = [];
      doc.on('data', b => buffers.push(b));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      // FUNDO
      doc.rect(0, 0, W, H).fill(LGRAY);

      // IMAGEM DO EVENTO
      const imgPath = path.join(__dirname, 'criativo.png');
      if (fs.existsSync(imgPath)) {
        try {
          doc.image(imgPath, 0, imgBot, {
            width: W,
            height: IMG_H,
            cover: [W, IMG_H],
            valign: 'bottom'
          });
        } catch(e) { console.error('Erro ao carregar imagem:', e.message); }
      }

      // Overlay escuro no topo da imagem para a logo aparecer
      doc.rect(0, imgBot + IMG_H - mmToPt(10), W, mmToPt(10))
         .fill([0, 0, 0], 0.3);

      // Logo VAI DE INGRESSO
      doc.fillColor(GOLD).font('Helvetica-Bold').fontSize(6.5)
         .text('⚡ VAI DE INGRESSO.', mmToPt(3), imgBot + IMG_H - mmToPt(6));

      // Numeração do ingresso
      doc.fillColor(WHITE).font('Helvetica').fontSize(6)
         .text(`Ingresso ${numIngresso} de ${totalIngressos}`, 0, imgBot + IMG_H - mmToPt(6),
               { width: W - mmToPt(3), align: 'right' });

      // SOMBRA DO CARD
      doc.roundedRect(mmToPt(3) + 2, cardBot - 2, W - mmToPt(6), CARD_H, 8)
         .fill('#c0c0c0');

      // CARD BRANCO
      doc.roundedRect(mmToPt(3), cardBot, W - mmToPt(6), CARD_H, 8)
         .fill(WHITE);

      // BARRA LATERAL NAVY
      doc.roundedRect(mmToPt(3), cardBot, mmToPt(1.5), CARD_H, 3)
         .fill(NAVY);

      const tx = mmToPt(8);
      const cardRight = W - mmToPt(6);

      // BADGE DO SETOR
      let y = cardTop - mmToPt(9);
      const badgeText = setor;
      const badgeW = badgeText.length * 5.5 + mmToPt(6);
      doc.roundedRect(tx, y - mmToPt(1.5), badgeW, mmToPt(7), 4).fill(NAVY);
      doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(8)
         .text(badgeText, tx + mmToPt(3), y + mmToPt(0.5));

      // TIPO DO INGRESSO
      y -= mmToPt(7);
      doc.fillColor(MGRAY).font('Helvetica').fontSize(7.5)
         .text(tipo, tx, y);

      // LINHA
      y -= mmToPt(4);
      doc.moveTo(tx, y).lineTo(cardRight - mmToPt(4), y)
         .strokeColor(BORD).lineWidth(0.4).stroke();

      // NOME DO EVENTO
      y -= mmToPt(6);
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(11)
         .text('CÊ TÁ DOIDO', tx, y);

      y -= mmToPt(5);
      doc.fillColor(MGRAY).font('Helvetica').fontSize(7.5)
         .text('Chapecó / Santa Catarina', tx, y);

      // DATA
      y -= mmToPt(5.5);
      doc.fillColor(DGRAY).font('Helvetica-Bold').fontSize(8)
         .text('Sábado, 08/08/2026  ·  17:00h', tx, y);

      // VALOR
      y -= mmToPt(6);
      doc.fillColor(MGRAY).font('Helvetica').fontSize(7.5)
         .text('Valor:', tx, y);
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(9)
         .text(`R$ ${valor.toFixed(2).replace('.', ',')}`, tx + mmToPt(14), y);

      // LINHA
      y -= mmToPt(4);
      doc.moveTo(tx, y).lineTo(cardRight - mmToPt(4), y)
         .strokeColor(BORD).lineWidth(0.4).stroke();

      // DADOS DO COMPRADOR
      y -= mmToPt(4.5);
      doc.fillColor(MGRAY).font('Helvetica').fontSize(6.8);
      doc.text(`Comprador: ${comprador.nome}`, tx, y);
      y -= mmToPt(4);
      doc.text(`CPF: ${comprador.cpf}`, tx, y);
      y -= mmToPt(4);
      doc.text(`Email: ${comprador.email}`, tx, y);
      y -= mmToPt(4);
      doc.text(`Cód.: ${codigo.substring(0, 18).toUpperCase()}...`, tx, y);

      // FAIXA DE CORTE
      const midFaixa = faixaBot + FAIXA_H / 2;
      doc.rect(0, faixaBot, W, FAIXA_H).fill(NAVY);

      // Semicírculos de perfuração
      doc.circle(0, midFaixa, mmToPt(4.5)).fill(LGRAY);
      doc.circle(W, midFaixa, mmToPt(4.5)).fill(LGRAY);

      // Linha dourada tracejada
      doc.moveTo(mmToPt(8), midFaixa)
         .lineTo(W - mmToPt(8), midFaixa)
         .strokeColor(GOLD).lineWidth(0.4).dash(6, { space: 4 }).stroke();
      doc.undash();

      // SEÇÃO QR CODE
      doc.rect(0, qrBot, W, QR_H).fill(WHITE);

      // Instrução
      const instrY = qrTop - mmToPt(5);
      doc.fillColor(DGRAY).font('Helvetica-Bold').fontSize(7.5)
         .text('Apresente o QR Code na entrada do evento', 0, instrY,
               { width: W, align: 'center' });

      // QR CODE
      const qrSize = mmToPt(44);
      const qrX = (W - qrSize) / 2;
      const areaCenterY = (qrBot + instrY) / 2;
      const qrY = areaCenterY - qrSize / 2 + mmToPt(4);

      // Borda ao redor do QR
      doc.roundedRect(qrX - mmToPt(2), qrY - mmToPt(2), qrSize + mmToPt(4), qrSize + mmToPt(4), 4)
         .fillAndStroke(WHITE, BORD);

      const qrDataUrl = await QRCode.toDataURL(codigo, { width: 300, margin: 1 });
      const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');
      doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });

      // Código abaixo do QR
      doc.fillColor(NAVY2).font('Helvetica').fontSize(6)
         .text(codigo, 0, qrY + qrSize + mmToPt(2), { width: W, align: 'center' });

      // FOOTER
      doc.rect(0, 0, W, FOOTER_H).fill(NAVY);
      doc.fillColor(GOLD).font('Helvetica-Bold').fontSize(6.5)
         .text('proshowoficial.com  •  Cê Tá Doido Chapecó 2026', 0, mmToPt(3.3),
               { width: W, align: 'center' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

async function gerarTodosIngressos(comprador, itens) {
  const individuais = [];
  for (const item of itens) {
    const info = SETOR_DISPLAY[item.nome];
    if (!info) continue;
    const qty = parseInt(item.qty) || 0;
    for (let i = 0; i < qty; i++) {
      individuais.push({
        setor: info.setor,
        tipo:  info.tipo,
        valor: info.valor,
        codigo: crypto.randomUUID(),
      });
    }
  }

  const total = individuais.length;
  const pdfs = [];
  for (let i = 0; i < total; i++) {
    const ing = individuais[i];
    const pdfBuffer = await gerarPdfIngresso(
      comprador, ing.setor, ing.tipo, ing.valor,
      i + 1, total, ing.codigo
    );
    const nomeSetor = ing.setor.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    pdfs.push({
      filename: `ingresso-${i + 1}-${nomeSetor}.pdf`,
      content: pdfBuffer.toString('base64'),
    });
  }
  return pdfs;
}

async function enviarIngressos(comprador, itens) {
  const attachments = await gerarTodosIngressos(comprador, itens);
  const total = attachments.length;

  const listaHTML = attachments.map((a, i) =>
    `<li style="margin:4px 0;color:#555;font-size:13px;">${a.filename.replace('.pdf','').replace(/-/g,' ')}</li>`
  ).join('');

  await resend.emails.send({
    from: 'Cê Tá Doido Chapecó <noreply@proshowoficial.com>',
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
          <p style="color:#555;">Seu pagamento foi confirmado. Seus <strong>${total} ingresso(s)</strong> estão anexados:</p>
          <ul style="padding-left:20px;">${listaHTML}</ul>
          <p style="color:#555;"><strong>Apresente o QR Code de cada ingresso na entrada do evento.</strong></p>
          <hr style="border:none;border-top:1px solid #eee;margin:16px 0;">
          <p style="font-size:13px;color:#555;">📅 Sábado, 08 de Agosto de 2026 às 17h</p>
          <p style="font-size:13px;color:#555;">📍 Chapecó — Santa Catarina</p>
        </div>
      </div>
    `,
    attachments,
  });

  console.log(`✅ ${total} ingresso(s) enviados para ${comprador.email}`);
}

// ── ROTA: gerar PIX ──────────────────────────────────────────────────────────
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

// ── ROTA: verificar status (polling) ─────────────────────────────────────────
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

// ── ROTA: webhook Paradise ────────────────────────────────────────────────────
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

// ── ROTA: saúde ───────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`✅ Servidor na porta ${PORT}`));
