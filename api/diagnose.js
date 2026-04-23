export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { imageBase64, imageMime } = body;

    if (!imageBase64 || !imageMime) {
      return res.status(400).json({ error: 'Faltan datos de imagen.' });
    }

    const apiKey = process.env.ANTHROPIC_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'API key no configurada.' });
    }

    const prompt = `Eres un fitopatólogo experto. Analiza esta imagen de una planta y responde ÚNICAMENTE con un objeto JSON válido con esta estructura exacta, sin texto adicional ni backticks:
{"nombre_planta":"nombre","estado_general":"saludable","confianza":85,"enfermedades":[{"nombre":"","descripcion":"","sintomas_observados":[],"causa":""}],"tratamiento":{"inmediato":[],"productos":[],"organico":[]},"prevencion":[],"pronostico":""}
estado_general debe ser: saludable, leve, moderado o crítico. Si está sana enfermedades=[].`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: imageMime, data: imageBase64 } },
            { type: 'text', text: prompt }
          ]
        }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(500).json({ error: data?.error?.message || 'Error en Claude', details: data });
    }

    const raw = data.content?.find(b => b.type === 'text')?.text || '';
    const clean = raw.replace(/```json|```/g, '').trim();
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      return res.status(500).json({ error: 'No se pudo procesar la respuesta.', raw });
    }

    const diagnosis = JSON.parse(jsonMatch[0]);
    return res.status(200).json({ success: true, diagnosis });

  } catch(err) {
    console.error('ERROR:', err.message, err.stack);
    return res.status(500).json({ error: err.message });
  }
}
