import { useLocation } from "wouter";
import { ShieldAlert, FileText, UtensilsCrossed, ClipboardList, FileWarning, MessageSquare, BookOpen, HelpCircle, AlertTriangle, Lock } from "lucide-react";

const cards = [
  {
    id: "lock-up-slip",
    title: "Lock-Up Slip",
    description: "Generate confinement placement narratives for incoming inmates.",
    icon: Lock,
    active: true,
    route: "/lock-up-slip",
  },
  {
    id: "strip-property",
    title: "Strip / Property Restriction",
    description: "Document property restriction placements.",
    icon: ShieldAlert,
    active: false,
  },
  {
    id: "meal-restriction",
    title: "Meal Restriction / Loaf",
    description: "Generate special management meal documentation.",
    icon: UtensilsCrossed,
    active: false,
  },
  {
    id: "incident-report",
    title: "Incident Report Narrative",
    description: "Draft IR narrative descriptions.",
    icon: FileText,
    active: false,
  },
  {
    id: "dr-description",
    title: "DR Description",
    description: "Complete the description portion of a disciplinary report.",
    icon: ClipboardList,
    active: false,
  },
  {
    id: "ask-cdc",
    title: "Ask CDC",
    description: "Quick reference for CDC policy and procedures.",
    icon: MessageSquare,
    active: false,
  },
  {
    id: "ask-fdc",
    title: "Ask FDC Policy",
    description: "Look up FDC policy guidance and references.",
    icon: BookOpen,
    active: false,
  },
  {
    id: "what-form",
    title: "What Form Do I Need?",
    description: "Find the correct form for any confinement situation.",
    icon: HelpCircle,
    active: false,
  },
];

export default function Dashboard() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-2 h-8 rounded-full bg-primary" />
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Confinement Desk Coach
            </h1>
          </div>
          <p className="ml-5 text-sm text-muted-foreground">
            Documentation support for confinement officers
          </p>
        </div>

        <div className="mb-8 flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
          <div>
            <p className="text-sm font-semibold text-amber-300 uppercase tracking-wide mb-1">
              Training Sandbox Mode — Active
            </p>
            <p className="text-sm text-amber-200/80 leading-relaxed">
              Use <strong>fake information only.</strong> Do not enter real inmate names, DC numbers,
              medical information, or any restricted work information. This tool is for training
              and practice purposes only. No data is saved or transmitted.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <button
                key={card.id}
                onClick={() => card.active && card.route && navigate(card.route)}
                disabled={!card.active}
                className={[
                  "relative flex flex-col items-start gap-3 rounded-xl border p-5 text-left transition-all duration-150",
                  card.active
                    ? "border-card-border bg-card hover:border-primary/60 hover:bg-card cursor-pointer hover:shadow-lg hover:shadow-primary/5"
                    : "border-border/40 bg-card/40 cursor-not-allowed opacity-60",
                ].join(" ")}
              >
                <div className={[
                  "flex h-10 w-10 items-center justify-center rounded-lg",
                  card.active ? "bg-primary/15 text-primary" : "bg-muted/40 text-muted-foreground",
                ].join(" ")}>
                  <Icon className="h-5 w-5" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-sm text-foreground leading-tight">
                      {card.title}
                    </span>
                    {!card.active && (
                      <span className="shrink-0 rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                        Soon
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {card.description}
                  </p>
                </div>

                {card.active && (
                  <div className="w-full pt-1 border-t border-border/50">
                    <span className="text-xs font-medium text-primary">
                      Open &rarr;
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-8 flex items-center gap-2 text-xs text-muted-foreground/50">
          <FileWarning className="h-3.5 w-3.5" />
          <span>Training Sandbox Mode &bull; No real data stored &bull; For practice use only</span>
        </div>
      </div>
    </div>
  );
}
