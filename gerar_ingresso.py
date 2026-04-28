import sys, json, io, os, uuid, base64
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, white, Color
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas
import qrcode
from PIL import Image as PILImage

NAVY  = HexColor('#1B1F6E')
NAVY2 = HexColor('#2d35a8')
GOLD  = HexColor('#f5c830')
LGRAY = HexColor('#f2f2f2')
DGRAY = HexColor('#333333')
MGRAY = HexColor('#777777')
BORD  = HexColor('#e0e0e0')

W = 90 * mm
H = 240 * mm

SETOR_DISPLAY = {
  'CE TA DOIDO OPEN BAR - SOLIDARIO':         {'setor':'OPEN BAR',  'tipo':'Solidário (Meia)',    'valor':80.00 },
  'CE TA DOIDO OPEN BAR - MEIA':              {'setor':'OPEN BAR',  'tipo':'Meia Entrada',        'valor':70.00 },
  'CE TA DOIDO OPEN BAR - INTEIRA SOLIDÁRIA': {'setor':'OPEN BAR',  'tipo':'Solidário (Inteira)', 'valor':150.00},
  'CE TA DOIDO OPEN BAR - INTEIRA':           {'setor':'OPEN BAR',  'tipo':'Inteira',             'valor':140.00},
  'CAMAROTE EXTRA VIP - SOLIDARIO':           {'setor':'EXTRA VIP', 'tipo':'Solidário (Meia)',    'valor':60.00 },
  'CAMAROTE EXTRA VIP - MEIA':                {'setor':'EXTRA VIP', 'tipo':'Meia Entrada',        'valor':50.00 },
  'CAMAROTE EXTRA VIP - INTEIRA SOLIDÁRIA':   {'setor':'EXTRA VIP', 'tipo':'Solidário (Inteira)', 'valor':80.00 },
  'CAMAROTE EXTRA VIP - INTEIRA':             {'setor':'EXTRA VIP', 'tipo':'Inteira',             'valor':70.00 },
  'AREA VIP - SOLIDARIO':                     {'setor':'ÁREA VIP',  'tipo':'Solidário (Meia)',    'valor':40.00 },
  'AREA VIP - MEIA':                          {'setor':'ÁREA VIP',  'tipo':'Meia Entrada',        'valor':30.00 },
  'AREA VIP - INTEIRA SOLIDÁRIA':             {'setor':'ÁREA VIP',  'tipo':'Solidário (Inteira)', 'valor':60.00 },
  'AREA VIP - INTEIRA':                       {'setor':'ÁREA VIP',  'tipo':'Inteira',             'valor':50.00 },
}

IMG_PATH = os.path.join(os.path.dirname(__file__), 'criativo.png')

# Cache da imagem recortada
_img_cache = None
def get_img():
    global _img_cache
    if _img_cache is None and os.path.exists(IMG_PATH):
        pil = PILImage.open(IMG_PATH).convert('RGB')
        iw, ih = pil.size
        crop_start = int(ih * 0.40)
        cropped = pil.crop((0, crop_start, iw, ih))
        buf = io.BytesIO()
        cropped.save(buf, format='JPEG', quality=92)
        buf.seek(0)
        _img_cache = buf.read()
    return _img_cache

def make_qr(data):
    qr = qrcode.QRCode(version=1, box_size=8, border=2,
        error_correction=qrcode.constants.ERROR_CORRECT_M)
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color='black', back_color='white')
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    buf.seek(0)
    return ImageReader(buf)

