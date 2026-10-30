CREATE TABLE "branch_addresses" (
  "branch_id" uuid PRIMARY KEY NOT NULL REFERENCES "branches"("id"),
  "address" text NOT NULL,
  "latitude" double precision NOT NULL,
  "longitude" double precision NOT NULL,
  "source" text NOT NULL,
  "revision" integer DEFAULT 1 NOT NULL,
  "confirmed_by" text NOT NULL REFERENCES "user"("id"),
  "confirmed_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "branch_address_values" CHECK (
    length(trim("address")) between 5 and 500
    AND "latitude" between -90 and 90
    AND "longitude" between -180 and 180
    AND "revision">0 AND "source" in ('photon','manual')
  )
);
