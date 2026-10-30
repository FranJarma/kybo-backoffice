import Image from "next/image";
import Link from "next/link";
import { CalendarCheck, ChefHat, ListChecks } from "lucide-react";
import "./personal-frame.css";
type PersonalSection = "attendance" | "tasks" | "production";
export function PersonalNavigation({
  active = "attendance",
}: { active?: PersonalSection } = {}) {
  return (
    <nav className="personal-bottom-nav" aria-label="Mi trabajo en Kybo">
      <Link
        href="/staff/attendance"
        aria-current={active === "attendance" ? "page" : undefined}
      >
        <CalendarCheck size={21} />
        <span>Mi jornada</span>
      </Link>
      <Link
        href="/staff/work"
        aria-current={active === "tasks" ? "page" : undefined}
      >
        <ListChecks size={21} />
        <span>Mis tareas</span>
      </Link>
      <Link
        href="/staff/work?tab=production"
        aria-current={active === "production" ? "page" : undefined}
      >
        <ChefHat size={21} />
        <span>Producción</span>
      </Link>
    </nav>
  );
}
export function PersonalFrame({
  name,
  branchName,
  children,
  active = "attendance",
}: {
  name: string;
  branchName: string;
  children?: React.ReactNode;
  active?: PersonalSection;
}) {
  return (
    <div className="personal-frame">
      <header className="personal-frame-header">
        <Link href="/staff/attendance" aria-label="Mi jornada en Kybo">
          <Image
            src="/assets/kybo-logo.png"
            width={94}
            height={50}
            alt="Kybo"
            priority
          />
        </Link>
        <div>
          <strong>{name}</strong>
          <span>{branchName}</span>
        </div>
      </header>
      <main>{children}</main>
      <PersonalNavigation active={active} />
    </div>
  );
}
