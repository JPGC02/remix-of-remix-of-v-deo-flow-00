import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Scissors, Film, Type, Palette, Download } from "lucide-react";
import { AutoCutPanel } from "./tools/AutoCutPanel";

import { SubtitlesPanel } from "./tools/SubtitlesPanel";
import { ColorGradingPanel } from "./tools/ColorGradingPanel";
import { ExportPanel } from "./tools/ExportPanel";

const TABS = [
  { id: "cut", label: "Corte", icon: Scissors },
  { id: "broll", label: "B-Roll", icon: Film },
  { id: "subs", label: "Legendas", icon: Type },
  { id: "color", label: "Cor", icon: Palette },
  { id: "export", label: "Exportar", icon: Download },
];

export function ToolPanel() {
  return (
    <Tabs defaultValue="cut" className="flex flex-col h-full">
      <TabsList className="w-full justify-start rounded-none border-b border-border bg-transparent h-auto p-0 gap-0">
        {TABS.map((tab) => (
          <TabsTrigger
            key={tab.id}
            value={tab.id}
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 py-2 text-xs gap-1.5"
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>

      <ScrollArea className="flex-1">
        <TabsContent value="cut" className="mt-0"><AutoCutPanel /></TabsContent>
        <TabsContent value="broll" className="mt-0"><div className="p-3 text-xs text-muted-foreground">Use a etapa B-Roll no pipeline.</div></TabsContent>
        <TabsContent value="subs" className="mt-0"><SubtitlesPanel /></TabsContent>
        <TabsContent value="color" className="mt-0"><ColorGradingPanel /></TabsContent>
        <TabsContent value="export" className="mt-0"><ExportPanel /></TabsContent>
      </ScrollArea>
    </Tabs>
  );
}
