import { askGemini } from './gemini';

export interface TrendingTopic {
  topic: string;
  category: string;
  urgency: 'alta' | 'média' | 'baixa';
  buyingIntent: string;
  contentAngle: string;
  hashtags: string[];
  postIdea: string;
}

export interface TrendingReport {
  generatedAt: string;
  context: string;
  trends: TrendingTopic[];
  weeklyOpportunity: string;
}

export async function analyzeTrendingTopics(
  niche: string = 'geral',
  targetAudience: string = 'consumidores brasileiros'
): Promise<TrendingReport> {
  const today = new Date();
  const dayOfWeek = today.toLocaleDateString('pt-BR', { weekday: 'long' });
  const dateStr = today.toLocaleDateString('pt-BR');
  const month = today.toLocaleDateString('pt-BR', { month: 'long' });

  const prompt = `
Você é um especialista em marketing digital e comportamento do consumidor brasileiro.
Hoje é ${dayOfWeek}, ${dateStr} (${month}).

Nicho/segmento foco: ${niche}
Público-alvo: ${targetAudience}

Sua missão: identificar os 5 temas/tendências que estão em ALTA agora e que têm ALTO potencial de criar desejo de compra no público.

Pense em:
- Datas comemorativas próximas e sazonalidade (${month})
- Tendências de comportamento de consumo no Brasil
- Desejos e problemas do dia a dia que geram compra por impulso
- Conteúdo que gera identificação e vontade de "quero isso também"
- Oportunidades de "antes x depois", transformação, conquistas

Para cada tendência, crie também uma ideia de post pronto para gerar engajamento e desejo de compra.

Retorne APENAS um JSON válido neste formato exato:
{
  "context": "breve contexto do momento atual para o marketing (1-2 frases)",
  "trends": [
    {
      "topic": "nome curto do tema (ex: Rotina matinal produtiva)",
      "category": "categoria (ex: Lifestyle, Saúde, Casa, Tecnologia, Beleza, Finanças, Moda, Alimentação)",
      "urgency": "alta",
      "buyingIntent": "explicação de como este tema leva à compra (1 frase)",
      "contentAngle": "ângulo criativo para abordar o tema (1 frase)",
      "hashtags": ["hashtag1", "hashtag2", "hashtag3"],
      "postIdea": "ideia de post pronto — texto completo, envolvente, com chamada para ação (máx 250 chars)"
    }
  ],
  "weeklyOpportunity": "sugestão de oportunidade de conteúdo para aproveitar essa semana (1-2 frases)"
}

Regras:
- urgency: "alta" = tendência acontecendo AGORA, "média" = crescendo, "baixa" = oportunidade futura
- buyingIntent: foco em como o conteúdo cria necessidade ou desejo de compra
- postIdea: texto pronto para publicar, tom brasileiro, use emojis com moderação
- Varie as categorias: não repita a mesma categoria mais de 1 vez
- Pense em produtos/serviços que as pessoas compram por influência de conteúdo
`;

  const raw = await askGemini(prompt);
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Resposta inválida do Gemini ao analisar tendências');

  const parsed = JSON.parse(jsonMatch[0]);

  return {
    generatedAt: today.toISOString(),
    context: parsed.context,
    trends: parsed.trends.slice(0, 5),
    weeklyOpportunity: parsed.weeklyOpportunity,
  };
}
