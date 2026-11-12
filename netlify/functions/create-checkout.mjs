
import { randomUUID } from "node:crypto";

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
          total_amount: "14.90",
          external_reference: orderReference,
          processing_mode: "automatic",
          transactions: {
            payments: [
              {
                amount: "14.90",
                payment_method: {
                  id: "pix",
                  type: "bank_transfer"
                }
              }
            ]
          },
          payer: {
            email: "test_payer@example.com"
          }
        })
      }
    );

    const data = await response.json();

    const payment = data.transactions?.payments?.[0];
    const ticketUrl = payment?.payment_method?.ticket_url;

    if (!response.ok || !data.id || !ticketUrl) {
      return new Response(
        JSON.stringify({
          error: "Não foi possível gerar o Pix. Verifique a integração."
        }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        checkout_url: ticketUrl,
        order_id: data.id
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );

  } catch {
    return new Response(
      JSON.stringify({ error: "Erro ao conectar ao Mercado Pago." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
