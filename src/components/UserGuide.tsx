import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  HelpCircle,
  Upload,
  Scissors,
  Crop,
  Film,
  Music,
  Palette,
  Type,
  PlayCircle,
  Download,
  Sparkles,
  LayoutGrid,
  Lightbulb,
  Rocket,
  KeyRound,
  ArrowRight,
} from "lucide-react";

type Section = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
};

const SECTIONS: Section[] = [
  { id: "intro", label: "Visão Geral", icon: Rocket },
  { id: "dashboard", label: "Dashboard", icon: LayoutGrid },
  { id: "step-upload", label: "1. Upload", icon: Upload },
  { id: "step-cut", label: "2. Corte", icon: Scissors, badge: "IA" },
  { id: "step-reframe", label: "3. Reframe", icon: Crop, badge: "IA" },
  { id: "step-broll", label: "4. B-Roll", icon: Film, badge: "IA" },
  { id: "step-audio", label: "5. Áudio", icon: Music },
  { id: "step-color", label: "6. Cor", icon: Palette },
  { id: "step-subtitles", label: "7. Legendas", icon: Type },
  { id: "step-preview", label: "8. Preview", icon: PlayCircle },
  { id: "step-export", label: "9. Exportar", icon: Download },
  { id: "tips", label: "Dicas & Atalhos", icon: Lightbulb },
  { id: "secrets", label: "Chaves & APIs", icon: KeyRound },
];

function Step({
  num,
  title,
  children,
}: {
  num: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/15 text-primary text-xs font-semibold flex items-center justify-center mt-0.5">
        {num}
      </div>
      <div className="text-sm text-muted-foreground leading-relaxed flex-1">
        <span className="font-medium text-foreground">{title}.</span> {children}
      </div>
    </div>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 p-3 rounded-lg bg-primary/5 border border-primary/15 text-sm text-foreground/90">
      <Lightbulb className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  subtitle,
  badge,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
  badge?: string;
}) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-5 h-5 text-primary" />
        <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
        {badge && (
          <Badge variant="secondary" className="text-[10px] h-5">
            {badge}
          </Badge>
        )}
      </div>
      {subtitle && (
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      )}
    </div>
  );
}

