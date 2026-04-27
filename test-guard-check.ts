// Arquivo de teste para validar guards
// Deve ser deletado após o teste

// : any fora de área crítica - DEVE SER PERMITIDO
const x: any = 1;

// unknown com zod - DEVE SER PERMITIDO
import { z as zod } from 'zod';
const schema = zod.object({ name: zod.string() });
const result = schema.parse({ name: 'test' });
