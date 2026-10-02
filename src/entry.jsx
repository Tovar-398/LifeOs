import React from "react";
import { createRoot } from "react-dom/client";
import LifeOS from "./LifeOS.jsx";
if (!window.storage) {
  window.storage = {
    __local: true,
    get: async (k) => { const v = localStorage.getItem(k); return v == null ? null : { key: k, value: v }; },
    set: async (k, v) => { localStorage.setItem(k, v); return { key: k, value: v }; },
    delete: async (k) => { localStorage.removeItem(k); return { key: k, deleted: true }; },
    list: async (prefix) => ({ keys: Object.keys(localStorage).filter(x => !prefix || x.startsWith(prefix)) }),
  };
}
createRoot(document.getElementById("root")).render(React.createElement(LifeOS));
