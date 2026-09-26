import Image from "next/image";
import { LoginForm } from "@/components/login-form";
import { Card } from "@/components/ui/card";
export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4 py-8">
      <Card className="w-full max-w-md gap-0 p-7 sm:p-9">
        <Image
          src="/assets/kybo-logo.png"
          width={130}
          height={70}
          alt="Kybo"
          className="mb-7 h-auto w-[112px] object-contain"
          priority
        />
        <div className="mb-7">
          <p className="mb-2 text-xs font-bold uppercase tracking-[.16em] text-accent">
            Operations
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight text-brand">
            Ingresá a Kybo
          </h1>
          <p className="mt-2 text-sm text-muted">
            Acceso privado para gestionar los datos del local.
          </p>
        </div>
        <LoginForm />
      </Card>
    </main>
  );
}
