
import { randomUUID, createHmac } from 'node:crypto';

function send(res, status, data) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(status).json(data);
}

function isSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return false;

  try {
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    return new URL(origin).host === String(host).split(',')[0].trim();
  } catch {
    return false;
  }
}

function makeProof(orderId, externalReference, secret) {
  const payload = Buffer.from(JSON.stringify({
    orderId,
    externalReference,
    createdAt: Date.now()
  })).toString('base64url');

  const signature = createHmac('sha256', secret)
    .update(payload)
    .digest('base64url');

  return `${payload}.${signature}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'Método não permitido.' });
  }

  if (!isSameOrigin(req)) {
    return send(res, 403, {
      error: 'Origem da solicitação não autorizada.'
    });
  }

  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;

  const secret =
    process.env.PAYMENT_SIGNING_SECRET ||
    process.env.SEGREDO_DE_ASSINATURA_DE_PAGAMENTO;

  if (!token) {
    return send(res, 500, {
      error: 'Access Token não configurado.'
    });
  }

  if (!secret || secret.length < 32) {
    return send(res, 500, {
      error: 'Configuração segura incompleta.'
    });
  }

  const email = typeof req.body?.email === 'string'
    ? req.body.email.trim().toLowerCase()
    : '';

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return send(res, 400, {
      error: 'Informe um e-mail válido.'
    });
  }

  const externalReference = `EC-${randomUUID()}`;

  const payload = {
    type: 'online',
    total_amount: '14.90',
    external_reference: externalReference,
    processing_mode: 'automatic',
    transactions: {
      payments: [{
        amount: '14.90',
        payment_method: {
          id: 'pix',
          type: 'bank_transfer'
        },
        expiration_time: 'P1D'
      }]
    },
    payer: { email }
  };

  try {
    const response = await fetch(
      'https://api.mercadopago.com/v1/orders',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Idempotency-Key': randomUUID()
        },
        body: JSON.stringify(payload)
      }
    );

    const data = await response.json().catch(() => ({}));
    const payment = data?.transactions?.payments?.[0];
    const method = payment?.payment_method || {};

    if (
      !response.ok ||
      !data.id ||
      method.id !== 'pix' ||
      !method.qr_code ||
      !method.qr_code_base64
    ) {
      console.error('Mercado Pago error:', response.status, {
        status: data?.status,
        cause: data?.cause,
        message: data?.message
      });

      return send(res, 502, {
        error: 'O Mercado Pago não conseguiu gerar o Pix. Consulte os logs do servidor.'
      });
    }

    return send(res, 200, {
      orderId: data.id,
      proof: makeProof(data.id, externalReference, secret),
      qrCode: method.qr_code,
      qrCodeBase64: method.qr_code_base64,
      ticketUrl: method.ticket_url || null,
      expiration: payment.expiration_time || null
    });

  } catch (error) {
    console.error('Create Pix failed:', error?.message || 'unknown error');

    return send(res, 502, {
      error: 'Falha de comunicação com o Mercado Pago.'
    });
  }
}
