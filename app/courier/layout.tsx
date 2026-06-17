import type { Metadata, Viewport } from "next";
import Script from "next/script";

export const metadata: Metadata = {
  title: "Поддержка курьеров · Фуджи",
  description: "Личный кабинет курьера и обращения в техподдержку",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0f1f1a",
};

export default function CourierLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Script src="https://st.max.ru/js/max-web-app.js" strategy="beforeInteractive" />
      {children}
    </>
  );
}
