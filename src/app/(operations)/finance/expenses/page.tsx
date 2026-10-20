import { requireManagerPage } from "@/lib/page-access";
import { ExpensesManager } from "@/components/finance/expenses-manager";
import { businessDate } from "@/modules/operations/business-date";
import { expenseMonth } from "@/modules/overheads/service";
export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const actor = await requireManagerPage();
  const month = expenseMonth.safeParse((await searchParams).month);
  return (
    <ExpensesManager
      initialMonth={
        month.success
          ? month.data
          : businessDate(new Date(), actor.timeZone!).slice(0, 7)
      }
    />
  );
}
