import { expect, it } from "vitest";
import { confirmedPreparation } from "../src/modules/preparation/confirmed";
import type {
  PrepList,
  PrepTask,
  PrepStatus,
} from "../src/modules/preparation/types";
function task(id: string, status: PrepStatus, revision = 2): PrepTask {
  return {
    id,
    revision,
    orderId: "order",
    saleId: "sale",
    saleNumber: 1,
    sequence: 1,
    origin: "counter",
    channel: "counter",
    tableName: null,
    externalId: null,
    fulfillment: "takeaway",
    customerName: null,
    notes: null,
    saleCancelled: false,
    stationId: id,
    stationName: id,
    status,
    assigneeId: "staff",
    assigneeName: "Caja",
    enqueuedAt: "2026-10-26T12:00:00Z",
    startedAt: "2026-10-26T12:01:00Z",
    readyAt: null,
    deliveredAt: null,
    cancelledAt: null,
    lines: [],
    siblings: [
      { id: "bar", stationName: "Barra", status: "preparing" },
      { id: "kitchen", stationName: "Cocina", status: "preparing" },
    ],
    timing: {
      waitSeconds: 60,
      prepSeconds: null,
      handoffSeconds: null,
      totalSeconds: null,
    },
    orderTiming: {
      waitSeconds: 60,
      prepSeconds: null,
      handoffSeconds: null,
      totalSeconds: null,
    },
  };
}
const initial = (): PrepList => ({
  rows: [task("bar", "preparing"), task("kitchen", "preparing")],
  counts: { pending: 0, preparing: 2, ready: 0, delivered: 0, cancelled: 0 },
  total: 2,
  offset: 0,
  stations: [],
  serverNow: "2026-10-26T12:02:00Z",
});
it("moves only a server-confirmed task and its sibling summary without claiming a fresh queue", () => {
  const data = initial();
  const ready = {
    ...task("bar", "ready", 3),
    siblings: [
      { id: "bar", stationName: "Barra", status: "ready" as const },
      { id: "kitchen", stationName: "Cocina", status: "preparing" as const },
    ],
  };
  const result = confirmedPreparation(data, ready, true);
  expect(result.rows[0].status).toBe("ready");
  expect(result.rows[1].siblings[0].status).toBe("ready");
  expect(result.counts).toMatchObject({ preparing: 1, ready: 1 });
  expect(result.serverNow).toBe(data.serverNow);
  expect(data.rows[0].status).toBe("preparing");
});
it("removes delivered tasks from active results and ignores stale or unrelated confirmations", () => {
  const data = initial();
  const result = confirmedPreparation(data, task("bar", "delivered", 3), true);
  expect(result.rows.map((t) => t.id)).toEqual(["kitchen"]);
  expect(result.total).toBe(1);
  expect(result.counts).toMatchObject({ preparing: 1, delivered: 0 });
  expect(confirmedPreparation(data, task("missing", "ready", 3), true)).toBe(
    data,
  );
  expect(confirmedPreparation(data, task("bar", "pending", 1), true)).toBe(
    data,
  );
  expect(confirmedPreparation(data, task("bar", "preparing", 2), true)).toBe(
    data,
  );
});
