import type { Metadata } from "next";
import "./globals.css";
import { SolanaWalletProvider } from "./components/WalletProvider";

export const metadata: Metadata = {
  title: "SOLBAR — RWA Tokenization Platform",
  description: "Trade tokenized gold, real estate, and commodities on Solana",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SolanaWalletProvider>
          {children}
        </SolanaWalletProvider>
      </body>
    </html>
  );
}