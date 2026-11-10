import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { readRun } from "./environment";

// Setup smoke checks only. No sales, receipts, stock commands or cash openings.
const root =
  process.argv[2] ??
  (
    JSON.parse(await readFile(".local/manual-day/latest.json", "utf8")) as {
      root: string;
    }
  ).root;
const run = readRun(root);
const dataset = JSON.parse(
  await readFile(resolve(root, "dataset.json"), "utf8"),
) as { branchId: string; publicQueueUrl: string };
const credentials = JSON.parse(
  await readFile(resolve(root, "credentials.json"), "utf8"),
) as { username: string; password: string }[];
const checks: string[] = [];
let cookie = "";
function confirm(condition: unknown, message: string): asserts condition {
  if (!condition) throw Error(message);
  checks.push(message);
  console.log(`OK · ${message}`);
}
async function request(path: string, init: RequestInit = {}) {
  const url = new URL(path, run.origin);
  if (url.origin !== run.origin)
    throw Error("Una comprobación intentó salir del ensayo.");
  return fetch(url, {
    ...init,
    redirect: "manual",
    signal: AbortSignal.timeout(120_000),
    headers: {
      Origin: run.origin,
      Cookie: cookie,
      "X-Kybo-Branch-Id": dataset.branchId,
      ...init.headers,
    },
  });
}
async function json(path: string) {
  const response = await request(path);
  if (!response.ok)
    throw Error(
      `La consulta ${path} respondió ${response.status}: ${(await response.text()).slice(0, 500)}`,
    );
  return response.json();
}
async function login(username: string) {
  const person = credentials.find((u) => u.username === username)!;
  const response = await request("/api/auth/sign-in/username", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: person.password }),
  });
  if (!response.ok)
    throw Error(
      `No se pudo ingresar con ${username}: ${response.status} ${(await response.text()).slice(0, 300)}`,
    );
  cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  confirm(cookie.length > 0, `Ingreso ficticio de ${username}`);
}
async function logout() {
  if (cookie)
    await request("/api/auth/sign-out", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
  cookie = "";
}
try {
  confirm(
    (await request("/login")).status === 200,
    "Login de pruebas disponible",
  );
  await login("qa_admin");
  const cash = await json("/api/cash");
  confirm(
    cash.branchName === "PRUEBAS · Kybo ficticio" &&
      cash.current === null &&
      cash.settings.targetFund === "50000.00",
    "Sucursal ficticia y caja sin abrir, fondo objetivo $50.000",
  );
  const products = await json(
    "/api/sales/lookup?kind=products&channel=counter",
  );
  confirm(
    products.rows.length === 4 &&
      products.rows.every((p: { name: string }) => p.name.startsWith("QA · ")),
    "Cuatro productos ficticios disponibles para el POS",
  );
  const orders = await json("/api/procurement/orders");
  confirm(
    orders.available && orders.orders.length === 0,
    "Sin pedidos de compra registrados",
  );
  const receipts = await json("/api/purchases");
  confirm(
    Array.isArray(receipts.rows) && receipts.rows.length === 0,
    "Sin recepciones registradas",
  );
  const day = await json("/api/operations/day");
  confirm(
    day.locations.length === 3 &&
      day.stock.some((r: { itemName: string }) => r.itemName === "QA · Leche"),
    "Stock y ubicaciones ficticias consultables",
  );
  const milk = day.stock.filter(
    (r: { itemName: string }) => r.itemName === "QA · Leche",
  );
  confirm(
    milk.reduce(
      (total: number, r: { physical: string }) => total + Number(r.physical),
      0,
    ) === 21000,
    "Saldo inicial de leche: 21 L entre Depósito y Barra",
  );
  for (const path of [
    "/sales",
    "/finance/cash",
    "/inventory/purchases",
    "/kitchen/production",
    "/operations/day",
  ])
    confirm(
      (await request(path)).status === 200,
      `Pantalla operativa disponible: ${path}`,
    );
  const photo = await request(`/api/cash/photos?sessionId=${randomUUID()}`, {
    method: "POST",
    headers: { "Content-Type": "image/png" },
    body: new Uint8Array(
      await readFile(resolve(root, "COMPROBANTE-FICTICIO.png")),
    ),
  });
  const photoError = await photo.json();
  confirm(
    photo.status === 409 && photoError.code === "CASH_CLOSED",
    "El adaptador local de fotos está seleccionado y rechaza una jornada inexistente",
  );
  await logout();
  for (const username of ["qa_barra", "qa_cocina"]) {
    await login(username);
    const work = await json("/api/staff/work");
    confirm(
      work.ready &&
        work.assignments.length === 1 &&
        work.production.rows.length === 0,
      `Puesto personal correcto y producción sin iniciar: ${username}`,
    );
    await logout();
  }
  await login("qa_encargada");
  const managerCash = await json("/api/cash");
  confirm(
    managerCash.capabilities.open &&
      managerCash.capabilities.withdraw &&
      managerCash.capabilities.supplier &&
      !managerCash.capabilities.admin,
    "La encargada tiene permisos operativos y no de administración de Caja",
  );
  await logout();
  await login("qa_local");
  const status = await json("/api/cash/status");
  confirm(
    status.canOpen === false && status.canView === false,
    "La cuenta compartida no recibe permisos de gestión de caja",
  );
  await logout();
  confirm(
    (await request(dataset.publicQueueUrl)).status === 200,
    "Pantalla pública ficticia disponible",
  );
  await writeFile(
    resolve(root, "PREPARACION-VERIFICADA.json"),
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        revision: run.revision,
        checks,
        note: "No se ejecutó la jornada; solo ingresos de cuentas ficticias y consultas, más un upload rechazado sin jornada.",
      },
      null,
      2,
    ),
  );
} finally {
  await logout();
}
