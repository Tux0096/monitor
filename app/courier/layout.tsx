import type { Metadata, Viewport } from "next";
import Script from "next/script";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

const maxBridgeReadyScript = `
(function () {
  function callReady() {
    try {
      if (window.WebApp && typeof window.WebApp.ready === "function") {
        window.WebApp.ready();
      }
    } catch (e) {}
  }
  if (window.WebApp) {
    callReady();
    return;
  }
  var attempts = 0;
  var timer = setInterval(function () {
    if (window.WebApp || ++attempts > 120) {
      clearInterval(timer);
      callReady();
    }
  }, 50);
})();
`;

export default function CourierLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Script src="https://st.max.ru/js/max-web-app.js" strategy="beforeInteractive" />
      <Script id="max-webapp-ready" strategy="beforeInteractive">
        {maxBridgeReadyScript}
      </Script>
      {children}
    </>
  );
}
