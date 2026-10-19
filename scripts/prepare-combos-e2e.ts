import { createDataModelTestContext } from "../tests/helpers/data-model-database";
if (
  process.env.E2E_MANAGED !== "1" ||
  !process.env.KYBO_LOCAL_DB ||
  process.env.DATABASE_URL
)
  throw Error("Only a managed disposable database is allowed.");
const context = await createDataModelTestContext({
  directory: process.env.KYBO_LOCAL_DB,
});
await context.close();
