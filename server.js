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
  'CE TA DOIDO OPEN BAR - INTEIRA SOLIDARIA': { valor: 150.00, taxa: 22.50 },
  'CE TA DOIDO OPEN BAR - INTEIRA':           { valor: 140.00, taxa: 21.00 },
  'CAMAROTE EXTRA VIP - SOLIDARIO':           { valor: 60.00,  taxa: 9.00  },
  'CAMAROTE EXTRA VIP - MEIA':                { valor: 50.00,  taxa: 7.50  },
  'CAMAROTE EXTRA VIP - INTEIRA SOLIDARIA':   { valor: 80.00,  taxa: 12.00 },
  'CAMAROTE EXTRA VIP - INTEIRA':             { valor: 70.00,  taxa: 10.50 },
  'AREA VIP - SOLIDARIO':                     { valor: 40.00,  taxa: 6.00  },
  'AREA VIP - MEIA':                          { valor: 30.00,  taxa: 4.50  },
  'AREA VIP - INTEIRA SOLIDARIA':             { valor: 60.00,  taxa: 9.00  },
  'AREA VIP - INTEIRA':                       { valor: 50.00,  taxa: 7.50  },
};

const SETOR_DISPLAY = {
  'CE TA DOIDO OPEN BAR - SOLIDARIO':         { setor: 'OPEN BAR',  tipo: 'Solidario (Meia)',    valor: 80.00  },
  'CE TA DOIDO OPEN BAR - MEIA':              { setor: 'OPEN BAR',  tipo: 'Meia Entrada',        valor: 70.00  },
  'CE TA DOIDO OPEN BAR - INTEIRA SOLIDARIA': { setor: 'OPEN BAR',  tipo: 'Solidario (Inteira)', valor: 150.00 },
  'CE TA DOIDO OPEN BAR - INTEIRA':           { setor: 'OPEN BAR',  tipo: 'Inteira',             valor: 140.00 },
  'CAMAROTE EXTRA VIP - SOLIDARIO':           { setor: 'EXTRA VIP', tipo: 'Solidario (Meia)',    valor: 60.00  },
  'CAMAROTE EXTRA VIP - MEIA':                { setor: 'EXTRA VIP', tipo: 'Meia Entrada',        valor: 50.00  },
  'CAMAROTE EXTRA VIP - INTEIRA SOLIDARIA':   { setor: 'EXTRA VIP', tipo: 'Solidario (Inteira)', valor: 80.00  },
  'CAMAROTE EXTRA VIP - INTEIRA':             { setor: 'EXTRA VIP', tipo: 'Inteira',             valor: 70.00  },
  'AREA VIP - SOLIDARIO':                     { setor: 'AREA VIP',  tipo: 'Solidario (Meia)',    valor: 40.00  },
  'AREA VIP - MEIA':                          { setor: 'AREA VIP',  tipo: 'Meia Entrada',        valor: 30.00  },
  'AREA VIP - INTEIRA SOLIDARIA':             { setor: 'AREA VIP',  tipo: 'Solidario (Inteira)', valor: 60.00  },
  'AREA VIP - INTEIRA':                       { setor: 'AREA VIP',  tipo: 'Inteira',             valor: 50.00  },
};

const PARADISE_HASH = 'pix_7e21ecf98ae4';
const PARADISE_API  = 'https://multi.paradisepags.com/api/v1/generate_api_pix.php';

const mm = 2.8346;
const M = v => v * mm;

const NAVY  = '#1B1F6E';
const NAVY2 = '#2d35a8';
const GOLD  = '#f5c830';
const LGRAY = '#f2f2f2';
const DGRAY = '#333333';
const MGRAY = '#777777';
const BORD  = '#e0e0e0';
const WHITE = '#ffffff';

