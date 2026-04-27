const express = require('express');
const cors    = require('cors');
const fetch   = require('node-fetch');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Permite chamadas do seu site (troque pela URL real depois de hospedar) ──
app.use(cors({
  origin: ['http://localhost:5500', 'https://SEU-SITE.netlify.app', '*']
}));
app.use(express.json());

// ── Tabela de preços oficial (nunca confiar no frontend!) ──
const PRECOS = {
  'CE TA DOIDO OPEN BAR - SOLIDARIO':             { valor: 80.00, taxa: 12.00 },
  'CE TA DOIDO OPEN BAR - MEIA':                  { valor: 70.00, taxa: 10.50 },
  'CE TA DOIDO OPEN BAR - INTEIRA SOLIDÁRIA':     { valor: 150.00, taxa: 22.50 },
  'CE TA DOIDO OPEN BAR - INTEIRA':               { valor: 140.00, taxa: 21.00 },
  'CAMAROTE EXTRA VIP - SOLIDARIO':               { valor: 60.00, taxa: 9.00 },
  'CAMAROTE EXTRA VIP - MEIA':                    { valor: 50.00, taxa: 7.50 },
  'CAMAROTE EXTRA VIP - INTEIRA SOLIDÁRIA':       { valor: 80.00, taxa: 12.00 },
  'CAMAROTE EXTRA VIP - INTEIRA':                 { valor: 70.00, taxa: 10.50 },
  'AREA VIP - SOLIDARIO':                         { valor: 40.00, taxa: 6.00 },
  'AREA VIP - MEIA':                              { valor: 30.00, taxa: 4.50 },
  'AREA VIP - INTEIRA SOLIDÁRIA':                 { valor: 60.00, taxa: 9.00 },
  'AREA VIP - INTEIRA':                           { valor: 50.00, taxa: 7.50 },
};

const PARADISE_HASH = 'pix_7e21ecf98ae4';
const PARADISE_API  = 'https://multi.paradisepags.com/api/v1/generate_api_pix.php';

// ── ROTA: gerar PIX ──────────────────────────────────────────────────
app.post('/api/gerar-pix', async (req, res) => {
  try {
    const { itens, comprador } = req.body;

    if (!itens || !Array.isArray(itens) || itens.length === 0) {
      return res.status(400).json({ erro: 'Nenhum item informado.' });
    }

    // Valida e recalcula total no servidor
    let totalCentavos = 0;
    for (const item of itens) {
      const preco = PRECOS[item.nome];
      if (!preco) {
        return res.status(400).json({ erro: `Ingresso inválido: ${item.nome}` });
      }
      const qty = parseInt(item.qty) || 0;
      if (qty <= 0) continue;
      totalCentavos += Math.round((preco.valor + preco.taxa) * qty * 100);
    }

    if (totalCentavos <= 0) {
      return res.status(400).json({ erro: 'Total inválido.' });
    }

    // Chama a API da Paradise
    const paradiseResp = await fetch(PARADISE_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hash:   PARADISE_HASH,
        amount: String(totalCentavos)
      })
    });

    const data = await paradiseResp.json();

    if (!data.success || !data.qr_code) {
      return res.status(502).json({ erro: 'Erro ao gerar PIX na Paradise.', detalhe: data });
    }

    // Retorna o QR code e transaction_id para o frontend
    return res.json({
      sucesso:        true,
      qr_code:        data.qr_code,
      transaction_id: data.transaction_id,
      total_reais:    (totalCentavos / 100).toFixed(2)
    });

  } catch (err) {
    console.error('Erro /api/gerar-pix:', err);
    res.status(500).json({ erro: 'Erro interno do servidor.' });
  }
});

// ── ROTA: verificar status do pagamento ─────────────────────────────
app.get('/api/status/:transaction_id', async (req, res) => {
  try {
    const { transaction_id } = req.params;

    const resp = await fetch(
      `https://multi.paradisepags.com/api/v1/check_transaction.php?transaction_id=${transaction_id}`
    );
    const data = await resp.json();

    res.json({
      pago:   data.status === 'approved' || data.status === 'paid',
      status: data.status
    });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao verificar status.' });
  }
});

// ── ROTA: saúde do servidor ─────────────────────────────────────────
app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`✅ Servidor rodando na porta ${PORT}`);
});
