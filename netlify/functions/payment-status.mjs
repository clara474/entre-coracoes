
export default async (request) => {
  if (request.method !== "GET") {
    return new Response(
      JSON.stringify({ error: "Método não permitido." }),
      {
        status: 405,
        headers: { "Content-Type": "application/json" }
      }
    );
  }

  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  const orderId = new URL(request.url).searchParams.get("order_id");

  if (
    !accessToken ||
    !orderId ||
    !/^ORD[A-Za-z0-9]+$/.test(orderId)
  ) {
    return new Response(
      JSON.stringify({ error: "Dados inválidos." }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" }
      }
    );
  }

  try {
    const response = await fetch(
      `https://api.mercadopago.com/v1/orders/${encodeURIComponent(orderId)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        cache: "no-store"
      }
    );

    const data = await response.json();

    if (!response.ok || data.id !== orderId) {
      return new Response(
        JSON.stringify({
          error: "Não foi possível consultar o pagamento."
        }),
        {
          status: 502,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    const payments = data.transactions?.payments || [];

    const approvedPix = payments.some((payment) => {
      return (
        payment.status === "processed" &&
        payment.status_detail === "accredited" &&
        payment.payment_method?.id === "pix" &&
        payment.payment_method?.type === "bank_transfer" &&
        Number(payment.amount) === 50
      );
    });

    const approved =
      data.id === orderId &&
      data.type === "online" &&
      data.processing_mode === "automatic" &&
      data.country_code === "BRA" &&
      data.status === "processed" &&
      data.status_detail === "accredited" &&
      Number(data.total_amount) === 50 &&
      String(data.external_reference || "").startsWith("EC-TEST-") &&
      approvedPix;

    return new Response(
      JSON.stringify({
        approved,
        status: approved ? "approved" : data.status || "pending"
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store"
        }
      }
    );

  } catch {
    return new Response(
      JSON.stringify({
        error: "Erro ao consultar o Mercado Pago."
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }
};
