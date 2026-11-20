import Image from "next/image";
import { LoginForm } from "@/components/login-form";
import { safeLoginReturn } from "@/lib/login-return";
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const returnTo = safeLoginReturn((await searchParams).returnTo);
  return (
    <main className="grid min-h-dvh bg-white lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-brand lg:block">
        <Image
          src="/assets/login-kybo-artwork.webp"
          alt=""
          fill
          sizes="(min-width: 1024px) 50vw, 1px"
          className="object-cover"
        />
      </div>
      <section
        aria-labelledby="login-heading"
        className="flex min-w-0 flex-col px-6 py-8 sm:px-10 lg:px-12"
      >
        <div className="mx-auto flex w-full max-w-md items-center gap-4">
          <Image
            src="/assets/kybo-logo.png"
            width={130}
            height={70}
            alt="Kybo"
            className="h-auto w-28 object-contain"
            preload
          />
          <span className="border-l border-line py-2 pl-4 text-sm font-semibold text-brand">
            Operations
          </span>
        </div>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-start py-12 sm:py-16 lg:justify-center">
          <div className="mb-8">
            <h1
              id="login-heading"
              className="text-3xl font-extrabold tracking-tight text-brand"
            >
              Ingresá a Kybo
            </h1>
            <p className="mt-3 max-w-sm text-base leading-7 text-muted">
              Acceso privado para gestionar los datos del local.
            </p>
          </div>
          <LoginForm returnTo={returnTo} />
        </div>
      </section>
    </main>
  );
}
