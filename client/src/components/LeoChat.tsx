import { useRef, useEffect } from "react";
import { Send, Bot, User, Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { useLeoChat, type ChatMessage } from "../hooks/useLeoChat";
import { cn } from "../lib/utils";

function DataTable({ data }: { data: unknown }) {
  if (data == null) return null;
  if (Array.isArray(data)) {
    if (data.length === 0) return <p className="text-sm text-muted-foreground">Nenhum registro.</p>;
    const first = data[0];
    const keys = typeof first === "object" && first !== null ? Object.keys(first as object) : [];
    if (keys.length === 0) return <pre className="text-xs overflow-auto">{JSON.stringify(data)}</pre>;
    return (
      <div className="overflow-x-auto rounded-md border border-border mt-2">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b border-border">
              {keys.map((k) => (
                <th key={k} className="text-left p-2 font-medium">
                  {k}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row: unknown, i: number) => (
              <tr key={i} className="border-b border-border/50">
                {keys.map((k) => (
                  <td key={k} className="p-2">
                    {String((row as Record<string, unknown>)[k] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (typeof data === "object") {
    const entries = Object.entries(data as Record<string, unknown>);
    if (entries.length === 0) return null;
    return (
      <div className="rounded-md border border-border mt-2 p-2 text-sm">
        <table className="w-full">
          <tbody>
            {entries.map(([k, v]) => (
              <tr key={k}>
                <td className="font-medium text-muted-foreground pr-2">{k}</td>
                <td>{typeof v === "object" ? JSON.stringify(v) : String(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return <span>{String(data)}</span>;
}

export function LeoChat({
  className,
  onClose,
  initialSuggestions = [
    "Como está o servidor?",
    "Quem é o cliente João?",
    "Quais pedidos de hoje?",
    "Tem cerveja em estoque?",
  ],
}: {
  className?: string;
  onClose?: () => void;
  initialSuggestions?: string[];
}) {
  const { messages, loading, error, sendMessage } = useLeoChat();
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo(0, listRef.current.scrollHeight);
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const input = inputRef.current;
    if (input?.value.trim()) {
      sendMessage(input.value.trim());
      input.value = "";
    }
  };

  return (
    <Card className={cn("flex flex-col h-[480px] max-h-[85vh]", className)}>
      <CardHeader className="flex-shrink-0 pb-2 border-b border-border">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Bot className="h-4 w-4" />
            </div>
            Assistente LEO
          </CardTitle>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              Fechar
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col flex-1 min-h-0 p-0">
        <div
          ref={listRef}
          className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[200px]"
        >
          {messages.length === 0 && (
            <div className="flex gap-3 items-start">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                <Bot className="h-4 w-4" />
              </div>
              <div className="rounded-2xl rounded-tl-none bg-muted px-4 py-2 text-sm text-muted-foreground max-w-[90%]">
                <p className="font-medium text-foreground mb-1">Exemplos de teste:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  {initialSuggestions.map((s, i) => (
                    <li key={i}>
                      <button
                        type="button"
                        className="text-left hover:underline text-primary"
                        onClick={() => sendMessage(s)}
                      >
                        &quot;{s}&quot;
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
          {loading && (
            <div className="flex gap-3 items-start">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
              <div className="rounded-2xl rounded-tl-none bg-muted px-4 py-2 text-sm text-muted-foreground">
                LEO está pensando...
              </div>
            </div>
          )}
        </div>
        {error && (
          <div className="px-4 py-1 text-sm text-destructive bg-destructive/10">
            {error}
          </div>
        )}
        <form
          onSubmit={handleSubmit}
          className="flex gap-2 p-3 border-t border-border bg-muted/20 flex-shrink-0"
        >
          <input
            ref={inputRef}
            type="text"
            placeholder="Pergunte ao LEO..."
            className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            disabled={loading}
          />
          <Button type="submit" size="icon" disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const leo = message.leoResponse;

  return (
    <div
      className={cn(
        "flex gap-3 items-start",
        isUser && "flex-row-reverse"
      )}
    >
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          isUser ? "bg-muted" : "bg-primary/15 text-primary"
        )}
      >
        {isUser ? (
          <User className="h-4 w-4 text-muted-foreground" />
        ) : (
          <Bot className="h-4 w-4" />
        )}
      </div>
      <div
        className={cn(
          "rounded-2xl px-4 py-2 text-sm max-w-[85%]",
          isUser
            ? "rounded-tr-none bg-primary text-primary-foreground"
            : "rounded-tl-none bg-muted space-y-2"
        )}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>
        {!isUser && leo && (
          <>
            {leo.action && (
              <p className="text-xs text-muted-foreground">Ação: {leo.action}</p>
            )}
            {leo.data != null && (
              <DataTable data={leo.data} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
