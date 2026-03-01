import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpcClient";
import { useLocation } from "wouter";
import { ArrowLeft, Save, Landmark, QrCode, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

export default function ConfiguracoesBanco() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const utils = trpc.useUtils();

  const [dadosBanco, setDadosBanco] = useState("");
  const [chavePix, setChavePix] = useState("");
  const [loading, setLoading] = useState(false);

  const { data: bancoSalvo } = trpc.config.get.useQuery({ chave: "DADOS_BANCO" });
  const { data: pixSalvo } = trpc.config.get.useQuery({ chave: "CHAVE_PIX" });
  const salvarConfig = trpc.config.set.useMutation();

  useEffect(() => {
    if (bancoSalvo) setDadosBanco(bancoSalvo);
    if (pixSalvo) setChavePix(pixSalvo);
  }, [bancoSalvo, pixSalvo]);

  const handleSalvar = async () => {
    setLoading(true);
    try {
      await salvarConfig.mutateAsync({ chave: "DADOS_BANCO", valor: dadosBanco });
      await salvarConfig.mutateAsync({ chave: "CHAVE_PIX", valor: chavePix });
      toast({ title: "Sucesso", description: "Configurações bancárias salvas!" });
      utils.config.get.invalidate();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-card border-b border-border shadow-sm sticky top-0 z-10">
        <div className="container py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/cadastros")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold">Configurações Bancárias</h1>
        </div>
      </header>

      <main className="container py-6 max-w-2xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary">
              <Landmark className="h-5 w-5" /> DADOS PARA DEPÓSITO/TRANSFERÊNCIA
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="font-bold">INFORMAÇÕES DA CONTA</Label>
              <textarea 
                className="w-full min-h-[120px] p-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Ex: Banco do Brasil&#10;Agência: 1234-5&#10;Conta: 12345-6&#10;Favorecido: Sua Empresa LTDA"
                value={dadosBanco}
                onChange={e => setDadosBanco(e.target.value)}
              />
              <p className="text-xs text-muted-foreground italic">Essas informações aparecerão no rodapé do boleto impresso.</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-600">
              <QrCode className="h-5 w-5" /> CHAVE PIX PARA PAGAMENTO
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="font-bold">CHAVE PIX (CNPJ, CPF, E-MAIL OU TELEFONE)</Label>
              <Input 
                value={chavePix}
                onChange={e => setChavePix(e.target.value)}
                placeholder="Sua chave PIX aqui"
              />
              <div className="bg-blue-50 p-3 rounded-md flex gap-2 items-start mt-2 border border-blue-100">
                <Info className="h-4 w-4 text-blue-600 mt-0.5" />
                <p className="text-xs text-blue-700 leading-relaxed">
                  O sistema usará esta chave para gerar as instruções de pagamento PIX no boleto.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button onClick={handleSalvar} disabled={loading} className="gap-2 bg-green-600 hover:bg-green-700 w-full md:w-auto">
            <Save className="h-4 w-4" /> {loading ? "SALVANDO..." : "SALVAR CONFIGURAÇÕES"}
          </Button>
        </div>
      </main>
    </div>
  );
}
