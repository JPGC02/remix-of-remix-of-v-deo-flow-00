import { useState, useEffect } from "react";
import { Settings, Save, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface SettingField {
  settingKey: string;
  label: string;
  placeholder: string;
}

const SETTINGS_FIELDS: { section: string; description: string; fields: SettingField[] }[] = [
  {
    section: "Google AI (VEO)",
    description: "Para gerar vídeos com VEO 3.",
    fields: [
      { settingKey: "GOOGLE_AI_API_KEY", label: "Google AI API Key", placeholder: "AIza..." },
    ],
  },
  {
    section: "Higgsfield",
    description: "Para gerar vídeos com DoP, Kling e Seedance.",
    fields: [
      { settingKey: "HIGGSFIELD_API_KEY", label: "API Key", placeholder: "hf_..." },
      { settingKey: "HIGGSFIELD_API_SECRET", label: "API Secret", placeholder: "hfs_..." },
    ],
  },
];

export function SettingsDialog() {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [masked, setMasked] = useState<Record<string, string>>({});
  const [exists, setExists] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const { toast } = useToast();

  const allKeys = SETTINGS_FIELDS.flatMap((s) => s.fields.map((f) => f.settingKey));

  useEffect(() => {
    if (open) loadAllKeys();
  }, [open]);

  const loadAllKeys = async () => {
    setLoading(true);
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const results = await Promise.all(
        allKeys.map(async (key) => {
          const res = await fetch(
            `https://${projectId}.supabase.co/functions/v1/manage-settings?key=${key}`,
            { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } }
          );
          return { key, ...(await res.json()) };
        })
      );

      const newMasked: Record<string, string> = {};
      const newExists: Record<string, boolean> = {};
      for (const r of results) {
        newExists[r.key] = !!r.exists;
        if (r.exists) newMasked[r.key] = r.masked;
      }
      setMasked(newMasked);
      setExists(newExists);
    } catch (e) {
      console.error("Failed to load settings:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (settingKey: string) => {
    const val = values[settingKey]?.trim();
    if (!val) return;
    setSavingKey(settingKey);
    setSavedKey(null);
    try {
      const { error } = await supabase.functions.invoke("manage-settings", {
        body: { key: settingKey, value: val },
      });
      if (error) throw error;

      toast({ title: "Chave salva com sucesso!" });
      setSavedKey(settingKey);
      setValues((prev) => ({ ...prev, [settingKey]: "" }));
      setExists((prev) => ({ ...prev, [settingKey]: true }));
      await loadAllKeys();
      setTimeout(() => setSavedKey(null), 2000);
    } catch (e) {
      toast({
        title: "Erro ao salvar",
        description: e instanceof Error ? e.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7">
          <Settings className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Configurações</DialogTitle>
          <DialogDescription>
            Configure suas chaves de API para geração de vídeos com IA.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5 pt-2">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Carregando...
            </div>
          ) : (
            SETTINGS_FIELDS.map((section) => (
              <div key={section.section} className="space-y-3">
                <div>
                  <h4 className="text-sm font-medium">{section.section}</h4>
                  <p className="text-xs text-muted-foreground">{section.description}</p>
                </div>
                {section.fields.map((field) => (
                  <div key={field.settingKey} className="space-y-1">
                    <Label htmlFor={field.settingKey} className="text-xs">
                      {field.label}
                    </Label>
                    {exists[field.settingKey] && masked[field.settingKey] && (
                      <p className="text-[10px] text-muted-foreground">
                        Atual: <code className="bg-muted px-1 py-0.5 rounded">{masked[field.settingKey]}</code>
                      </p>
                    )}
                    <div className="flex gap-2">
                      <Input
                        id={field.settingKey}
                        type="password"
                        placeholder={exists[field.settingKey] ? "Nova chave para substituir" : field.placeholder}
                        value={values[field.settingKey] || ""}
                        onChange={(e) => setValues((prev) => ({ ...prev, [field.settingKey]: e.target.value }))}
                      />
                      <Button
                        onClick={() => handleSave(field.settingKey)}
                        disabled={!values[field.settingKey]?.trim() || savingKey === field.settingKey}
                        size="sm"
                      >
                        {savingKey === field.settingKey ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : savedKey === field.settingKey ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <Save className="h-3.5 w-3.5" />
                        )}
                        Salvar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
