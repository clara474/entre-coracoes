
import { randomUUID } from "node:crypto";

const SITE_URL = "https://stellar-kitten-3e3659.netlify.app";

export default async (request) => {
  if (request.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Método não permitido." }),
      { status: 405, headers: { "Content-Type": "application/json" } }
    );
  }

  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;

  if (!accessToken) {
    return new Response(
      JSON.stringify({ error: "Configuração do pagamento ausente." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const orderReference = `EC-${randomUUID()}`;

  try {
    const response = await fetch(
      "https://api.mercadopago.com/v1/orders",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          "X-Idempotency-Key": randomUUID()
        },
        body: JSON.stringify({
          type: "online",
          processing_mode: "manual",
          total_amount: "14.90",
          external_reference: orderReference,
          description: "Relatório Premium Entre Corações",
          items: [
            {
              title: "Relatório Premium Entre Corações",
              quantity: 1,
              unit_price: "14.90"
            }
          ],
          config: {
            online: {
              success_url: `${SITE_URL}/?payment=return`,
              failure_url: `${SITE_URL}/?payment=return`,
              pending_url: `${SITE_URL}/?payment=return`,
              auto_return: "approved"
            }
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok || !data.checkout_url || !data.id) {
      return new Response(
        JSON.stringify({ error: "Não foi possível criar o pagamento." }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        checkout_url: data.checkout_url,
        order_id: data.id
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch {
    return new Response(
      JSON.stringify({ error: "Erro ao conectar ao Mercado Pago." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
