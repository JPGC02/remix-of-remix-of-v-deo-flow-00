// Mock data for Video Maker AI — Pipeline de 8 Etapas

export interface Word {
  id: string;
  text: string;
  start: number;
  end: number;
  type: "speech" | "filler" | "silence";
}

export interface Segment {
  id: string;
  start: number;
  end: number;
  type: "speech" | "silence" | "filler" | "broll";
  text: string;
  status: "kept" | "removed" | "suggested";
}

export interface BRollSuggestion {
  id: string;
  timestamp: number;
  duration: number;
  context: string;
  thumbnails: string[];
  mediaUrls?: string[];
  status: "pending" | "accepted" | "rejected";
  category: "video" | "image" | "text" | "ai";
  source?: string;
  transcriptExcerpt?: string;
}

export interface SuggestedCut {
  id: string;
  start: number;
  end: number;
  type: "silence" | "filler" | "bad-take";
  text: string;
  status: "pending" | "accepted" | "rejected";
}

export interface HookSuggestion {
  id: string;
  segmentId: string;
  timestamp: number;
  text: string;
  reason: string;
  score: number; // 1-5
  isCurrent: boolean;
}

export interface AudioPreset {
  id: string;
  name: string;
  icon: string;
  description: string;
}

export interface MockMusic {
  id: string;
  title: string;
  artist: string;
  duration: number;
  mood: string[];
  genre: string;
  bpm: number;
  previewUrl: string;
  downloadUrl: string;
}

export interface TransitionPreset {
  id: string;
  name: string;
  icon: string;
}

export interface SafeZonePreset {
  id: string;
  platform: string;
  icon: string;
  topInset: number;
  bottomInset: number;
}

export type PipelineStepId = "upload" | "cut" | "reframe" | "broll" | "audio" | "color" | "subtitles" | "preview" | "export";

export interface PipelineStep {
  id: PipelineStepId;
  label: string;
  icon: string;
  status: "done" | "active" | "pending";
}

export const TOTAL_DURATION = 124;

export const segments: Segment[] = [
  { id: "s1", start: 0, end: 3.2, type: "speech", text: "E aí pessoal, bem-vindos de volta ao canal.", status: "kept" },
  { id: "s2", start: 3.2, end: 4.1, type: "silence", text: "", status: "removed" },
  { id: "s3", start: 4.1, end: 8.5, type: "speech", text: "Hoje eu vou compartilhar cinco dicas de produtividade que mudaram minha vida.", status: "kept" },
  { id: "s4", start: 8.5, end: 9.3, type: "filler", text: "hm", status: "removed" },
  { id: "s5", start: 9.3, end: 15.8, type: "speech", text: "Dica número um: bloqueio de tempo. Defina horários específicos para tarefas específicas.", status: "kept" },
  { id: "s6", start: 15.8, end: 17.2, type: "silence", text: "", status: "removed" },
  { id: "s7", start: 17.2, end: 24.5, type: "speech", text: "Eu uso minha agenda religiosamente agora. Cada hora tem um propósito, e isso me mantém focado.", status: "kept" },
  { id: "s8", start: 24.5, end: 25.1, type: "filler", text: "tipo", status: "removed" },
  { id: "s9", start: 25.1, end: 32.0, type: "speech", text: "Dica dois: a regra dos dois minutos. Se algo leva menos de dois minutos, faça agora.", status: "kept" },
  { id: "s10", start: 32.0, end: 33.5, type: "silence", text: "", status: "removed" },
  { id: "s11", start: 33.5, end: 42.0, type: "speech", text: "Essa é sensacional. Eu costumava procrastinar em tarefas pequenas e elas se acumulavam numa lista enorme.", status: "kept" },
  { id: "s12", start: 42.0, end: 42.8, type: "filler", text: "éh", status: "removed" },
  { id: "s13", start: 42.8, end: 50.5, type: "speech", text: "Dica três: agrupe tarefas similares. Responda todos os e-mails de uma vez, faça todas as ligações de uma vez.", status: "kept" },
  { id: "s14", start: 50.5, end: 52.0, type: "silence", text: "", status: "removed" },
  { id: "s15", start: 52.0, end: 62.0, type: "speech", text: "Trocar de contexto é o maior assassino de produtividade. Seu cérebro precisa de tempo pra se reconcentrar cada vez que você muda de tipo de tarefa.", status: "kept" },
  { id: "s16", start: 62.0, end: 63.2, type: "filler", text: "né", status: "removed" },
  { id: "s17", start: 63.2, end: 72.5, type: "speech", text: "Dica quatro: use a técnica Pomodoro. Trabalhe por vinte e cinco minutos, depois faça uma pausa de cinco.", status: "kept" },
  { id: "s18", start: 72.5, end: 74.0, type: "silence", text: "", status: "removed" },
  { id: "s19", start: 74.0, end: 84.0, type: "speech", text: "Eu era cético no começo, mas as pausas forçadas me ajudam a manter mais energia durante o dia todo.", status: "kept" },
  { id: "s20", start: 84.0, end: 84.6, type: "filler", text: "hm", status: "removed" },
  { id: "s21", start: 84.6, end: 95.0, type: "speech", text: "E por último, dica cinco: revise seu dia toda noite. Gaste apenas cinco minutos anotando o que você realizou e o que precisa ser feito amanhã.", status: "kept" },
  { id: "s22", start: 95.0, end: 96.5, type: "silence", text: "", status: "removed" },
  { id: "s23", start: 96.5, end: 108.0, type: "speech", text: "Esse hábito sozinho me tornou duas vezes mais produtivo porque eu começo toda manhã já sabendo exatamente no que focar.", status: "kept" },
  { id: "s24", start: 108.0, end: 109.0, type: "silence", text: "", status: "removed" },
  { id: "s25", start: 109.0, end: 120.0, type: "speech", text: "Essas são minhas cinco dicas. Me conta nos comentários qual você vai experimentar primeiro. Não esquece de curtir e se inscrever!", status: "kept" },
  { id: "s26", start: 120.0, end: 124.0, type: "silence", text: "", status: "removed" },
];

