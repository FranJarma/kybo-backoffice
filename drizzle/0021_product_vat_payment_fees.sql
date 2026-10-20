-- Existing catalogue amounts and option surcharges remain NET prices.
-- Unknown tax/fees and historical snapshots remain NULL, never inferred.
ALTER TABLE products ADD COLUMN vat_rate numeric(5,2);
ALTER TABLE products ADD CONSTRAINT product_vat_rate_valid CHECK (vat_rate IN (0,2.5,5,10.5,21,27));
--> statement-breakpoint
ALTER TABLE payment_methods ADD COLUMN commission_percent numeric(5,2);
ALTER TABLE payment_methods ADD CONSTRAINT payment_commission_valid CHECK (commission_percent BETWEEN 0 AND 100);
--> statement-breakpoint
ALTER TABLE sale_lines ADD COLUMN vat_rate numeric(5,2);
ALTER TABLE sale_lines ADD COLUMN net_total numeric(14,2);
ALTER TABLE sale_lines ADD COLUMN vat_total numeric(14,2);
ALTER TABLE sale_lines ADD CONSTRAINT sale_line_vat_snapshot CHECK (
  (vat_rate IS NULL AND net_total IS NULL AND vat_total IS NULL) OR
  (vat_rate IS NOT NULL AND vat_rate IN (0,2.5,5,10.5,21,27) AND net_total IS NOT NULL AND vat_total IS NOT NULL AND net_total >= 0 AND vat_total >= 0 AND net_total + vat_total = line_total)
);
--> statement-breakpoint
ALTER TABLE sale_payments ADD COLUMN commission_percent numeric(5,2);
ALTER TABLE sale_payments ADD COLUMN commission_amount numeric(14,2);
ALTER TABLE sale_payments ADD COLUMN settlement_net numeric(14,2);
ALTER TABLE sale_payments ADD CONSTRAINT sale_payment_fee_snapshot CHECK (
  (commission_percent IS NULL AND commission_amount IS NULL AND settlement_net IS NULL) OR
  (commission_percent IS NOT NULL AND commission_percent BETWEEN 0 AND 100 AND commission_amount IS NOT NULL AND settlement_net IS NOT NULL AND commission_amount >= 0 AND settlement_net >= 0 AND commission_amount + settlement_net = amount AND kind = 'collection')
);
