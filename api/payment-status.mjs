
import { createHmac, timingSafeEqual } from 'node:crypto';

function send(res, status, data) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(status).json(data);
}

function verifyProof(proof, orderId, secret) {
  if (typeof proof !== 'string' || proof.length > 2048) return null;

  const parts = proof.split('.');
  if (parts.length !== 2) return null;

  const [payload, signature] = parts;

  const expected = createHmac('sha256', secret)
    .update(payload)
    .digest();

  let received;

  try {
    received = Buffer.from(signature, 'base64url');
  } catch {
    return null;
  }

  if (
    received.length !== expected.length ||
    !timingSafeEqual(received, expected)
  ) return null;

  try {
    const data = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8')
    );

    if (
      data.orderId !== orderId ||
      typeof data.externalReference !== 'string' ||
      !data.externalReference.startsWith('EC-') ||
      !Number.isFinite(data.createdAt)
    ) return null;

    const age = Date.now() - data.createdAt;

    if (age > 48 * 60 * 60 * 1000 || age < -60000) {
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return send(res, 405, {
      error: 'Método não permitido.'
    });
  }

  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;

  const secret =
    process.env.PAYMENT_SIGNING_SECRET ||
    process.env.SEGREDO_DE_ASSINATURA_DE_PAGAMENTO;

  if (!token || !secret || secret.length < 32) {
    return send(res, 500, {
      error: 'Serviço de pagamento não configurado.'
    });
  }

  const orderId =
    typeof req.query.order_id === 'string'
      ? req.query.order_id
      : '';

  const proof =
    typeof req.query.proof === 'string'
      ? req.query.proof
      : '';

  if (!/^ORD[A-Z0-9]{10,60}$/i.test(orderId)) {
    return send(res, 400, {
      error: 'Identificador de pagamento inválido.'
    });
  }

  const proofData = verifyProof(proof, orderId, secret);

  if (!proofData) {
    return send(res, 403, {
      error: 'Comprovante de sessão inválido. Inicie um novo pagamento.'
    });
  }

  try {
    const response = await fetch(
      `https://api.mercadopago.com/v1/orders/${encodeURIComponent(orderId)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json'
        },
        cache: 'no-store'
      }
    );

    const order = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error('Mercado Pago order lookup failed:', response.status, {
        status: order?.status,
        message: order?.message
      });

      return send(res, 502, {
        error: 'Não foi possível consultar o pagamento agora.'
      });
    }

    const payment = order?.transactions?.payments?.[0];
    const method = payment?.payment_method || {};

    const approved =
      order.id === orderId &&
      order.external_reference === proofData.externalReference &&
      order.type === 'online' &&
      order.processing_mode === 'automatic' &&
      order.status === 'processed' &&
      order.status_detail === 'accredited' &&
      Number(order.total_amount) === 14.90 &&
      Number(order.total_paid_amount) === 14.90 &&
      Number(payment?.amount) === 14.90 &&
      Number(payment?.paid_amount) === 14.90 &&
      payment?.status === 'processed' &&
      payment?.status_detail === 'accredited' &&
      method.id === 'pix' &&
      method.type === 'bank_transfer';

    return send(res, 200, {
      approved,
      status: order.status || 'unknown',
      detail: order.status_detail || ''
    });

  } catch (error) {
    console.error(
      'Payment status lookup failed:',
      error?.message || 'unknown error'
    );

    return send(res, 502, {
      error: 'Falha de comunicação ao consultar o pagamento.'
    });
  }
}
