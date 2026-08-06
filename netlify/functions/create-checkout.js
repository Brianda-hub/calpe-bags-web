// netlify/functions/create-checkout.js
//
// Función serverless (se ejecuta en el servidor de Netlify, no en el navegador).
// Recibe el carrito (varios tipos de bulto a la vez) y crea UNA sesión de
// Stripe Checkout que cobra todas las líneas juntas en un solo pago.
//
// Requiere la variable de entorno STRIPE_SECRET_KEY configurada en:
// Netlify > Site configuration > Environment variables
// (Nunca pongas la clave secreta directamente en este archivo ni la subas a GitHub)

const Stripe = require("stripe");

exports.handler = async (event) => {
  // Solo aceptamos peticiones POST desde la web
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Falta configurar STRIPE_SECRET_KEY en Netlify." })
    };
  }

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

  try {
    const { cart, dias, nombre } = JSON.parse(event.body || "{}");

    // Validación básica del carrito recibido
    if (!Array.isArray(cart) || cart.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: "El carrito está vacío." }) };
    }
    const diasValidos = Number.isInteger(dias) && dias > 0 ? dias : 1;

    // Construimos una línea de Stripe por cada tipo de bulto del carrito.
    // unit_amount va en céntimos, y la cantidad es (unidades × días),
    // así que el total por línea = precio/día × cantidad × días.
    const line_items = cart.map((item) => {
      const precio = Number(item.price);
      const cantidad = Number(item.qty);
      if (!precio || !cantidad || precio <= 0 || cantidad <= 0) {
        throw new Error("Artículo del carrito inválido.");
      }
      return {
        price_data: {
          currency: "eur",
          product_data: {
            name: `${item.label} · ${diasValidos} día${diasValidos > 1 ? "s" : ""}`
          },
          unit_amount: Math.round(precio * 100)
        },
        quantity: cantidad * diasValidos
      };
    });

    // URL base del propio sitio (Netlify la expone automáticamente en producción)
    const siteUrl = process.env.URL || "http://localhost:8888";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items,
      success_url: `${siteUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/cancel.html`,
      metadata: {
        nombre_cliente: (nombre || "").slice(0, 200)
      }
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ url: session.url })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || "Error al crear la sesión de pago." })
    };
  }
};
