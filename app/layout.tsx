import type { Metadata } from "next";

export const metadata: Metadata = { title: "Cockpit", robots: "noindex,nofollow" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin:0, fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif", background:"#f5f5f2", color:"#1a1a1a" }}>
        {children}
      </body>
    </html>
  );
}
