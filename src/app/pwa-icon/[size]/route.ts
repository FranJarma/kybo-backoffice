import { ImageResponse } from "next/og";
import { createElement } from "react";
import { readFile } from "node:fs/promises";
import path from "node:path";
export const runtime = "nodejs";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ size: string }> },
) {
  const value = (await params).size;
  if (!["180", "192", "512"].includes(value))
    return new Response(null, { status: 404 });
  const size = Number(value),
    logo = await readFile(
      path.join(process.cwd(), "public/assets/kybo-logo.png"),
    );
  return new ImageResponse(
    createElement(
      "div",
      {
        style: {
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#ffffff",
        },
      },
      createElement("img", {
        src: `data:image/png;base64,${logo.toString("base64")}`,
        width: size * 0.72,
        height: size * 0.36,
        style: { objectFit: "contain" },
        alt: "Kybo",
      }),
    ),
    {
      width: size,
      height: size,
      headers: { "Cache-Control": "public, max-age=86400" },
    },
  );
}
