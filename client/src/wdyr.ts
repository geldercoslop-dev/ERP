/**
 * why-did-you-render – só em DEV.
 * Loga no console o motivo de cada re-render (props/state mudaram).
 * Ajuda a achar renders desnecessários e otimizar.
 */
import React from "react";
import whyDidYouRender from "@welldone-software/why-did-you-render";

if (import.meta.env.DEV) {
  try {
    whyDidYouRender(React, {
      trackAllPureComponents: false,
      trackHooks: true,
      logOnDifferentValues: true,
    });
  } catch {
    // API do pacote mudou – app segue normal
  }
}
