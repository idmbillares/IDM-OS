"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="es">
      <body
        style={{
          alignItems: "center",
          background: "#fff",
          color: "#18181b",
          display: "flex",
          fontFamily: "Arial, sans-serif",
          justifyContent: "center",
          margin: 0,
          minHeight: "100vh",
          padding: "24px",
        }}
      >
        <main
          style={{
            background: "#fff",
            border: "1px solid #e4e4e7",
            borderRadius: "16px",
            maxWidth: "520px",
            padding: "32px",
          }}
        >
          <p
            style={{
              color: "#c2410c",
              fontSize: "12px",
              fontWeight: 700,
              letterSpacing: "0.1em",
              margin: 0,
              textTransform: "uppercase",
            }}
          >
            IDM OS
          </p>
          <h1 style={{ fontSize: "28px", marginBottom: "12px" }}>
            Ocurrió un error inesperado
          </h1>
          <p style={{ color: "#52525b", lineHeight: 1.6 }}>
            Puedes intentar cargar el sistema nuevamente. Si el problema persiste,
            contacta al administrador.
          </p>
          <button
            onClick={reset}
            style={{
              background: "#c2410c",
              border: 0,
              borderRadius: "8px",
              color: "#fff",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: 700,
              marginTop: "20px",
              minHeight: "44px",
              padding: "0 16px",
            }}
            type="button"
          >
            Intentar de nuevo
          </button>
        </main>
      </body>
    </html>
  );
}
