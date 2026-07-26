import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const endpoint = process.env.WENQU_CDP_ENDPOINT || "http://127.0.0.1:9222";
const baseUrl = process.env.WENQU_PREVIEW_URL || "http://127.0.0.1:5173";
const outputDir = resolve(process.argv[2] || "docs/product/prototypes/wenqu-v2");

mkdirSync(outputDir, { recursive: true });

const targets = await fetch(`${endpoint}/json`).then((response) => response.json());
const target = targets.find((item) => item.type === "page");
if (!target) throw new Error("没有找到可用的浏览器页面。");

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolveOpen, rejectOpen) => {
  socket.addEventListener("open", resolveOpen, { once: true });
  socket.addEventListener("error", rejectOpen, { once: true });
});

let sequence = 0;
const pending = new Map();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (!message.id) return;
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  if (message.error) request.reject(new Error(message.error.message));
  else request.resolve(message.result);
});

function command(method, params = {}) {
  const id = ++sequence;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolveCommand, rejectCommand) => {
    pending.set(id, { resolve: resolveCommand, reject: rejectCommand });
  });
}

function pause(milliseconds) {
  return new Promise((resolvePause) => setTimeout(resolvePause, milliseconds));
}

async function evaluate(expression) {
  const result = await command("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || "页面脚本执行失败。");
  }
  return result.result.value;
}

async function screenshot(name) {
  const result = await command("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  writeFileSync(resolve(outputDir, name), Buffer.from(result.data, "base64"));
}

async function setViewport(width, height, mobile = false) {
  await command("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile,
  });
}

async function clickButton(text) {
  const clicked = await evaluate(`(() => {
    const button = [...document.querySelectorAll("button")]
      .find((item) =>
        item.innerText.includes(${JSON.stringify(text)}) ||
        item.getAttribute("aria-label")?.includes(${JSON.stringify(text)}) ||
        item.getAttribute("title")?.includes(${JSON.stringify(text)})
      );
    if (!button) return false;
    button.click();
    return true;
  })()`);
  if (!clicked) throw new Error(`找不到按钮：${text}`);
  await pause(900);
}

await command("Page.enable");
await command("Runtime.enable");
await command("Page.addScriptToEvaluateOnNewDocument", {
  source: "window.__wenquErrors = []; window.addEventListener('error', (event) => window.__wenquErrors.push(event.message));",
});
await setViewport(1440, 1000);
await command("Page.navigate", { url: baseUrl });
await pause(1000);
await evaluate("localStorage.setItem('wenqu-theme', 'light'); location.reload()");
await pause(2200);

const hasContent = await evaluate("document.body.innerText.trim().length > 200");
if (!hasContent) throw new Error("页面内容为空或未完成渲染。");
await screenshot("01-home-light.png");

await clickButton("夜间模式");
await screenshot("02-home-dark.png");

await clickButton("资料库");
await screenshot("03-materials-dark.png");

await clickButton("免费注册");
await screenshot("04-register-dark.png");
await clickButton("关闭");

await clickButton("今日阅读");
await clickButton("继续 SENet");
await screenshot("05-study-map-dark.png");

await setViewport(390, 844, true);
await pause(600);
await screenshot("06-study-mobile-dark.png");

const errors = await evaluate("window.__wenquErrors || []");
const overlay = await evaluate(
  "Boolean(document.querySelector('.vite-error-overlay, #webpack-dev-server-client-overlay'))",
);
if (overlay || errors.length) {
  throw new Error(`浏览器检测到错误：${JSON.stringify(errors)}`);
}

console.log("BROWSER_CHECK_OK: home, dark mode, materials, registration, study flow, mobile");
socket.close();
