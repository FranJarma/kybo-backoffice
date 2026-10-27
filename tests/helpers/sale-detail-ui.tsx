import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import { SalesManager } from "../../src/components/sales/sales-manager";
import { FormFeedback } from "../../src/components/ui/form-feedback";

const root = document.createElement("div");
root.style.cssText = "padding:16px;min-height:100vh";
document.body.appendChild(root);
function Fixture() {
  const [account, setAccount] = useState<string | undefined>(
    new URLSearchParams(location.search).get("account") ?? undefined,
  );
  useEffect(() => {
    const receive = (event: Event) =>
      setAccount((event as CustomEvent<string | undefined>).detail);
    window.addEventListener("fixture-sale-account", receive);
    return () => window.removeEventListener("fixture-sale-account", receive);
  }, []);
  return (
    <>
      <SalesManager
        actorId="modal-fixture"
        branchId="11111111-1111-4111-8111-111111111111"
        role={
          new URLSearchParams(location.search).get("role") === "staff"
            ? "staff"
            : "admin"
        }
        initialAccount={account}
      />
      <FormFeedback />
    </>
  );
}
createRoot(root).render(<Fixture />);
