export default {
  async fetch(request, env, ctx) {
    // Configuração de CORS para permitir acesso do Frontend
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    if (request.method === "POST" && new URL(request.url).pathname === "/processar-leitura") {
      try {
        const payload = await request.json();
        const { imageBase64, tipo, leituraAnterior, telefone } = payload;

        // 1. Processamento via Google Cloud Vision API REST
        const visionUrl = `https://vision.googleapis.com/v1/images:annotate?key=${env.GOOGLE_VISION_API_KEY}`;
        const visionReq = await fetch(visionUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requests: [{
              image: { content: imageBase64.replace(/^data:image\/(png|jpeg);base64,/, "") },
              features: [{ type: "TEXT_DETECTION" }]
            }]
          })
        });

        const visionData = await visionReq.json();
        const textoDetectado = visionData.responses[0]?.fullTextAnnotation?.text || "";
        
        // Regra de extração de dígitos (4 a 6 dígitos do padrão Saneago/Equatorial)
        const digitos = textoDetectado.match(/\b\d{4,6}\b/g);
        if (!digitos) throw new Error("Não foi possível ler os dígitos. Limpe o visor da unidade.");
        const leituraAtual = Math.max(...digitos.map(Number));

        // 2. Cálculos de Consumo
        const consumo = leituraAtual - leituraAnterior;
        if (consumo < 0) throw new Error("Inconsistência: Leitura atual inferior à anterior.");

        let detalhes = { consumo, leituraAtual, total: 0 };
        if (tipo === 'AGUA') {
            const tarifaAgua = consumo * 5.80; // Saneago (m³)
            const taxaEsgoto = tarifaAgua * 0.80;
            detalhes.total = tarifaAgua + taxaEsgoto;
            detalhes.discriminacao = `Água: R$${tarifaAgua.toFixed(2)} | Esgoto: R$${taxaEsgoto.toFixed(2)}`;
        } else {
            const tarifaEnergia = consumo * 0.85; // Equatorial (kWh)
            const ilumPublica = 15.00;
            detalhes.total = tarifaEnergia + ilumPublica;
            detalhes.discriminacao = `Energia: R$${tarifaEnergia.toFixed(2)} | Iluminação: R$${ilumPublica.toFixed(2)}`;
        }

        // 3. Disparo Automático para WhatsApp via API Oficial da Meta
        if (telefone) {
          const msgBody = `*SandxCDD - Leitura Processada*\nTipo: ${tipo}\nLeitura Atual: ${leituraAtual}\nConsumo: ${consumo}\nTotal a pagar: R$ ${detalhes.total.toFixed(2)}\n\n_Detalhamento: ${detalhes.discriminacao}_`;
          await fetch(`https://graph.facebook.com/v17.0/${env.WHATSAPP_PHONE_ID}/messages`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${env.WHATSAPP_TOKEN}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              messaging_product: "whatsapp",
              to: telefone,
              type: "text",
              text: { body: msgBody }
            })
          });
        }

        return new Response(JSON.stringify({ sucesso: true, dados: detalhes }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });

      } catch (err) {
        return new Response(JSON.stringify({ sucesso: false, erro: err.message }), { 
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }
    }

    return new Response("SandxCDD API - Acesso restrito.", { status: 403 });
  }
};
