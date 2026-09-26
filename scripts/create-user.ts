import "dotenv/config";
import { closeDb, getDb } from "../src/db/client";
import { provisionUser } from "../src/lib/auth";
import type { Actor } from "../src/lib/access";

const argumentsProvided = process.argv.slice(2);
const [name, email, role] = argumentsProvided;
const password = process.env.KYBO_NEW_USER_PASSWORD;

if (argumentsProvided.length !== 3 || !name || !email || !role || !password) {
  throw new Error(
    'Usage: KYBO_NEW_USER_PASSWORD=<temporary secret> npm run user:create -- "Name" email@example.com admin|manager|staff',
  );
}
if (!(["admin", "manager", "staff"] as string[]).includes(role))
  throw new Error("Invalid role.");

try {
  await provisionUser(await getDb(), {
    name,
    email,
    role: role as Actor["role"],
    password,
  });
  console.log(
    "User created. Remove the temporary password from the environment.",
  );
} catch {
  console.error(
    "Could not create user. Verify database, input, and email uniqueness.",
  );
  process.exitCode = 1;
} finally {
  delete process.env.KYBO_NEW_USER_PASSWORD;
  await closeDb();
}
