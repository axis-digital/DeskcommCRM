/** Somente banco descartável iniciado explicitamente para este teste. */
import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";

const container = process.env.POOL_PROXY_TEST_CONTAINER;
const suite = container ? describe : describe.skip;
const sql = (query: string) => execFileSync("docker", ["exec", "-i", container!, "psql", "-U", "postgres", "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1"], { input: query, encoding: "utf8" }).trim();
const concorrente = (query: string) => new Promise<string>((resolve, reject) => {
  const child = spawn("docker", ["exec", "-i", container!, "psql", "-U", "postgres", "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1"]);
  let out = "", err = "";
  child.stdout.on("data", (data: Buffer) => { out += data.toString(); });
  child.stderr.on("data", (data: Buffer) => { err += data.toString(); });
  child.on("error", reject);
  child.on("close", (code) => code === 0 ? resolve(out.trim()) : reject(new Error(err)));
  child.stdin.end(query);
});

suite("reserva atômica no pool isolado", () => {
  beforeAll(() => {
    if (container !== "codex-proxy-pool-test") throw new Error("O teste exige o contêiner descartável codex-proxy-pool-test");
    sql("CREATE TABLE IF NOT EXISTS public.waha_proxy_pool (id integer primary key, status text not null, assigned_session text, assigned_at timestamptz, updated_at timestamptz not null default now(), valid boolean not null); TRUNCATE public.waha_proxy_pool;");
    sql(readFileSync("scripts/pool-proxy/reserva-atomica.sql", "utf8"));
    sql("INSERT INTO public.waha_proxy_pool(id,status,valid) VALUES (1,'livre',true), (2,'livre',true), (3,'livre',false);");
  });

  it("reserva um proxy, e o retry mantém a mesma atribuição", () => {
    const a = sql("SELECT public.reservar_proxy_waha('sessao-a');");
    expect(a).toBe("1");
    expect(sql("SELECT public.reservar_proxy_waha('sessao-a');")).toBe(a);
  });

  it("duas sessões concorrentes não recebem a mesma linha", async () => {
    sql("UPDATE public.waha_proxy_pool SET status='livre',assigned_session=null WHERE valid;");
    const resultados = await Promise.all([concorrente("SELECT public.reservar_proxy_waha('sessao-b');"), concorrente("SELECT public.reservar_proxy_waha('sessao-c');")]);
    expect(new Set(resultados)).toEqual(new Set(["1", "2"]));
  });

  it("duas solicitações simultâneas da mesma sessão recebem o mesmo proxy", async () => {
    sql("UPDATE public.waha_proxy_pool SET status='livre',assigned_session=null WHERE valid;");
    const resultados = await Promise.all([concorrente("SELECT public.reservar_proxy_waha('sessao-d');"), concorrente("SELECT public.reservar_proxy_waha('sessao-d');")]);
    expect(resultados[0]).toBe(resultados[1]);
    expect(sql("SELECT count(*) FROM public.waha_proxy_pool WHERE assigned_session='sessao-d';")).toBe("1");
  });

  it("pool esgotado não usa proxy inválido nem libera atribuição existente", () => {
    sql("UPDATE public.waha_proxy_pool SET status='atribuido',assigned_session='ocupado-' || id WHERE valid;");
    expect(sql("SELECT coalesce(public.reservar_proxy_waha('sessao-e')::text, 'esgotado');")).toBe("esgotado");
    expect(sql("SELECT count(*) FROM public.waha_proxy_pool WHERE status='atribuido';")).toBe("2");
  });

  it("não apresenta atribuição inválida existente como reserva confirmada", () => {
    sql("UPDATE public.waha_proxy_pool SET status='atribuido', assigned_session='sessao-invalida' WHERE id=3;");
    expect(() => sql("SELECT public.reservar_proxy_waha('sessao-invalida');")).toThrow();
    expect(sql("SELECT count(*) FROM public.waha_proxy_pool WHERE assigned_session='sessao-invalida';")).toBe("1");
  });

  it("registra como usado o proxy já configurado, repetindo sem mudar de linha", () => {
    sql("UPDATE public.waha_proxy_pool SET status='livre', assigned_session=null WHERE id=1;");
    expect(sql("SELECT public.registrar_proxy_existente_waha('sessao-existente', 1);")).toBe("registrado");
    expect(sql("SELECT public.registrar_proxy_existente_waha('sessao-existente', 1);")).toBe("ja_registrado");
    expect(sql("SELECT status || ':' || assigned_session FROM public.waha_proxy_pool WHERE id=1;")).toBe("atribuido:sessao-existente");
  });

  it("não sobrescreve proxy ou sessão com atribuição divergente", () => {
    sql("UPDATE public.waha_proxy_pool SET status='atribuido', assigned_session='dona' WHERE id=1; UPDATE public.waha_proxy_pool SET status='livre', assigned_session=null WHERE id=2;");
    expect(sql("SELECT public.registrar_proxy_existente_waha('outra', 1);")).toBe("conflito_proxy");
    expect(sql("SELECT public.registrar_proxy_existente_waha('dona', 2);")).toBe("conflito_sessao");
    expect(sql("SELECT status || ':' || assigned_session FROM public.waha_proxy_pool WHERE id=1;")).toBe("atribuido:dona");
    expect(sql("SELECT status FROM public.waha_proxy_pool WHERE id=2;")).toBe("livre");
  });

  it("solicitações simultâneas do mesmo proxy mantêm uma única dona", async () => {
    sql("UPDATE public.waha_proxy_pool SET status='livre', assigned_session=null WHERE id=1;");
    const resultados = await Promise.all([concorrente("SELECT public.registrar_proxy_existente_waha('sessao-x', 1);"), concorrente("SELECT public.registrar_proxy_existente_waha('sessao-y', 1);")]);
    expect(new Set(resultados)).toEqual(new Set(["registrado", "conflito_proxy"]));
    expect(sql("SELECT count(*) FROM public.waha_proxy_pool WHERE id=1 AND status='atribuido' AND assigned_session IN ('sessao-x','sessao-y');")).toBe("1");
  });

  it("registra como ocupado um proxy inválido ainda usado sem alterar sua validade", () => {
    sql("UPDATE public.waha_proxy_pool SET status='livre', assigned_session=null WHERE id=3;");
    expect(sql("SELECT public.registrar_proxy_existente_waha('sessao-proxy-invalido', 3);")).toBe("registrado");
    expect(sql("SELECT status || ':' || valid::text FROM public.waha_proxy_pool WHERE id=3;")).toBe("atribuido:false");
  });
});
