/**
 * P28C — prova real de persistência dos campos GRS de clientes:
 * cpf, cep, dataNascimento, observacao, situacao, bloco, apartamento
 * + filtro por situacao, busca por cpf e default ATIVO.
 */
import { describe, expect } from "vitest";
import { eq } from "drizzle-orm";
import {
  afterAllWithServiceContext,
  beforeAllWithServiceContext,
  itWithServiceContext,
} from "./integration/service-context-harness.js";
import { ensureTenantExists } from "./integration/helpers/tenant.helper.js";
import { getDb, clientes, clienteVendedores } from "../db/core.js";
import * as clientesService from "../services/clientes.service.js";
import { ADMIN_ACTOR } from "../_core/service-actor.js";

const TENANT = 9091;

function toDateStr(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

describe("P28C — campos GRS em clientes", () => {
  let clienteGrsId = 0;

  beforeAllWithServiceContext(async () => {
    const dbConn = await getDb();
    if (!dbConn) throw new Error("DB indisponível para teste P28C");
    await dbConn.delete(clientes).where(eq(clientes.tenantId, TENANT));
    await ensureTenantExists(dbConn, TENANT);
  });

  afterAllWithServiceContext(async () => {
    const dbConn = await getDb();
    if (!dbConn) return;
    await dbConn.delete(clienteVendedores).where(eq(clienteVendedores.tenantId, TENANT));
    await dbConn.delete(clientes).where(eq(clientes.tenantId, TENANT));
  });

  itWithServiceContext("createCliente persiste os 7 campos GRS", async () => {
    const created = await clientesService.createCliente(TENANT, {
      nome: "Cliente GRS Persist",
      telefone: "61991000001",
      cpf: "123.456.789-09",
      cep: "70000-010",
      dataNascimento: "1985-04-12",
      observacao: "Obs GRS",
      situacao: "PROSPECT",
      bloco: "B",
      apartamento: "301",
    });
    expect(created.success).toBe(true);
    clienteGrsId = created.data?.id ?? 0;
    expect(clienteGrsId).toBeGreaterThan(0);

    const dbConn = await getDb();
    const rows = await dbConn!.select().from(clientes).where(eq(clientes.id, clienteGrsId)).limit(1);
    const row = rows[0];
    expect(row.cpf).toBe("123.456.789-09");
    expect(row.cep).toBe("70000-010");
    expect(toDateStr(row.dataNascimento)).toBe("1985-04-12");
    expect(row.observacao).toBe("Obs GRS");
    expect(row.situacao).toBe("PROSPECT");
    expect(row.bloco).toBe("B");
    expect(row.apartamento).toBe("301");
  });

  itWithServiceContext("createCliente aplica default ATIVO", async () => {
    const created = await clientesService.createCliente(TENANT, {
      nome: "Cliente Default Ativo",
      telefone: "61991000003",
    });
    expect(created.success).toBe(true);
    const id = created.data?.id ?? 0;

    const dbConn = await getDb();
    const rows = await dbConn!.select().from(clientes).where(eq(clientes.id, id)).limit(1);
    expect(rows[0].situacao).toBe("ATIVO");
    expect(rows[0].cpf).toBeNull();
    expect(rows[0].dataNascimento).toBeNull();
  });

  itWithServiceContext("updateCliente atualiza GRS sem apagar campos ausentes", async () => {
    const upd = await clientesService.updateCliente(TENANT, ADMIN_ACTOR, clienteGrsId, {
      situacao: "INATIVO",
      observacao: "Obs atualizada",
      cep: "71000-000",
      dataNascimento: "1990-01-01",
    });
    expect(upd.success).toBe(true);

    const dbConn = await getDb();
    const rows = await dbConn!.select().from(clientes).where(eq(clientes.id, clienteGrsId)).limit(1);
    const row = rows[0];
    // atualizados
    expect(row.situacao).toBe("INATIVO");
    expect(row.observacao).toBe("Obs atualizada");
    expect(row.cep).toBe("71000-000");
    expect(toDateStr(row.dataNascimento)).toBe("1990-01-01");
    // preservados (não enviados no update)
    expect(row.cpf).toBe("123.456.789-09");
    expect(row.bloco).toBe("B");
    expect(row.apartamento).toBe("301");
  });

  itWithServiceContext("updateCliente limpa campo quando valor explícito", async () => {
    const upd = await clientesService.updateCliente(TENANT, ADMIN_ACTOR, clienteGrsId, {
      observacao: null,
      dataNascimento: null,
    });
    expect(upd.success).toBe(true);

    const dbConn = await getDb();
    const rows = await dbConn!.select().from(clientes).where(eq(clientes.id, clienteGrsId)).limit(1);
    expect(rows[0].observacao).toBeNull();
    expect(rows[0].dataNascimento).toBeNull();
    // situacao continua INATIVO do update anterior
    expect(rows[0].situacao).toBe("INATIVO");
  });

  itWithServiceContext("listClientes filtra por situacao", async () => {
    const resInativo = await clientesService.listClientes(TENANT, ADMIN_ACTOR, {
      page: 1,
      pageSize: 50,
      situacao: "INATIVO",
    });
    expect(resInativo.success).toBe(true);
    expect(resInativo.data?.items.some((c) => c.id === clienteGrsId)).toBe(true);

    const resAtivo = await clientesService.listClientes(TENANT, ADMIN_ACTOR, {
      page: 1,
      pageSize: 50,
      situacao: "ATIVO",
    });
    expect(resAtivo.success).toBe(true);
    expect(resAtivo.data?.items.some((c) => c.id === clienteGrsId)).toBe(false);
  });

  itWithServiceContext("buscaGlobal/list por cpf encontra o cliente", async () => {
    const res = await clientesService.searchClientesGlobal(TENANT, "123.456.789", 50, ADMIN_ACTOR);
    expect(res.some((c) => c.id === clienteGrsId)).toBe(true);
  });

  itWithServiceContext("getOrCreateCliente persiste campos GRS na criação", async () => {
    const res = await clientesService.getOrCreateCliente(TENANT, {
      nome: "Cliente GOC GRS",
      telefone: "61991000002",
      cpf: "98765432100",
      cep: "72000000",
      dataNascimento: "1970-05-20",
      observacao: "via GOC",
      situacao: "INATIVO",
      bloco: "C",
      apartamento: "12",
    });
    expect(res.success).toBe(true);
    const id = res.data ?? 0;
    expect(id).toBeGreaterThan(0);

    const dbConn = await getDb();
    const rows = await dbConn!.select().from(clientes).where(eq(clientes.id, id)).limit(1);
    const row = rows[0];
    expect(row.cpf).toBe("98765432100");
    expect(row.cep).toBe("72000000");
    expect(toDateStr(row.dataNascimento)).toBe("1970-05-20");
    expect(row.observacao).toBe("via GOC");
    expect(row.situacao).toBe("INATIVO");
    expect(row.bloco).toBe("C");
    expect(row.apartamento).toBe("12");
  });

  itWithServiceContext("isolamento: cliente GRS não aparece para outro tenant", async () => {
    const dbConn = await getDb();
    const cross = await dbConn!
      .select({ id: clientes.id })
      .from(clientes)
      .where(eq(clientes.tenantId, 9999));
    expect(cross.some((c) => c.id === clienteGrsId)).toBe(false);

    const other = await clientesService.getClienteById(9999, ADMIN_ACTOR, clienteGrsId);
    expect(other.data ?? null).toBeNull();
  });
});
