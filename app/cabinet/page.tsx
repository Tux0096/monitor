import type { Metadata } from "next";

import { CabinetApp } from "./cabinet-app";
import "./cabinet.css";

export const metadata: Metadata = {
  title: "Личный кабинет",
  // Mini App не должен индексироваться и кэшироваться поисковиками
  robots: { index: false, follow: false },
};

/**
 * Точка входа Mini App.
 *
 * Скрипт telegram-web-app.js подключается с домена Telegram — это
 * единственное исключение из правила «без сторонних CDN»: объект
 * WebApp предоставляет сам мессенджер, локальной копии у него нет.
 */
export default function CabinetPage() {
  return (
    <>
      <script src="https://telegram.org/js/telegram-web-app.js" async />
      <CabinetApp />
    </>
  );
}
