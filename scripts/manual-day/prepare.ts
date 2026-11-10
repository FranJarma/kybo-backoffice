import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import sharp from "sharp";
import { childEnvironment, readRun, type ManualRun } from "./environment";
import { manualSnapshotConfig } from "./snapshot-config";

const [directory, port, revision] = process.argv.slice(2);
if (
  !directory ||
  !/^31\d{2}$/.test(port ?? "") ||
  !/^[a-f0-9]{40}$/.test(revision ?? "")
)
  throw Error("Parámetros de preparación inválidos.");
const root = resolve(directory),
  app = resolve(root, "app");
if (
  (await readdir(app)).some(
    (name) => name.startsWith(".env") && name !== ".env.example",
  )
)
  throw Error(
    "La instantánea contiene un archivo de entorno; se detiene la preparación.",
  );
const run: ManualRun = {
  kind: "kybo-manual-day",
  runId: basename(root),
  origin: `http://127.0.0.1:${port}`,
  revision,
  secret: randomBytes(32).toString("hex"),
};
await writeFile(
  resolve(root, "manual-day.json"),
  JSON.stringify(run, null, 2),
  { flag: "wx" },
);
readRun(root);
const credentials = [
  { username: "qa_admin", name: "QA · Administración", role: "admin" },
  { username: "qa_encargada", name: "QA · Encargada", role: "manager" },
  { username: "qa_barra", name: "QA · Barra", role: "staff" },
  { username: "qa_cocina", name: "QA · Cocina", role: "staff" },
  { username: "qa_local", name: "QA · Puesto del local", role: "staff" },
].map((u) => ({ ...u, password: `Qa-${randomBytes(9).toString("hex")}!` }));
await writeFile(
  resolve(root, "credentials.json"),
  JSON.stringify(credentials, null, 2),
  { flag: "wx" },
);
const configFile = resolve(app, "next.config.ts");
const config = await readFile(configFile, "utf8");
await writeFile(configFile, manualSnapshotConfig(config));
const cssFile = resolve(app, "src/app/globals.css");
const css = await readFile(cssFile, "utf8");
if (!css.includes('@import "tailwindcss";'))
  throw Error(
    "Revisar la entrada de estilos antes de preparar otra instantánea.",
  );
await writeFile(
  cssFile,
  css.replace(
    '@import "tailwindcss";',
    '@import "tailwindcss" source(none);\n@source "..";',
  ),
);
const seed = spawn(
  process.execPath,
  ["--import", "tsx", "scripts/manual-day/seed.ts"],
  {
    cwd: app,
    env: childEnvironment(root),
    stdio: "inherit",
    windowsHide: true,
  },
);
await new Promise<void>((done, fail) => {
  seed.on("error", fail);
  seed.on("exit", (code) =>
    code === 0 ? done() : fail(Error(`El sembrado no terminó (${code}).`)),
  );
});
const dataset = JSON.parse(
  await readFile(resolve(root, "dataset.json"), "utf8"),
) as { businessDate: string; publicQueueUrl: string };
await writeFile(
  resolve(root, "ACCESOS.md"),
  `# SOLO PRUEBAS · Jornada ${dataset.businessDate}\n\nAplicación: ${run.origin}/login\n\nVersión: ${revision}\n\nEstas cuentas y contraseñas son ficticias, independientes de las reales. No cambiarlas ni reutilizarlas en producción.\n\n| Cuenta | Usuario | Contraseña de prueba |\n|---|---|---|\n${credentials.map((u) => `| ${u.name} | ${u.username} | ${u.password} |`).join("\n")}\n\nPantalla de clientes: ${dataset.publicQueueUrl}\n\nCada rol debe usar un perfil de navegador independiente para conservar sus sesiones. No alcanza con abrir varias pestañas de la misma ventana privada.\n\nEl ensayo conserva los cambios al detener y arrancar. Para repetir desde cero, preparar otro ensayo; nunca se reinicia una base existente.\n`,
  { flag: "wx" },
);
await sharp(
  Buffer.from(
    `<svg width="600" height="700" xmlns="http://www.w3.org/2000/svg"><rect width="600" height="700" fill="white"/><g fill="#081d49" font-family="Arial" text-anchor="middle"><text x="300" y="80" font-size="27">SOLO PRUEBAS</text><text x="300" y="135" font-size="22">Comprobante ficticio de posnet</text><text x="300" y="220" font-size="24">LOTE QA-001</text><text x="300" y="280" font-size="21">3 operaciones</text><text x="300" y="355" font-size="40">TOTAL $ 29.000,00</text><text x="300" y="455" font-size="19">QA-0001: $ 8.000</text><text x="300" y="495" font-size="19">QA-0002: $ 8.000</text><text x="300" y="535" font-size="19">QA-0003: $ 13.000</text><text x="300" y="635" font-size="18">SIN VALIDEZ FISCAL NI BANCARIA</text></g></svg>`,
  ),
)
  .png()
  .toFile(resolve(root, "COMPROBANTE-FICTICIO.png"));
await writeFile(
  resolve(root, "../latest.json"),
  JSON.stringify({ root }, null, 2),
);
console.log(
  `Pruebas listas en ${run.origin}. Los accesos están en ${resolve(root, "ACCESOS.md")}.`,
);