def gerar_pdf(comprador, setor, tipo, valor, num, total, codigo):
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(W, H))

    IMG_H    = 85 * mm
    CARD_H   = 72 * mm
    FAIXA_H  = 9  * mm
    FOOTER_H = 9  * mm
    QR_H     = 65 * mm

    footer_top = FOOTER_H
    qr_bot     = footer_top
    qr_top     = qr_bot + QR_H
    faixa_bot  = qr_top + 1*mm
    faixa_top  = faixa_bot + FAIXA_H
    card_bot   = faixa_top + 3*mm
    card_top   = card_bot + CARD_H
    img_bot    = card_top + 2*mm

    # FUNDO
    c.setFillColor(LGRAY)
    c.rect(0, 0, W, H, fill=1, stroke=0)

    # IMAGEM
    img_data = get_img()
    if img_data:
        c.drawImage(ImageReader(io.BytesIO(img_data)), 0, img_bot,
                    width=W, height=IMG_H, preserveAspectRatio=False)

    # Overlay no topo
    c.setFillColor(Color(0, 0, 0, alpha=0.3))
    c.rect(0, img_bot + IMG_H - 10*mm, W, 10*mm, fill=1, stroke=0)

    # Logo + numeração
    c.setFillColor(GOLD)
    c.setFont('Helvetica-Bold', 6.5)
    c.drawString(3*mm, img_bot + IMG_H - 6*mm, '\u26a1 VAI DE INGRESSO.')
    c.setFillColor(white)
    c.setFont('Helvetica', 6)
    c.drawRightString(W - 3*mm, img_bot + IMG_H - 6*mm, f'Ingresso {num} de {total}')

    # CARD
    cx = 3*mm
    cw = W - 6*mm
    c.setFillColor(HexColor('#c0c0c0'))
    c.roundRect(cx+0.8*mm, card_bot-0.8*mm, cw, CARD_H, 3*mm, fill=1, stroke=0)
    c.setFillColor(white)
    c.roundRect(cx, card_bot, cw, CARD_H, 3*mm, fill=1, stroke=0)
    c.setFillColor(NAVY)
    c.roundRect(cx, card_bot, 1.5*mm, CARD_H, 1*mm, fill=1, stroke=0)

    tx = cx + 5*mm

    # Badge setor
    y = card_top - 9*mm
    badge_w = c.stringWidth(setor, 'Helvetica-Bold', 8) + 6*mm
    c.setFillColor(NAVY)
    c.roundRect(tx, y-1.5*mm, badge_w, 7*mm, 2*mm, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont('Helvetica-Bold', 8)
    c.drawString(tx+3*mm, y+1*mm, setor)

    # Tipo
    y -= 7*mm
    c.setFillColor(MGRAY)
    c.setFont('Helvetica', 7.5)
    c.drawString(tx, y, tipo)

    # Linha
    y -= 4*mm
    c.setStrokeColor(BORD)
    c.setLineWidth(0.4)
    c.line(tx, y, cx+cw-4*mm, y)

    # Evento
    y -= 6*mm
    c.setFillColor(NAVY)
    c.setFont('Helvetica-Bold', 11)
    c.drawString(tx, y, 'CÊ TÁ DOIDO')
    y -= 5*mm
    c.setFillColor(MGRAY)
    c.setFont('Helvetica', 7.5)
    c.drawString(tx, y, 'Chapecó / Santa Catarina')

    # Data
    y -= 5.5*mm
    c.setFillColor(DGRAY)
    c.setFont('Helvetica-Bold', 8)
    c.drawString(tx, y, 'Sábado, 08/08/2026  ·  17:00h')

    # Valor
    y -= 6*mm
    c.setFillColor(MGRAY)
    c.setFont('Helvetica', 7.5)
    c.drawString(tx, y, 'Valor:')
    c.setFillColor(NAVY)
    c.setFont('Helvetica-Bold', 9)
    c.drawString(tx+14*mm, y, f"R$ {valor:.2f}".replace('.', ','))

    # Linha
    y -= 4*mm
    c.setStrokeColor(BORD)
    c.line(tx, y, cx+cw-4*mm, y)

    # Dados do comprador
    y -= 4.5*mm
    c.setFillColor(MGRAY)
    c.setFont('Helvetica', 6.8)
    c.drawString(tx, y, f'Comprador: {comprador["nome"]}')
    y -= 4*mm
    c.drawString(tx, y, f'CPF: {comprador["cpf"]}')
    y -= 4*mm
    c.drawString(tx, y, f'Email: {comprador["email"]}')
    y -= 4*mm
    c.drawString(tx, y, f'Cód.: {codigo[:18].upper()}...')

    # FAIXA DE CORTE
    mid_faixa = faixa_bot + FAIXA_H/2
    c.setFillColor(NAVY)
    c.rect(0, faixa_bot, W, FAIXA_H, fill=1, stroke=0)
    c.setFillColor(LGRAY)
    c.circle(0, mid_faixa, 4.5*mm, fill=1, stroke=0)
    c.circle(W, mid_faixa, 4.5*mm, fill=1, stroke=0)
    c.setStrokeColor(GOLD)
    c.setLineWidth(0.4)
    c.setDash(6, 4)
    c.line(8*mm, mid_faixa, W-8*mm, mid_faixa)
    c.setDash()

    # SEÇÃO QR CODE
    c.setFillColor(white)
    c.rect(0, qr_bot, W, QR_H, fill=1, stroke=0)

    instr_y = qr_top - 5*mm
    c.setFillColor(DGRAY)
    c.setFont('Helvetica-Bold', 7.5)
    c.drawCentredString(W/2, instr_y, 'Apresente o QR Code na entrada do evento')

    qr_size = 44*mm
    qr_x = (W - qr_size)/2
    area_center_y = (qr_bot + instr_y)/2
    qr_y = area_center_y - qr_size/2 + 4*mm

    c.setFillColor(white)
    c.setStrokeColor(BORD)
    c.setLineWidth(0.6)
    c.roundRect(qr_x-2*mm, qr_y-2*mm, qr_size+4*mm, qr_size+4*mm, 2*mm, fill=1, stroke=1)
    c.drawImage(make_qr(codigo), qr_x, qr_y, width=qr_size, height=qr_size)

    c.setFillColor(NAVY2)
    c.setFont('Helvetica', 6)
    c.drawCentredString(W/2, qr_y-5*mm, codigo[:36])

    # FOOTER
    c.setFillColor(NAVY)
    c.rect(0, 0, W, FOOTER_H, fill=1, stroke=0)
    c.setFillColor(GOLD)
    c.setFont('Helvetica-Bold', 6.5)
    c.drawCentredString(W/2, 3.3*mm, 'proshowoficial.com  \u2022  Cê Tá Doido Chapecó 2026')

    c.save()
    buf.seek(0)
    return buf.read()

def main():
    data = json.loads(sys.stdin.read())
    comprador = data['comprador']
    itens = data['itens']

    individuais = []
    for item in itens:
        info = SETOR_DISPLAY.get(item['nome'])
        if not info:
            continue
        for _ in range(item['qty']):
            individuais.append({
                'setor': info['setor'],
                'tipo':  info['tipo'],
                'valor': info['valor'],
                'codigo': str(uuid.uuid4()),
            })

    total = len(individuais)
    resultado = []
    for i, ing in enumerate(individuais):
        pdf_bytes = gerar_pdf(
            comprador, ing['setor'], ing['tipo'], ing['valor'],
            i+1, total, ing['codigo']
        )
        nome = f"ingresso-{i+1}-{ing['setor'].lower().replace(' ','-').replace('á','a').replace('ê','e')}.pdf"
        resultado.append({
            'nome': nome,
            'base64': base64.b64encode(pdf_bytes).decode('utf-8')
        })

    print(json.dumps(resultado))

main()
