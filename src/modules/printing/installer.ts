import { readFile } from "node:fs/promises";
import { join } from "node:path";
export async function printingInstaller(root = process.cwd()) {
  const folder = join(root, "connector/windows");
  const installer = await readFile(
    join(folder, "Install-KyboPrintConnector.ps1"),
    "utf8",
  );
  const names = [
    "KyboPrintConnector.ps1",
    "KyboPrintNative.cs",
    "assets/kybo-logo.png",
  ];
  const files = await Promise.all(
    names.map(
      async (name) =>
        `'${name}' = '${(await readFile(join(folder, name))).toString("base64")}'`,
    ),
  );
  return (
    "\ufeff" +
    installer.replace(
      "# KYBO_PAYLOAD_RECORDS",
      `$EmbeddedFiles = @{\n${files.join("\n")}\n}`,
    )
  );
}
