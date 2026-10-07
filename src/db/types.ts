import type { AppDb } from "./client";
export type Tx = Parameters<Parameters<AppDb["transaction"]>[0]>[0];
