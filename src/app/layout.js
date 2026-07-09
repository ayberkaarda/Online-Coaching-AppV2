import "@/app/globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";

export const metadata = {
  title: "Closed-Loop Coaching Hub",
  description: "Premium Birebir Koçluk ve Gelişim Paneli",
};

export default function RootLayout({ children }) {
  return (
    // suppressHydrationWarning: Tema motorunun arka planda çökmesini ve sistemi yavaşlatmasını engeller
    <html lang="tr" suppressHydrationWarning>
      <body className="bg-slate-50 dark:bg-[#0f0f12] text-slate-900 dark:text-slate-100 min-h-screen font-sans antialiased selection:bg-brand-purple/30 transition-colors duration-300">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}