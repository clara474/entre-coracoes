
export default async (request) => {
  if (request.method !== "GET") {
    return new Response(
      JSON.stringify({ error: "Método não permitido." }),
      { status: 405, headers: { "Content-Type": "application/json" } }
    );
  }

  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  const orderId = new URL(request.url).searchParams.get("order_id");

  if (!accessToken || !orderId || !/^[a-zA-Z0-9_-]+$/.test(orderId)) {
    return new Response(
      JSON.stringify({ error: "Dados inválidos." }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const response = await fetch(
      `https://api.mercadopago.com/v1/orders/${encodeURIComponent(orderId)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: "Não foi possível consultar o pagamento." }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    const approved =
      data.status === "processed" &&
      data.status_detail === "accredited" &&
      data.currency === "BRL" &&
      Number(data.total_amount) >= 14.90 &&
      String(data.external_reference || "").startsWith("EC-");

    return new Response(
      JSON.stringify({
        approved,
        status: data.status || "unknown"
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch {
    return new Response(
      JSON.stringify({ error: "Erro ao consultar o Mercado Pago." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