export function UserGuide() {
  const [active, setActive] = useState<string>("intro");

  const scrollTo = (id: string) => {
    setActive(id);
    const el = document.getElementById(`guide-${id}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Abrir guia de uso">
          <HelpCircle className="w-4 h-4 mr-1" />
          Ajuda
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-full sm:max-w-3xl p-0 flex flex-col gap-0"
      >
        <SheetHeader className="px-6 py-4 border-b border-border">
          <SheetTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="w-5 h-5 text-primary" />
            Guia de Uso — Video Maker AI
          </SheetTitle>
          <SheetDescription>
            Tour completo de cada etapa e funcionalidade do editor.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 grid grid-cols-[200px_1fr] min-h-0">
          {/* Sidebar nav */}
          <nav className="border-r border-border bg-muted/30 overflow-y-auto py-3">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  onClick={() => scrollTo(s.id)}
                  className={cn(
                    "w-full flex items-center gap-2 px-4 py-2 text-xs text-left transition-colors",
                    active === s.id
                      ? "text-primary bg-primary/10 border-l-2 border-primary font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/50 border-l-2 border-transparent"
                  )}
                >
                  <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="flex-1 truncate">{s.label}</span>
                  {s.badge && (
                    <span className="text-[9px] px-1 rounded bg-primary/20 text-primary font-semibold">
                      {s.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Content */}
          <ScrollArea className="h-full">
            <div className="p-6 space-y-10 max-w-2xl">
              {/* INTRO */}
              <section id="guide-intro">
                <SectionHeader
                  icon={Rocket}
                  title="Visão Geral"
                  subtitle="Editor de vídeo com IA em 9 etapas lineares."
                />
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                  O <strong className="text-foreground">Video Maker AI</strong> transforma
                  vídeos brutos em conteúdo pronto para redes sociais
                  (Reels, TikTok, Shorts) usando inteligência artificial. O fluxo é
                  guiado: cada etapa salva automaticamente e você pode voltar a
                  qualquer momento.
                </p>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  {[
                    "Upload",
                    "Corte",
                    "Reframe",
                    "B-Roll",
                    "Áudio",
                    "Cor",
                    "Legendas",
                    "Preview",
                    "Exportar",
                  ].map((s, i) => (
                    <div
                      key={s}
                      className="flex items-center gap-1 p-2 rounded border border-border bg-card"
                    >
                      <span className="text-primary font-semibold">{i + 1}.</span>
                      <span>{s}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4">
                  <Tip>
                    Tudo é salvo automaticamente no projeto. Você pode fechar a aba
                    e retomar do mesmo ponto depois.
                  </Tip>
                </div>
              </section>

              {/* DASHBOARD */}
              <section id="guide-dashboard">
                <SectionHeader
                  icon={LayoutGrid}
                  title="Dashboard — Meus Projetos"
                  subtitle="Tela inicial onde você gerencia seus vídeos."
                />
                <div className="space-y-3">
                  <Step num={1} title="Criar projeto">
                    Clique em <strong>Novo Projeto</strong> no canto superior
                    direito. Você é levado direto ao editor na etapa de Upload.
                  </Step>
                  <Step num={2} title="Abrir um projeto">
                    Clique em qualquer card. O editor abre na última etapa em que
                    você estava.
                  </Step>
                  <Step num={3} title="Excluir">
                    Passe o mouse sobre o card e clique no ícone de lixeira que
                    aparece.
                  </Step>
                  <Step num={4} title="Tema claro/escuro">
                    Use o botão de sol/lua no topo. O tema escuro é o padrão.
                  </Step>
                </div>
              </section>

              {/* UPLOAD */}
              <section id="guide-step-upload">
                <SectionHeader
                  icon={Upload}
                  title="1. Upload"
                  subtitle="Envie o vídeo bruto e gere a transcrição automática."
                />
                <div className="space-y-3">
                  <Step num={1} title="Selecione o arquivo">
                    Arraste e solte ou clique para escolher. Aceita MP4, MOV, WebM
                    e mais. Limite recomendado: <strong>500 MB</strong>.
                  </Step>
                  <Step num={2} title="Aguarde o upload">
                    O vídeo é enviado para o armazenamento seguro. Você verá uma
                    barra de progresso.
                  </Step>
                  <Step num={3} title="Transcrição automática">
                    Após o upload, a IA (Gemini) transcreve o áudio em
                    português, palavra por palavra, com timestamps precisos.
                  </Step>
                  <Step num={4} title="Avance">
                    Quando aparecer <strong>"Concluído"</strong>, clique em
                    <em> Próximo</em>.
                  </Step>
                </div>
                <div className="mt-4">
                  <Tip>
                    Vídeos com áudio limpo e fala clara geram transcrição mais
                    precisa — o que melhora os cortes de IA depois.
                  </Tip>
                </div>
              </section>

              {/* CUT */}
              <section id="guide-step-cut">
                <SectionHeader
                  icon={Scissors}
                  title="2. Corte"
                  subtitle="Remova silêncios, takes ruins e palavras de preenchimento."
                  badge="IA"
                />
                <div className="space-y-3">
                  <Step num={1} title="Auto-Cut com IA">
                    No painel direito, ative os toggles de
                    <strong> Silêncios</strong>, <strong>Bad Takes</strong> e
                    <strong> Palavras de preenchimento</strong> (ex: "tipo",
                    "então"). Clique em <em>Analisar</em>.
                  </Step>
                  <Step num={2} title="Revise as sugestões">
                    Cada corte sugerido aparece com contexto. Aceite ou rejeite
                    individualmente.
                  </Step>
                  <Step num={3} title="Corte manual no transcript">
                    Selecione palavras na transcrição e clique com o botão
                    direito → <strong>Cortar</strong>. Use
                    <strong> Restaurar</strong> para desfazer.
                  </Step>
                  <Step num={4} title="Timeline visual">
                    Filmstrip mostra trechos cortados em vermelho. Arraste as
                    bordas para ajustar com precisão (estilo Gling).
                  </Step>
                </div>
                <div className="mt-4">
                  <Tip>
                    O preview <strong>pula</strong> automaticamente os trechos
                    cortados durante a reprodução.
                  </Tip>
                </div>
              </section>

              {/* REFRAME */}
              <section id="guide-step-reframe">
                <SectionHeader
                  icon={Crop}
                  title="3. Reframe"
                  subtitle="Adapte o vídeo para vertical, quadrado ou horizontal."
                  badge="IA"
                />
                <div className="space-y-3">
                  <Step num={1} title="Escolha o aspect ratio">
                    9:16 (Reels/TikTok), 1:1 (Feed), 4:5 (Instagram), 16:9
                    (YouTube).
                  </Step>
                  <Step num={2} title="Auto Tracking de rosto">
                    Ative para que a IA (MediaPipe) detecte o rosto e mantenha-o
                    centralizado automaticamente, com suavização.
                  </Step>
                  <Step num={3} title="Ajuste manual">
                    Arraste o quadro de corte sobre o vídeo. Use o grid 3×3
                    para reposicionar.
                  </Step>
                </div>
              </section>

              {/* B-ROLL */}
              <section id="guide-step-broll">
                <SectionHeader
                  icon={Film}
                  title="4. B-Roll"
                  subtitle="Insira imagens, vídeos de banco e clipes gerados por IA."
                  badge="IA"
                />
                <div className="space-y-3">
                  <Step num={1} title="Sugestões automáticas">
                    A IA lê a transcrição e sugere B-Rolls relevantes para
                    trechos específicos.
                  </Step>
                  <Step num={2} title="Banco de vídeos (Pexels)">
                    Cada sugestão busca clipes reais. Você pode trocar pela
                    alternativa que preferir.
                  </Step>
                  <Step num={3} title="Geração com IA">
                    Use VEO 3.1 ou Higgsfield para gerar vídeos
                    sob demanda a partir de um prompt.
                  </Step>
                  <Step num={4} title="Inserção manual">
                    Adicione um trecho do transcript e busque/gere uma mídia
                    específica.
                  </Step>
                  <Step num={5} title="Transições">
                    Dissolve, light leak e cortes secos são aplicados
                    automaticamente entre cenas.
                  </Step>
                </div>
                <div className="mt-4">
                  <Tip>
                    Geração com IA pode levar 1–3 minutos. Você pode continuar
                    editando enquanto processa.
                  </Tip>
                </div>
              </section>

              {/* AUDIO */}
              <section id="guide-step-audio">
                <SectionHeader
                  icon={Music}
                  title="5. Áudio"
                  subtitle="Limpe a voz, adicione música de fundo e equalize."
                />
                <div className="space-y-3">
                  <Step num={1} title="Processamento vocal">
                    Ative <strong>Redução de ruído</strong>,
                    <strong> EQ</strong> e <strong>Compressor</strong> para uma
                    voz mais profissional.
                  </Step>
                  <Step num={2} title="Música de fundo">
                    Escolha uma trilha do banco ou faça upload do seu MP3/WAV.
                  </Step>
                  <Step num={3} title="Auto-Ducking">
                    A música abaixa automaticamente quando alguém fala e volta
                    quando o silêncio retorna.
                  </Step>
                  <Step num={4} title="Volumes independentes">
                    Ajuste voz e música separadamente. Veja o medidor LUFS em
                    tempo real.
                  </Step>
                </div>
              </section>

              {/* COLOR */}
              <section id="guide-step-color">
                <SectionHeader
                  icon={Palette}
                  title="6. Cor"
                  subtitle="Aplique presets de cor com pré-visualização em tempo real."
                />
                <div className="space-y-3">
                  <Step num={1} title="Escolha um preset">
                    Cinematic, Warm, Cool, Vintage, Vivid e mais. Cada um ajusta
                    brilho, contraste, saturação e temperatura.
                  </Step>
                  <Step num={2} title="Intensidade">
                    Use o slider para misturar o preset com o vídeo original
                    (0–100%).
                  </Step>
                  <Step num={3} title="Ajustes finos">
                    Brilho, contraste, saturação e temperatura individuais para
                    correções pontuais.
                  </Step>
                </div>
              </section>

              {/* SUBTITLES */}
              <section id="guide-step-subtitles">
                <SectionHeader
                  icon={Type}
                  title="7. Legendas"
                  subtitle="Estilo Hormozi, Karaoke e mais — totalmente customizável."
                />
                <div className="space-y-3">
                  <Step num={1} title="Escolha um preset">
                    Hormozi (palavra destacada), Karaoke, Boxed, Outline ou
                    Minimal.
                  </Step>
                  <Step num={2} title="Tipografia">
                    Fontes: Montserrat, Poppins, Inter, Bebas Neue, Oswald, Lato.
                    Caixa alta/baixa, peso, tamanho.
                  </Step>
                  <Step num={3} title="Cores e contorno">
                    Cor do texto, cor da palavra ativa (highlight) e espessura do
                    contorno preto.
                  </Step>
                  <Step num={4} title="Posição e safe zones">
                    Topo, centro ou base. Veja as zonas seguras de TikTok, IG e
                    Shorts para evitar que UI cubra o texto.
                  </Step>
                  <Step num={5} title="Correção de texto">
                    É a única etapa onde você pode editar o texto da
                    transcrição. Clique em uma palavra para corrigir.
                  </Step>
                </div>
              </section>

              {/* PREVIEW */}
              <section id="guide-step-preview">
                <SectionHeader
                  icon={PlayCircle}
                  title="8. Preview"
                  subtitle="Confira o resultado final antes de exportar."
                />
                <div className="space-y-3">
                  <Step num={1} title="Reprodução completa">
                    Cortes, B-Rolls, legendas, color e áudio aparecem
                    exatamente como ficarão no arquivo final.
                  </Step>
                  <Step num={2} title="Volte para ajustar">
                    Use a navegação superior para voltar a qualquer etapa sem
                    perder o trabalho.
                  </Step>
                </div>
              </section>

              {/* EXPORT */}
              <section id="guide-step-export">
                <SectionHeader
                  icon={Download}
                  title="9. Exportar"
                  subtitle="Renderize o vídeo final em MP4 ou WebM."
                />
                <div className="space-y-3">
                  <Step num={1} title="Escolha o formato">
                    <strong>MP4</strong> (H.264 + AAC) é o mais compatível.
                    <strong> WebM</strong> (VP9) é mais rápido e leve.
                  </Step>
                  <Step num={2} title="Aspect ratio e resolução">
                    9:16, 16:9, 1:1 ou 4:5. Resoluções: 720p, 1080p ou 4K.
                  </Step>
                  <Step num={3} title="Qualidade">
                    Web (2.5 Mbps), Alta (5 Mbps) ou Máxima (10 Mbps).
                  </Step>
                  <Step num={4} title="Renderize">
                    Clique em <strong>Exportar</strong>. O navegador renderiza
                    cada quadro via Canvas + MediaRecorder. Em MP4, o
                    <strong> FFmpeg.wasm</strong> faz o transcode no final.
                  </Step>
                  <Step num={5} title="Baixe">
                    Quando aparecer <strong>"Concluído!"</strong>, clique em
                    <em> Baixar Vídeo</em>.
                  </Step>
                </div>
                <div className="mt-4 space-y-2">
                  <Tip>
                    Não feche a aba durante a exportação — o processo roda
                    inteiramente no seu navegador.
                  </Tip>
                  <Tip>
                    MP4 é mais lento (transcode H.264). Para testes rápidos,
                    exporte em WebM e converta depois.
                  </Tip>
                </div>
              </section>

              {/* TIPS */}
              <section id="guide-tips">
                <SectionHeader
                  icon={Lightbulb}
                  title="Dicas & Atalhos"
                  subtitle="Acelere seu fluxo de trabalho."
                />
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex gap-2">
                    <ArrowRight className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                    <span>
                      <strong className="text-foreground">Espaço</strong>: play /
                      pause no preview.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <ArrowRight className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                    <span>
                      <strong className="text-foreground">Botão direito</strong>{" "}
                      em palavras do transcript: cortar / restaurar.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <ArrowRight className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                    <span>
                      Tudo salva automaticamente — pode fechar a aba.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <ArrowRight className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                    <span>
                      Use o tema claro para gravações em tela.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <ArrowRight className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                    <span>
                      A navegação superior mostra quais etapas já foram
                      configuradas.
                    </span>
                  </li>
                </ul>
              </section>

              {/* SECRETS */}
              <section id="guide-secrets">
                <SectionHeader
                  icon={KeyRound}
                  title="Chaves & APIs"
                  subtitle="Como o sistema usa serviços externos."
                />
                <p className="text-sm text-muted-foreground leading-relaxed mb-3">
                  As integrações de IA (Gemini, VEO, Higgsfield) e bancos de
                  mídia (Pexels) já estão configuradas no backend. Você não
                  precisa fornecer chaves para usar o editor.
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Limites de uso: vídeos até <strong>500 MB</strong> para
                  transcrição, geração de B-Roll com IA pode levar alguns
                  minutos por clipe.
                </p>
              </section>

              <div className="pt-6 border-t border-border text-center">
                <p className="text-xs text-muted-foreground">
                  Precisa de mais ajuda? Reporte um problema ou sugestão pelo
                  chat.
                </p>
              </div>
            </div>
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
}
