import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { SaleChannel } from "@/modules/sales/types";
import type { CartLine } from "./cart";
import { ComboConfigurator } from "./combo-configurator";
import { ProductConfigurator } from "./product-configurator";
import {
  confirmedComboConfiguration,
  confirmedProductConfiguration,
  type ConfirmedConfiguration,
  type OrderConfiguration,
} from "./order-configuration";

export function OrderConfigurationDialog({
  configuration,
  line,
  channel,
  fontClassName,
  onConfirm,
  onClose,
}: {
  configuration: OrderConfiguration | null;
  line?: CartLine;
  channel: SaleChannel;
  fontClassName: string;
  onConfirm: (configuration: ConfirmedConfiguration) => void;
  onClose: () => void;
}) {
  const config = configuration?.config;
  return (
    <Dialog
      open={!!configuration}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className={`pos-surface pos-configuration-dialog ${fontClassName} ${config && "definition" in config ? "pos-configuration-dialog--combo" : ""} [&_[data-slot=dialog-close]]:flex [&_[data-slot=dialog-close]]:min-h-12 [&_[data-slot=dialog-close]]:min-w-12 [&_[data-slot=dialog-close]]:items-center [&_[data-slot=dialog-close]]:justify-center`}
      >
        <DialogHeader className="pos-configuration-header">
          <DialogTitle>{configuration?.row.name}</DialogTitle>
          <DialogDescription>
            Elegí las opciones de este producto.
          </DialogDescription>
        </DialogHeader>
        {config &&
          ("definition" in config ? (
            <ComboConfigurator
              config={config}
              initialChoices={line?.comboChoices}
              channel={channel}
              onCancel={onClose}
              onConfirm={(selection) =>
                onConfirm(confirmedComboConfiguration(config, selection))
              }
            />
          ) : (
            <ProductConfigurator
              key={config.recipeVersionId}
              config={config}
              initialSelection={line?.modifiers}
              onCancel={onClose}
              onConfirm={(selection) =>
                onConfirm(confirmedProductConfiguration(config, selection))
              }
            />
          ))}
      </DialogContent>
    </Dialog>
  );
}
