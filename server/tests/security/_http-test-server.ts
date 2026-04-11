import express from "express";
import http from "node:http";

export type HttpTestServer = {
  baseUrl: string;
  port: number;
  close: () => Promise<void>;
};

export async function startHttpTestServer(
  configure: (app: express.Express) => void | Promise<void>
): Promise<HttpTestServer> {
  const app = express();
  app.use(express.json());
  await Promise.resolve(configure(app));

  const server = http.createServer(app);

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Falha ao obter porta do servidor de teste");
  }

  const port = address.port;
  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    baseUrl,
    port,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    },
  };
}