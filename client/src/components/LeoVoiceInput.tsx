/**
 * Entrada e saída por voz do LEO: speech-to-text (entrada) e text-to-speech (resposta).
 */
import { useState, useCallback, useRef, useEffect } from "react";
import { Mic, MicOff, Volume2, VolumeX } from "lucide-react";
import { Button } from "./ui/button";

type LeoVoiceInputProps = {
  onTranscript?: (text: string) => void;
  onSpeakRequest?: (text: string) => void;
  lastResponse?: string;
  disabled?: boolean;
  className?: string;
};

export function LeoVoiceInput({
  onTranscript,
  onSpeakRequest,
  lastResponse,
  disabled,
  className = "",
}: LeoVoiceInputProps) {
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [recognitionSupported, setRecognitionSupported] = useState(false);
  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    setSpeechSupported(typeof window !== "undefined" && "speechSynthesis" in window);
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setRecognitionSupported(!!SpeechRecognition);
  }, []);

  const startListening = useCallback(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition || !onTranscript) return;
    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = "pt-BR";
    rec.onresult = (e: any) => {
      const t = e.results[e.results.length - 1];
      const text = t.isFinal ? t[0].transcript : "";
      if (text) onTranscript(text.trim());
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    try {
      rec.start();
      recognitionRef.current = rec;
      setListening(true);
    } catch {
      setListening(false);
    }
  }, [onTranscript]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    setListening(false);
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (!text || !speechSupported) return;
      if (synthRef.current?.speaking) {
        synthRef.current.cancel();
      }
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "pt-BR";
      u.rate = 0.95;
      u.onstart = () => setSpeaking(true);
      u.onend = () => setSpeaking(false);
      u.onerror = () => setSpeaking(false);
      synthRef.current = window.speechSynthesis;
      utteranceRef.current = u;
      window.speechSynthesis.speak(u);
      onSpeakRequest?.(text);
    },
    [speechSupported, onSpeakRequest]
  );


  const toggleSpeakLast = useCallback(() => {
    if (!lastResponse) return;
    if (speaking) {
      window.speechSynthesis?.cancel();
      setSpeaking(false);
    } else {
      speak(lastResponse);
    }
  }, [lastResponse, speaking, speak]);

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {recognitionSupported && onTranscript && (
        <Button
          type="button"
          variant={listening ? "destructive" : "outline"}
          size="icon"
          onClick={listening ? stopListening : startListening}
          disabled={disabled}
          title={listening ? "Parar gravação" : "Falar (entrada por voz)"}
        >
          {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </Button>
      )}
      {speechSupported && lastResponse && (
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={toggleSpeakLast}
          disabled={disabled}
          title={speaking ? "Parar leitura" : "Ouvir última resposta do LEO"}
        >
          {speaking ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </Button>
      )}
    </div>
  );
}