async function gerarPdfIngresso(comprador, setor, tipo, valor, num, total, codigo) {
  return new Promise(async (resolve, reject) => {
    try {
      const W = M(90);
      const H = M(240);

      const FOOTER_H = M(9);
      const QR_H     = M(65);
      const FAIXA_H  = M(9);
      const CARD_H   = M(72);
      const IMG_H    = M(85);

      const footerY = 0;
      const qrY     = footerY + FOOTER_H;
      const faixaY  = qrY + QR_H + M(1);
      const cardY   = faixaY + FAIXA_H + M(3);
      const imgY    = cardY + CARD_H + M(2);

      const doc = new PDFDocument({ size: [W, H], margin: 0, bufferPages: true, autoFirstPage: false });
      doc.addPage({ size: [W, H], margin: 0 });

      const buffers = [];
      doc.on('data', b => buffers.push(b));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      // FUNDO
      doc.rect(0, 0, W, H).fill(LGRAY);

      // IMAGEM
      const imgPath = path.join(__dirname, 'criativo1.png');
      if (fs.existsSync(imgPath)) {
        doc.image(imgPath, 0, imgY, { width: W, height: IMG_H, cover: [W, IMG_H], valign: 'bottom' });
      }

      // Overlay azul no topo da imagem
      doc.save().rect(0, imgY, W, M(10)).fillOpacity(0.5).fill(NAVY).restore();

      // Logo
      doc.fillOpacity(1).fillColor(GOLD).font('Helvetica-Bold').fontSize(6.5)
         .text('VAI DE INGRESSO', M(3), imgY + M(4), { lineBreak: false });

      // Numeracao
      doc.fillColor(WHITE).font('Helvetica').fontSize(6)
         .text(`Ingresso ${num} de ${total}`, 0, imgY + M(4),
               { width: W - M(3), align: 'right', lineBreak: false });

      // CARD sombra
      const cx = M(3), cw = W - M(6);
      doc.roundedRect(cx + 2, cardY - 2, cw, CARD_H, 8).fill('#c0c0c0');
      doc.roundedRect(cx, cardY, cw, CARD_H, 8).fill(WHITE);
      doc.roundedRect(cx, cardY, M(1.5), CARD_H, 3).fill(NAVY);

      const tx = M(8), cr = cx + cw - M(4);

      // Badge setor
      let y = cardY + CARD_H - M(9);
      const bw = setor.length * 5.5 + M(6);
      doc.roundedRect(tx, y - M(1.5), bw, M(7), 4).fill(NAVY);
      doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(8)
         .text(setor, tx + M(3), y + M(0.5), { lineBreak: false });

      // Tipo
      y -= M(7);
      doc.fillColor(MGRAY).font('Helvetica').fontSize(7.5).text(tipo, tx, y, { lineBreak: false });

      // Linha
      y -= M(4);
      doc.moveTo(tx, y).lineTo(cr, y).strokeColor(BORD).lineWidth(0.4).stroke();

      // Evento
      y -= M(6);
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(11).text('CE TA DOIDO', tx, y, { lineBreak: false });
      y -= M(5);
      doc.fillColor(MGRAY).font('Helvetica').fontSize(7.5).text('Chapeco / Santa Catarina', tx, y, { lineBreak: false });

      // Data
      y -= M(5.5);
      doc.fillColor(DGRAY).font('Helvetica-Bold').fontSize(8)
         .text('Sabado, 08/08/2026  -  17:00h', tx, y, { lineBreak: false });

      // Valor
      y -= M(6);
      doc.fillColor(MGRAY).font('Helvetica').fontSize(7.5).text('Valor:', tx, y, { lineBreak: false });
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(9)
         .text('R$ ' + valor.toFixed(2).replace('.', ','), tx + M(14), y, { lineBreak: false });

      // Linha
      y -= M(4);
      doc.moveTo(tx, y).lineTo(cr, y).strokeColor(BORD).lineWidth(0.4).stroke();

      // Dados comprador
      y -= M(4.5);
      doc.fillColor(MGRAY).font('Helvetica').fontSize(6.8)
         .text('Comprador: ' + comprador.nome, tx, y, { lineBreak: false });
      y -= M(4);
      doc.text('CPF: ' + comprador.cpf, tx, y, { lineBreak: false });
      y -= M(4);
      doc.text('Email: ' + comprador.email, tx, y, { lineBreak: false });
      y -= M(4);
      doc.text('Cod.: ' + codigo.substring(0, 18).toUpperCase() + '...', tx, y, { lineBreak: false });

      // FAIXA DE CORTE
      const midFaixa = faixaY + FAIXA_H / 2;
      doc.rect(0, faixaY, W, FAIXA_H).fill(NAVY);
      doc.circle(0, midFaixa, M(4.5)).fill(LGRAY);
      doc.circle(W, midFaixa, M(4.5)).fill(LGRAY);
      doc.moveTo(M(8), midFaixa).lineTo(W - M(8), midFaixa)
         .strokeColor(GOLD).lineWidth(0.4).dash(6, { space: 4 }).stroke();
      doc.undash();

      // SECAO QR
      doc.rect(0, qrY, W, QR_H).fill(WHITE);

      const instrY = qrY + QR_H - M(5);
      doc.fillColor(DGRAY).font('Helvetica-Bold').fontSize(7.5)
         .text('Apresente o QR Code na entrada do evento', 0, instrY,
               { width: W, align: 'center', lineBreak: false });

      const qrSize = M(44);
      const qrX = (W - qrSize) / 2;
      const qrImgY = qrY + (QR_H - qrSize - M(10)) / 2 + M(4);

      doc.roundedRect(qrX - M(2), qrImgY - M(2), qrSize + M(4), qrSize + M(4), 4)
         .fillAndStroke(WHITE, BORD);

      const qrDataUrl = await QRCode.toDataURL(codigo, { width: 300, margin: 1 });
      const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');
      doc.image(qrBuffer, qrX, qrImgY, { width: qrSize, height: qrSize });

      doc.fillColor(NAVY2).font('Helvetica').fontSize(6)
         .text(codigo, 0, qrImgY + qrSize + M(2), { width: W, align: 'center', lineBreak: false });

      // FOOTER
      doc.rect(0, footerY, W, FOOTER_H).fill(NAVY);
      doc.fillColor(GOLD).font('Helvetica-Bold').fontSize(6.5)
         .text('proshowoficial.com  -  Ce Ta Doido Chapeco 2026', 0, footerY + M(3.3),
               { width: W, align: 'center', lineBreak: false });

      doc.flushPages();
      doc.end();
    } catch(err) { reject(err); }
  });
}