export const brollSuggestions: BRollSuggestion[] = [
  {
    id: "br1", timestamp: 9.3, duration: 4, context: "bloqueio de tempo / agenda",
    category: "video", source: "Pexels",
    thumbnails: [
      "https://images.unsplash.com/photo-1506784983877-45594efa4cbe?w=200&h=350&fit=crop",
      "https://images.unsplash.com/photo-1484480974693-6ca0a78fb36b?w=200&h=350&fit=crop",
      "https://images.unsplash.com/photo-1611532736597-de2d4265fba3?w=200&h=350&fit=crop",
    ],
    status: "pending",
  },
  {
    id: "br2", timestamp: 42.8, duration: 3, context: "agrupar tarefas / e-mails",
    category: "image", source: "Pixabay",
    thumbnails: [
      "https://images.unsplash.com/photo-1596526131083-e8c633c948d2?w=200&h=350&fit=crop",
      "https://images.unsplash.com/photo-1557200134-90327ee9fafa?w=200&h=350&fit=crop",
      "https://images.unsplash.com/photo-1563986768609-322da13575f2?w=200&h=350&fit=crop",
    ],
    status: "pending",
  },
  {
    id: "br3", timestamp: 63.2, duration: 4, context: "timer Pomodoro",
    category: "video", source: "Pexels",
    thumbnails: [
      "https://images.unsplash.com/photo-1501139083538-0139583c060f?w=200&h=350&fit=crop",
      "https://images.unsplash.com/photo-1523875194681-bedd468c58bf?w=200&h=350&fit=crop",
      "https://images.unsplash.com/photo-1495364141860-b0d03eccd065?w=200&h=350&fit=crop",
    ],
    status: "pending",
  },
  {
    id: "br4", timestamp: 84.6, duration: 3, context: "revisar seu dia / anotações",
    category: "text", source: "Texto",
    thumbnails: [],
    status: "pending",
  },
];

export const suggestedCuts: SuggestedCut[] = [
  { id: "c1", start: 3.2, end: 4.1, type: "silence", text: "[silêncio 0.9s]", status: "accepted" },
  { id: "c2", start: 8.5, end: 9.3, type: "filler", text: "hm", status: "accepted" },
  { id: "c3", start: 15.8, end: 17.2, type: "silence", text: "[silêncio 1.4s]", status: "accepted" },
  { id: "c4", start: 24.5, end: 25.1, type: "filler", text: "tipo", status: "accepted" },
  { id: "c5", start: 32.0, end: 33.5, type: "silence", text: "[silêncio 1.5s]", status: "accepted" },
  { id: "c6", start: 42.0, end: 42.8, type: "filler", text: "éh", status: "accepted" },
  { id: "c7", start: 50.5, end: 52.0, type: "silence", text: "[silêncio 1.5s]", status: "accepted" },
  { id: "c8", start: 62.0, end: 63.2, type: "filler", text: "né", status: "pending" },
  { id: "c9", start: 72.5, end: 74.0, type: "silence", text: "[silêncio 1.5s]", status: "accepted" },
  { id: "c10", start: 84.0, end: 84.6, type: "filler", text: "hm", status: "pending" },
  { id: "c11", start: 95.0, end: 96.5, type: "silence", text: "[silêncio 1.5s]", status: "accepted" },
  { id: "c12", start: 108.0, end: 109.0, type: "silence", text: "[silêncio 1.0s]", status: "accepted" },
  { id: "c13", start: 120.0, end: 124.0, type: "silence", text: "[silêncio 4.0s]", status: "accepted" },
];

