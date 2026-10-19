import Link from "next/link";
import { requireActor } from "@/lib/auth";

export default async function BranchAssignmentPage() {
  await requireActor();
  return (
    <main className="mx-auto max-w-lg space-y-4 px-6 py-16">
      <h1 className="text-2xl font-semibold">Falta asignar tu sucursal</h1>
      <p>
        Pedile al encargado que te asigne una sucursal activa para ver tus
        tareas.
      </p>
      <Link href="/" className="text-blue">
        Volver a intentar
      </Link>
    </main>
  );
}