async function gerarTodosIngressos(comprador, itens) {
  const individuais = [];
  for (const item of itens) {
    const info = SETOR_DISPLAY[item.nome];
    if (!info) continue;
    const qty = parseInt(item.qty) || 0;
    for (let i = 0; i < qty; i++) {
      individuais.push({ setor: info.setor, tipo: info.tipo, valor: info.valor, codigo: crypto.randomUUID() });
    }
  }
  const total = individuais.length;
  const pdfs = [];
  for (let i = 0; i < total; i++) {
    const ing = individuais[i];
    const pdfBuffer = await gerarPdfIngresso(comprador, ing.setor, ing.tipo, ing.valor, i + 1, total, ing.codigo);
    const nomeSetor = ing.setor.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    pdfs.push({ filename: `ingresso-${i + 1}-${nomeSetor}.pdf`, content: pdfBuffer.toString('base64') });
  }
  return pdfs;
}

async function enviarIngressos(comprador, itens) {
  const attachments = await gerarTodosIngressos(comprador, itens);
  const total = attachments.length;
  const listaHTML = attachments.map(a =>
    `<li style="margin:4px 0;color:#555;font-size:13px;">${a.filename.replace('.pdf','').replace(/-/g,' ')}</li>`
  ).join('');

  await resend.emails.send({
    from: 'Ce Ta Doido Chapeco <noreply@proshowoficial.com>',
    to: comprador.email,
    subject: 'Seus ingressos - Ce Ta Doido Chapeco 08/08/2026',
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;">
        <div style="background:#1B1F6E;padding:24px;border-radius:8px 8px 0 0;">
          <h1 style="color:#fff;margin:0;font-size:22px;">Ce Ta Doido - Chapeco</h1>
          <p style="color:rgba(255,255,255,0.7);margin:6px 0 0;font-size:14px;">08 de Agosto de 2026 - 17h</p>
        </div>
        <div style="background:#f9f9f9;padding:24px;border-radius:0 0 8px 8px;">
          <p style="font-size:16px;margin-top:0;">Ola, <strong>${comprador.nome}</strong>!</p>
          <p style="color:#555;">Seu pagamento foi confirmado. Seus <strong>${total} ingresso(s)</strong> estao anexados:</p>
          <ul style="padding-left:20px;">${listaHTML}</ul>
          <p style="color:#555;"><strong>Apresente o QR Code de cada ingresso na entrada do evento.</strong></p>
          <hr style="border:none;border-top:1px solid #eee;margin:16px 0;">
          <p style="font-size:13px;color:#555;">Sabado, 08 de Agosto de 2026 as 17h - Chapeco / SC</p>
        </div>
      </div>
    `,
    attachments,
  });
  console.log(`Ingressos enviados para ${comprador.email} (${total} ingresso(s))`);
}

// ROTA: gerar PIX
app.post('/api/gerar-pix', async (req, res) => {
  try {
    const { itens, comprador } = req.body;
    if (!itens || !Array.isArray(itens) || itens.length === 0)
      return res.status(400).json({ erro: 'Nenhum item informado.' });

    let totalCentavos = 0;
    for (const item of itens) {
      const preco = PRECOS[item.nome];
      if (!preco) return res.status(400).json({ erro: `Ingresso invalido: ${item.nome}` });
      const qty = parseInt(item.qty) || 0;
      if (qty <= 0) continue;
      totalCentavos += Math.round((preco.valor + preco.taxa) * qty * 100);
    }
    if (totalCentavos <= 0) return res.status(400).json({ erro: 'Total invalido.' });

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
  } catch(err) {
    console.error('Erro /api/gerar-pix:', err);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

// ROTA: status polling
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
      enviarIngressos(comprador, itens).catch(err => console.error('Erro ao enviar:', err));
    }
    res.json({ pago, status: data.status });
  } catch(err) {
    res.status(500).json({ erro: 'Erro ao verificar status.' });
  }
});

// ROTA: webhook Paradise
app.post('/api/webhook', async (req, res) => {
  try {
    const { transaction_id, status } = req.body;
    const pago = status === 'approved' || status === 'paid';
    if (pago && pedidos[transaction_id] && !pedidos[transaction_id].enviado) {
      pedidos[transaction_id].enviado = true;
      const { comprador, itens } = pedidos[transaction_id];
      enviarIngressos(comprador, itens).catch(err => console.error('Erro webhook:', err));
    }
    res.json({ ok: true });
  } catch(err) {
    res.status(500).json({ erro: 'Erro no webhook.' });
  }
});

// ROTA: teste
app.post('/api/test-email', async (req, res) => {
  try {
    const comprador = { nome: 'Kaique Antoniolli', cpf: '000.000.000-00', email: 'kaiqueantoniolli@gmail.com' };
    const itens = [
      { nome: 'CE TA DOIDO OPEN BAR - INTEIRA', qty: 1 },
      { nome: 'AREA VIP - MEIA', qty: 1 }
    ];
    await enviarIngressos(comprador, itens);
    res.json({ ok: true, mensagem: 'Email enviado!' });
  } catch(err) {
    res.status(500).json({ erro: err.message, stack: err.stack });
  }
});

// ROTA: saude
app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`Servidor na porta ${PORT}`));