export const hookSuggestions: HookSuggestion[] = [
  {
    id: "h1", segmentId: "s3", timestamp: 4.1,
    text: "Hoje eu vou compartilhar cinco dicas de produtividade que mudaram minha vida.",
    reason: "Promessa de valor clara e direta", score: 4, isCurrent: true,
  },
  {
    id: "h2", segmentId: "s9", timestamp: 25.1,
    text: "Dica dois: a regra dos dois minutos. Se algo leva menos de dois minutos, faça agora.",
    reason: "Regra prática e acionável imediatamente", score: 5, isCurrent: false,
  },
  {
    id: "h3", segmentId: "s15", timestamp: 52.0,
    text: "Trocar de contexto é o maior assassino de produtividade.",
    reason: "Dado surpreendente, gera curiosidade", score: 4, isCurrent: false,
  },
  {
    id: "h4", segmentId: "s23", timestamp: 96.5,
    text: "Esse hábito sozinho me tornou duas vezes mais produtivo.",
    reason: "Resultado pessoal com número concreto", score: 3, isCurrent: false,
  },
];

export const audioPresets: AudioPreset[] = [
  { id: "phone", name: "Gravação de Celular", icon: "📱", description: "Noise reduction forte + EQ agressivo" },
  { id: "noisy", name: "Ambiente com Ruído", icon: "🏠", description: "Noise reduction + de-reverb" },
  { id: "pro-mic", name: "Microfone Profissional", icon: "🎙️", description: "Polish leve, preserva qualidade" },
  { id: "podcast", name: "Podcast/Entrevista", icon: "🎧", description: "Balanceamento + normalização" },
];

export const mockMusics: MockMusic[] = [
  {
    id: "m1", title: "Sunny Vibes", artist: "FASSounds", duration: 139,
    mood: ["feliz", "energético"], genre: "Pop", bpm: 116,
    previewUrl: "https://cdn.pixabay.com/audio/2022/10/18/audio_2cecb0579f.mp3",
    downloadUrl: "https://cdn.pixabay.com/audio/2022/10/18/audio_2cecb0579f.mp3",
  },
  {
    id: "m2", title: "Good Night", artist: "FASSounds", duration: 146,
    mood: ["calmo", "relaxante"], genre: "Ambient", bpm: 78,
    previewUrl: "https://cdn.pixabay.com/audio/2022/05/27/audio_1808fbf07a.mp3",
    downloadUrl: "https://cdn.pixabay.com/audio/2022/05/27/audio_1808fbf07a.mp3",
  },
  {
    id: "m3", title: "Inspiring Cinematic", artist: "Lexin Music", duration: 179,
    mood: ["inspirador", "cinematográfico"], genre: "Cinematic", bpm: 120,
    previewUrl: "https://cdn.pixabay.com/audio/2022/02/22/audio_d1718ab41b.mp3",
    downloadUrl: "https://cdn.pixabay.com/audio/2022/02/22/audio_d1718ab41b.mp3",
  },
  {
    id: "m4", title: "Lofi Study", artist: "FASSounds", duration: 147,
    mood: ["focado", "calmo"], genre: "Lo-Fi", bpm: 85,
    previewUrl: "https://cdn.pixabay.com/audio/2022/11/22/audio_febc508520.mp3",
    downloadUrl: "https://cdn.pixabay.com/audio/2022/11/22/audio_febc508520.mp3",
  },
  {
    id: "m5", title: "Energetic Hip Hop", artist: "Prazkhanal", duration: 118,
    mood: ["energético", "motivacional"], genre: "Hip Hop", bpm: 130,
    previewUrl: "https://cdn.pixabay.com/audio/2023/07/30/audio_e5765ebdc6.mp3",
    downloadUrl: "https://cdn.pixabay.com/audio/2023/07/30/audio_e5765ebdc6.mp3",
  },
  {
    id: "m6", title: "Abstract Future Bass", artist: "QubeSounds", duration: 184,
    mood: ["moderno", "energético"], genre: "Electronic", bpm: 140,
    previewUrl: "https://cdn.pixabay.com/audio/2022/01/18/audio_d0a13f69d2.mp3",
    downloadUrl: "https://cdn.pixabay.com/audio/2022/01/18/audio_d0a13f69d2.mp3",
  },
  {
    id: "m7", title: "Beautiful Dream", artist: "Daddy_s_Music", duration: 148,
    mood: ["inspirador", "emotivo"], genre: "Piano", bpm: 72,
    previewUrl: "https://cdn.pixabay.com/audio/2022/08/02/audio_884fe92c21.mp3",
    downloadUrl: "https://cdn.pixabay.com/audio/2022/08/02/audio_884fe92c21.mp3",
  },
  {
    id: "m8", title: "Upbeat Fun", artist: "Music_Unlimited", duration: 122,
    mood: ["feliz", "divertido"], genre: "Pop", bpm: 110,
    previewUrl: "https://cdn.pixabay.com/audio/2023/09/04/audio_0e6a3af00a.mp3",
    downloadUrl: "https://cdn.pixabay.com/audio/2023/09/04/audio_0e6a3af00a.mp3",
  },
  {
    id: "m9", title: "Ambient Piano", artist: "SoulProdMusic", duration: 201,
    mood: ["calmo", "emotivo"], genre: "Ambient", bpm: 68,
    previewUrl: "https://cdn.pixabay.com/audio/2023/04/11/audio_79e939d55c.mp3",
    downloadUrl: "https://cdn.pixabay.com/audio/2023/04/11/audio_79e939d55c.mp3",
  },
  {
    id: "m10", title: "Powerful Beat", artist: "Ashot Danielyan", duration: 160,
    mood: ["épico", "motivacional"], genre: "Cinematic", bpm: 95,
    previewUrl: "https://cdn.pixabay.com/audio/2022/10/25/audio_2b6764f28f.mp3",
    downloadUrl: "https://cdn.pixabay.com/audio/2022/10/25/audio_2b6764f28f.mp3",
  },
];

