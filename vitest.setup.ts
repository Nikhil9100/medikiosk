import { vi } from "vitest";
import "@testing-library/jest-dom/vitest";

const createStorage = () => {
  const store = new Map<string, string>();
  return {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    get length() {
      return store.size;
    },
  };
};

// Some server-only test files opt into a real `node` environment (e.g. the OCR
// provider, which spawns a Node worker thread). Only install the localStorage
// shim when a window exists so those files can run without a DOM.
if (typeof window !== "undefined") {
  Object.defineProperty(window, "localStorage", {
    value: createStorage(),
    configurable: true,
  });
}

vi.mock("server-only", () => ({}));
