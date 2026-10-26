// Isolated browser fixture: API calls are intercepted by ready-sound.spec.ts.
import { createRoot } from "react-dom/client";
import { useState } from "react";
import { PickupDisplay } from "../../src/components/pickup/public-display";
import { PreparationBoard } from "../../src/components/preparation/board";

function Fixture() {
  const [queue, setQueue] = useState("queue-one"),
    [visible, setVisible] = useState(true);
  return (
    <>
      <button onClick={() => setVisible(false)}>Cerrar vista de prueba</button>
      <button onClick={() => setQueue("queue-two")}>
        Cambiar pantalla de prueba
      </button>
      {visible &&
        (location.hash === "#board" ? (
          <PreparationBoard actorId="fixture" role="staff" />
        ) : (
          <PickupDisplay queueKey={queue} />
        ))}
    </>
  );
}

const container = document.createElement("div");
document.body.appendChild(container);
createRoot(container).render(<Fixture />);
