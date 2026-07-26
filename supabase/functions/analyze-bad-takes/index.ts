const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface WordInput {
  id: string;
  start: number;
  end: number;
  text: string;
  parentId: string;
}

const SYSTEM_PROMPT = `Você é um editor de vídeo profissional analisando uma transcrição de gravação bruta. Sua tarefa é identificar trechos que são claramente "bad takes" — momentos onde o speaker errou e deveria ser cortado na edição.

Identifique APENAS os seguintes padrões:

1. **False starts**: O speaker começa uma frase, para, e recomeça a mesma ideia.
   Exemplo: "Então a gente vai... não... Então o que a gente precisa fazer é..."
   → "Então a gente vai... não..." é o bad take

2. **Repetições involuntárias**: O speaker repete a mesma frase ou ideia quase igual, claramente tentando uma versão melhor.
   Exemplo: "Isso é muito importante. Isso é muito importante pra vocês entenderem."
   → A primeira tentativa é o bad take (mantém a segunda, que é mais completa)

3. **Gaguejos e tropeços**: O speaker gagueja ou tropeça nas palavras de forma que não é natural.
   Exemplo: "E a a a inteligência artificial vai vai transformar..."

4. **Frases abandonadas**: O speaker começa uma ideia e abandona completamente sem terminar.
   Exemplo: "E outra coisa que... Bom, vamos falar sobre o próximo tópico."
   → "E outra coisa que..." é o bad take

NÃO marque como bad take:
- Pausas naturais para respirar
- Repetições intencionais para ênfase ("muito, muito importante")
- Expressões coloquiais normais
- Mudanças de assunto intencionais
- Filler words (hm, éh, tipo) — esses já são tratados separadamente

A transcrição está em português brasileiro.

Cada palavra tem um ID no formato [ID|timestamp]. Você DEVE retornar os IDs exatos das palavras a remover.

Seja CONSERVADOR. É melhor não marcar um bad take do que marcar conteúdo bom como erro. Na dúvida, não marque.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      console.warn("ANTHROPIC_API_KEY not configured — skipping bad-take analysis");
      return new Response(
        JSON.stringify({ removedWordIds: [], reasoning: "API key not configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { words } = await req.json() as { words: WordInput[] };
    if (!words || words.length === 0) {
      return new Response(
        JSON.stringify({ removedWordIds: [], reasoning: "No words to analyze" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build transcript with word IDs and timestamps
    const transcript = words.map(w => `[${w.id}|${w.start.toFixed(2)}s] ${w.text}`).join(" ");

    console.log(`Analyzing ${words.length} words for bad takes with Claude...`);

    // For long transcriptions (>5000 words), chunk with overlap
    const CHUNK_SIZE = 5000;
    const OVERLAP = 500;
    const allRemovedIds: Set<string> = new Set();
    let allReasonings: string[] = [];

    const wordChunks: WordInput[][] = [];
    if (words.length > CHUNK_SIZE) {
      for (let i = 0; i < words.length; i += CHUNK_SIZE - OVERLAP) {
        wordChunks.push(words.slice(i, i + CHUNK_SIZE));
      }
    } else {
      wordChunks.push(words);
    }

    for (let chunkIdx = 0; chunkIdx < wordChunks.length; chunkIdx++) {
      const chunk = wordChunks[chunkIdx];
      const chunkTranscript = chunk.map(w => `[${w.id}|${w.start.toFixed(2)}s] ${w.text}`).join(" ");

      const userPrompt = wordChunks.length > 1
        ? `Transcrição (parte ${chunkIdx + 1} de ${wordChunks.length}):\n${chunkTranscript}`
        : `Transcrição:\n${chunkTranscript}`;

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4096,
          system: SYSTEM_PROMPT,
          tools: [
            {
              name: "mark_bad_takes",
              description: "Mark word IDs that are recording errors (bad takes, stutters, false starts) to be removed from the final video.",
              input_schema: {
                type: "object",
                properties: {
                  removed_word_ids: {
                    type: "array",
                    items: { type: "string" },
                    description: "Array of word IDs to remove (e.g. ['s2-w0', 's2-w1', 's2-w2'])",
                  },
                  reasoning: {
                    type: "string",
                    description: "Brief explanation of why these words were marked as errors, in Portuguese",
                  },
                },
                required: ["removed_word_ids", "reasoning"],
              },
            },
          ],
          tool_choice: { type: "tool", name: "mark_bad_takes" },
          messages: [
            { role: "user", content: userPrompt },
          ],
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`Claude API error (chunk ${chunkIdx + 1}):`, response.status, errText);

        if (response.status === 429) {
          return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        // On error, return what we have so far
        break;
      }

      const data = await response.json();
      console.log(`Claude chunk ${chunkIdx + 1} response:`, JSON.stringify(data).substring(0, 500));

      // Extract tool use result from Claude's response format
      const toolUse = data.content?.find((block: any) => block.type === "tool_use");
      if (toolUse?.input) {
        const { removed_word_ids, reasoning } = toolUse.input;
        if (removed_word_ids) {
          for (const id of removed_word_ids) allRemovedIds.add(id);
        }
        if (reasoning) allReasonings.push(reasoning);
      }
    }

    const removedWordIds = Array.from(allRemovedIds);
    const reasoning = allReasonings.join(" | ");

    console.log(`Claude detected ${removedWordIds.length} bad-take words. Reasoning: ${reasoning}`);

    return new Response(
      JSON.stringify({ removedWordIds, reasoning }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("analyze-bad-takes error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
