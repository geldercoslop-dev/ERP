export type PdfResult = {
  success: boolean;
  message: string;
};

export async function generatePdf(): Promise<PdfResult> {
  return {
    success: false,
    message: "PDF service não implementado"
  };
}
