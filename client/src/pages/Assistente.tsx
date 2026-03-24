import { useAuth } from "@/hooks/useAuth";
import { useAuthStore } from "@/store/authStore";
import { trpc } from "@/lib/trpcClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useState, useRef, useEffect } from "react";
import { Send, Bot, User } from "lucide-react";
import { LeoVoiceInput } from "@/components/LeoVoiceInput";

type Mensagem = {
  pergunta: string;
  resposta: string;
  pdf?: { dataUri: string; nomeArquivo: string };
  /** Ação aguardando confirmação; ao confirmar chama ai.confirmAction. */
  pendingConfirmation?: { action: string; resumo: string; payload: Record<string, unknown> };
  /** Resultado após confirmação (sucesso ou erro). */
  confirmResult?: string;
  /** URL de imagem (gráfico, QR code) retornada pelo LEO. */
  imageUrl?: string;
};

export default function Assistente() {
  const { isAuthenticated } = useAuthStore();
  
  // Se não estiver autenticado, mostrar loading em vez de redirecionar
  if (!isAuthenticated) {
    return <div>Carregando...</div>;
  }
  
  const [texto, setTexto] = useState("");
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  const ask = trpc.leo.ask.useMutation({
    onSuccess(data: any, variables: any) {
      setMensagens((prev) => [
        ...prev,
        {
          pergunta: variables.pergunta,
          resposta: data.resposta,
          pdf: data.pdf,
          imageUrl: data.imageUrl,
          ...(data.pendingConfirmation && {
            pendingConfirmation: {
              action: data.pendingConfirmation.action,
              resumo: data.pendingConfirmation.resumo,
              payload: data.pendingConfirmation.payload as Record<string, unknown>,
            },
          }),
        },
      ]);
      setTexto("");
    },
  });

  useEffect(() => {
    listRef.current?.scrollTo(0, listRef.current.scrollHeight);
  }, [mensagens]);

  const enviar = () => {
    const p = texto.trim();
    if (!p || ask.isPending) return;
    ask.mutate({ pergunta: p });
  };

  const baixarPdf = (dataUri: string, nomeArquivo: string) => {
    const a = document.createElement("a");
    a.href = dataUri;
    a.download = nomeArquivo;
    a.click();
  };

  /** TODO: expor procedure no servidor (ex. mutação de domínio ou leo.control) quando o fluxo estiver definido. */
  const onConfirmar = (m: Mensagem) => {
    if (!m.pendingConfirmation) return;
    setMensagens((prev) =>
      prev.map((row) =>
        row === m
          ? {
              ...row,
              pendingConfirmation: undefined,
              confirmResult:
                "Confirmação automática indisponível nesta versão. Execute a ação na tela correspondente do ERP.",
            }
          : row
      )
    );
  };

  return (
    <div className="min-h-[200px] p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">LEO — Assistente da Empresa</h1>
        <p className="text-sm text-muted-foreground">
          Pedidos, vendas, clientes, estoque, financeiro; CEP, CNPJ, clima, frete, rastreio, dólar; gráficos e QR Code. Relatórios em PDF.
        </p>
      </div>

      <Card className="border-border overflow-hidden">
        <CardHeader className="pb-2 bg-muted/30 border-b">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Bot className="h-5 w-5" />
            </div>
            Chat com o LEO
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 flex flex-col">
          <div
            ref={listRef}
            className="min-h-[280px] max-h-[420px] overflow-y-auto p-4 space-y-4 flex-1"
          >
            {mensagens.length === 0 && (
              <div className="flex gap-3 items-start">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="rounded-2xl rounded-tl-none bg-muted px-4 py-2 text-sm text-muted-foreground max-w-[85%]">
                  Exemplos: &quot;quantos pedidos hoje?&quot;, &quot;qual o endereço do CEP 29100000?&quot;, &quot;vai chover hoje em Vila Velha?&quot;, &quot;qual o dólar hoje?&quot;, &quot;como foram as vendas?&quot; (gráfico), &quot;gera estoque em PDF&quot;.
                </div>
              </div>
            )}
            {mensagens.map((m, i) => (
              <div key={i} className="space-y-3">
                <div className="flex gap-3 items-start justify-end">
                  <div className="rounded-2xl rounded-tr-none bg-primary text-primary-foreground px-4 py-2 text-sm max-w-[85%]">
                    {m.pergunta}
                  </div>
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
                <div className="flex gap-3 items-start">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="rounded-2xl rounded-tl-none bg-muted px-4 py-2 text-sm max-w-[85%] space-y-2">
                    <p className="text-foreground whitespace-pre-wrap">{m.resposta}</p>
                    {m.imageUrl && (
                      <div className="mt-2">
                        <img
                          src={m.imageUrl}
                          alt="Gráfico ou QR Code"
                          className="max-w-full rounded border border-border"
                          style={{ maxHeight: 320 }}
                        />
                      </div>
                    )}
                    {m.pdf && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="mt-1"
                        onClick={() => baixarPdf(m.pdf!.dataUri, m.pdf!.nomeArquivo)}
                      >
                        Baixar PDF — {m.pdf.nomeArquivo}
                      </Button>
                    )}
                    {m.pendingConfirmation && (
                      <div className="flex gap-2 mt-2">
                        <Button size="sm" onClick={() => onConfirmar(m)}>
                          Confirmar
                        </Button>
                      </div>
                    )}
                    {m.confirmResult && (
                      <p className="text-sm text-muted-foreground mt-1">{m.confirmResult}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2 p-3 border-t bg-muted/20">
            <LeoVoiceInput
              onTranscript={setTexto}
              lastResponse={mensagens.length > 0 ? (mensagens[mensagens.length - 1]?.resposta || "") : undefined}
              disabled={ask.isPending}
            />
            <input
              type="text"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && enviar()}
              placeholder="Pergunte ao LEO..."
              className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm"
              disabled={ask.isPending}
            />
            <Button onClick={enviar} disabled={!texto.trim() || ask.isPending} size="icon" className="shrink-0">
              {ask.isPending ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
