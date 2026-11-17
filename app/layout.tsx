import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Promptly — Better prompts, without the guesswork",
  description: "Turn rough ideas and simple sentences into clear AI prompts. Get Simple, Professional, and Advanced versions in one click.",
  openGraph: {
    title: "Promptly",
    description: "Say it your way. Promptly makes it clearer.",
    type: "website"
  },
  icons: { icon: "/favicon.svg" }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
