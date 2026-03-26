import type { Metadata } from "next";
export const metadata: Metadata = { title: "Cockpit", robots: "noindex,nofollow" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin:0, fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif", background:"#F7F6F3", color:"#1C1C1C" }}>
        {children}
      </body>
    </html>
  );
}