export const transitionPresets: TransitionPreset[] = [
  { id: "cut", name: "Corte Seco", icon: "✂️" },
  { id: "dissolve", name: "Dissolve", icon: "🌊" },
  { id: "light-leak", name: "Light Leak", icon: "☀️" },
  { id: "zoom", name: "Zoom", icon: "🔍" },
  { id: "glitch", name: "Glitch", icon: "⚡" },
  { id: "slide", name: "Slide", icon: "➡️" },
];

export const safeZonePresets: SafeZonePreset[] = [
  { id: "tiktok", platform: "TikTok", icon: "📱", topInset: 10, bottomInset: 20 },
  { id: "reels", platform: "Instagram Reels", icon: "📱", topInset: 12, bottomInset: 18 },
  { id: "shorts", platform: "YouTube Shorts", icon: "📱", topInset: 8, bottomInset: 15 },
];

export const pipelineSteps: PipelineStep[] = [
  { id: "upload", label: "Upload", icon: "📤", status: "done" },
  { id: "cut", label: "Corte", icon: "✂️", status: "active" },
  { id: "reframe", label: "Enquadramento", icon: "📐", status: "pending" },
  
  { id: "broll", label: "B-Roll", icon: "🎬", status: "pending" },
  { id: "audio", label: "Áudio", icon: "🎧", status: "pending" },
  { id: "color", label: "Cor", icon: "🎨", status: "pending" },
  { id: "subtitles", label: "Legendas", icon: "💬", status: "pending" },
  { id: "preview", label: "Preview", icon: "👁", status: "pending" },
  { id: "export", label: "Exportar", icon: "📦", status: "pending" },
];

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export interface WordSegment {
  id: string;        // e.g. "s15-w0" for words, or "s2" for silence/filler
  parentId: string;  // original segment id
  start: number;
  end: number;
  text: string;
  type: "speech" | "silence" | "filler" | "broll";
  status: "kept" | "removed" | "suggested";
}

/** Split speech segments into individual words with interpolated timestamps */
export function generateWordSegments(segs: Segment[]): WordSegment[] {
  const result: WordSegment[] = [];
  for (const seg of segs) {
    if (seg.type !== "speech") {
      result.push({ id: seg.id, parentId: seg.id, start: seg.start, end: seg.end, text: seg.text, type: seg.type, status: seg.status });
      continue;
    }
    const words = seg.text.split(/\s+/).filter(w => w.length > 0);
    if (words.length <= 1) {
      result.push({ id: seg.id, parentId: seg.id, start: seg.start, end: seg.end, text: seg.text, type: seg.type, status: seg.status });
      continue;
    }
    const duration = seg.end - seg.start;
    const totalChars = words.reduce((a, w) => a + w.length, 0);
    let cursor = seg.start;
    words.forEach((word, i) => {
      const wordDuration = (word.length / totalChars) * duration;
      result.push({
        id: `${seg.id}-w${i}`,
        parentId: seg.id,
        start: cursor,
        end: cursor + wordDuration,
        text: word,
        type: seg.type,
        status: seg.status,
      });
      cursor += wordDuration;
    });
  }
  return result;
}

export const wordSegments: WordSegment[] = generateWordSegments(segments);
