import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles, Plus, Trash2, Loader2, Video, LogOut, Sun, Moon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { UserGuide } from "@/components/UserGuide";

interface Project {
  id: string;
  name: string;
  current_step: string;
  created_at: string;
  updated_at: string;
}

const STEP_LABELS: Record<string, string> = {
  upload: "Upload",
  cut: "Corte",
  reframe: "Reframe",
  broll: "B-Roll",
  audio: "Áudio",
  color: "Cor",
  subtitles: "Legendas",
  export: "Exportar",
};

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();

  const loadProjects = async () => {
    const { data, error } = await supabase
      .from("projects")
      .select("id, name, current_step, created_at, updated_at")
      .order("updated_at", { ascending: false });

    if (error) {
      toast({ title: "Erro ao carregar projetos", description: error.message, variant: "destructive" });
    } else {
      setProjects(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadProjects();
  }, []);

  const handleNewProject = async () => {
    if (!user) return;
    setCreating(true);
    const { data, error } = await supabase
      .from("projects")
      .insert({ user_id: user.id, name: `Projeto ${projects.length + 1}` })
      .select("id")
      .single();

    setCreating(false);
    if (error) {
      toast({ title: "Erro ao criar projeto", description: error.message, variant: "destructive" });
    } else if (data) {
      navigate(`/editor/${data.id}`);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const { error } = await supabase.from("projects").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao deletar", description: error.message, variant: "destructive" });
    } else {
      setProjects((prev) => prev.filter((p) => p.id !== id));
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <span className="text-base font-semibold tracking-tight">Video Maker AI</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="p-2 rounded-lg border border-border bg-card hover:bg-secondary transition-colors"
            >
              {theme === "dark" ? <Sun className="w-4 h-4 text-muted-foreground" /> : <Moon className="w-4 h-4 text-muted-foreground" />}
            </button>
            <UserGuide />
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="w-4 h-4 mr-1" />
              Sair
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Meus Projetos</h1>
            <p className="text-sm text-muted-foreground mt-1">Crie e gerencie seus projetos de vídeo</p>
          </div>
          <Button onClick={handleNewProject} disabled={creating}>
            {creating ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
            Novo Projeto
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Video className="w-16 h-16 text-muted-foreground/40 mb-4" />
            <p className="text-lg font-medium">Nenhum projeto ainda</p>
            <p className="text-sm text-muted-foreground mt-1 mb-6">Crie seu primeiro projeto para começar a editar</p>
            <Button onClick={handleNewProject} disabled={creating}>
              <Plus className="w-4 h-4 mr-1" />
              Criar Primeiro Projeto
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <Card
                key={project.id}
                className="cursor-pointer hover:border-primary/40 transition-colors group"
                onClick={() => navigate(`/editor/${project.id}`)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base truncate">{project.name}</CardTitle>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                      onClick={(e) => handleDelete(e, project.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  <CardDescription className="text-xs">
                    Atualizado em {formatDate(project.updated_at)}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "text-xs px-2 py-0.5 rounded-full font-medium",
                      project.current_step === "export"
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground"
                    )}>
                      {STEP_LABELS[project.current_step] || project.current_step}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
