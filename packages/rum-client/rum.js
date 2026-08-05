/**
 * Сбор Core Web Vitals и отправка на свой коллектор.
 *
 * КОПИРУЕТСЯ В ОБА РЕПОЗИТОРИЯ (сайт и приложение) без изменений,
 * кроме констант в начале файла. При правке — обновить обе копии
 * и поднять PAYLOAD_VERSION, тогда расхождение будет видно в логе
 * коллектора, а не проявится потерей данных.
 *
 * Гарантии безопасности:
 *   — не бросает исключений ни при каких условиях, всё в try/catch;
 *   — не блокирует загрузку и выгрузку страницы (sendBeacon);
 *   — не тянет ничего со сторонних CDN;
 *   — не собирает персональных данных;
 *   — при недоступности коллектора просто молчит.
 *
 * Установка:
 *   npm i web-vitals
 *   import { initRum } from "./rum.js";
 *   initRum({ source: "site", endpoint: "https://it.franchise-fuji.ru/rum/v1/vitals" });
 */

const PAYLOAD_VERSION = 1;

/** Доля сессий, с которых собираем метрики. 1 = все, 0.2 = каждая пятая. */
const DEFAULT_SAMPLE_RATE = 1;

function detectPlatform() {
  try {
    // Capacitor доступен только внутри приложения.
    const cap = globalThis.Capacitor;
    if (cap && typeof cap.getPlatform === "function") {
      const platform = cap.getPlatform();
      if (platform === "ios" || platform === "android") return platform;
    }
  } catch {
    /* нет Capacitor — значит браузер */
  }
  return "web";
}

function detectConnection() {
  try {
    const connection =
      navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    return connection?.effectiveType ?? null;
  } catch {
    return null;
  }
}

/**
 * Отправка. sendBeacon кладёт данные в очередь браузера и возвращается
 * немедленно — переход по странице не задерживается. Если он недоступен
 * или отказал, пробуем fetch с keepalive: он тоже переживает выгрузку.
 */
function send(endpoint, payload) {
  try {
    const body = JSON.stringify(payload);

    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon(endpoint, blob)) return;
    }

    fetch(endpoint, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      mode: "cors",
      credentials: "omit",
    }).catch(() => {
      /* коллектор недоступен — это не проблема приложения */
    });
  } catch {
    /* мониторинг не имеет права ломать страницу */
  }
}

export function initRum(options) {
  try {
    const endpoint = options?.endpoint;
    const source = options?.source;
    if (!endpoint || (source !== "site" && source !== "app")) return;

    const sampleRate =
      typeof options.sampleRate === "number" ? options.sampleRate : DEFAULT_SAMPLE_RATE;
    if (sampleRate < 1 && Math.random() >= sampleRate) return;

    const platform = detectPlatform();
    const appVersion = options.appVersion ?? null;

    // Метрики приходят в разные моменты жизни страницы, поэтому копим
    // и отправляем пачкой при уходе — это один запрос вместо пяти.
    const queue = [];

    const flush = () => {
      if (queue.length === 0) return;
      // splice очищает очередь до отправки: повторный flush не отправит то же
      // самое дважды, даже если visibilitychange и pagehide сработают подряд.
      send(endpoint, queue.splice(0, queue.length));
    };

    const handle = (metric) => {
      try {
        queue.push({
          v: PAYLOAD_VERSION,
          metric: metric.name,
          value: metric.value,
          rating: metric.rating ?? null,
          path: location.pathname,
          platform,
          source,
          connection: detectConnection(),
          appVersion,
        });
        // На долгоживущей SPA очередь не должна расти бесконечно:
        // INP переотправляется при каждом ухудшении.
        if (queue.length >= 10) flush();
      } catch {
        /* игнорируем */
      }
    };

    import("web-vitals")
      .then(({ onLCP, onINP, onCLS, onTTFB, onFCP }) => {
        onLCP(handle);
        onINP(handle);
        onCLS(handle);
        onTTFB(handle);
        onFCP(handle);
      })
      .catch(() => {
        /* библиотека не загрузилась — работаем дальше без метрик */
      });

    // visibilitychange надёжнее unload: в мобильных браузерах и WebView
    // страница часто не выгружается, а уходит в фон.
    addEventListener(
      "visibilitychange",
      () => {
        if (document.visibilityState === "hidden") flush();
      },
      { capture: true },
    );
    addEventListener("pagehide", flush, { capture: true });
  } catch {
    /* инициализация мониторинга не должна ронять приложение */
  }
}
