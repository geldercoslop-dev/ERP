// Re-export apenas. Use sempre @/lib/trpcClient para garantir o mesmo client (fetch com X-Session-Token).
import { trpc } from "./trpcClient";
export { trpc };
