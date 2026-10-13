// Re-export apenas. Use sempre `./trpcClient` para garantir o mesmo client
// cookie-only AUTH-H6 com credentials include e refresh centralizado.
import { trpc } from "./trpcClient";
export { trpc };
