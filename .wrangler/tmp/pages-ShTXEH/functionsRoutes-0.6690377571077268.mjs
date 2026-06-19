import { onRequestOptions as __api_billing_js_onRequestOptions } from "D:\\v-live-caption\\functions\\api\\billing.js"
import { onRequestPost as __api_billing_js_onRequestPost } from "D:\\v-live-caption\\functions\\api\\billing.js"
import { onRequestOptions as __api_chat_js_onRequestOptions } from "D:\\v-live-caption\\functions\\api\\chat.js"
import { onRequestPost as __api_chat_js_onRequestPost } from "D:\\v-live-caption\\functions\\api\\chat.js"
import { onRequestGet as __api_config_js_onRequestGet } from "D:\\v-live-caption\\functions\\api\\config.js"
import { onRequestOptions as __api_config_js_onRequestOptions } from "D:\\v-live-caption\\functions\\api\\config.js"
import { onRequestOptions as __api_stt_js_onRequestOptions } from "D:\\v-live-caption\\functions\\api\\stt.js"
import { onRequestPost as __api_stt_js_onRequestPost } from "D:\\v-live-caption\\functions\\api\\stt.js"
import { onRequestGet as __api_usage_js_onRequestGet } from "D:\\v-live-caption\\functions\\api\\usage.js"
import { onRequestOptions as __api_usage_js_onRequestOptions } from "D:\\v-live-caption\\functions\\api\\usage.js"
import { onRequestPost as __api_usage_js_onRequestPost } from "D:\\v-live-caption\\functions\\api\\usage.js"

export const routes = [
    {
      routePath: "/api/billing",
      mountPath: "/api",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_billing_js_onRequestOptions],
    },
  {
      routePath: "/api/billing",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_billing_js_onRequestPost],
    },
  {
      routePath: "/api/chat",
      mountPath: "/api",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_chat_js_onRequestOptions],
    },
  {
      routePath: "/api/chat",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_chat_js_onRequestPost],
    },
  {
      routePath: "/api/config",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_config_js_onRequestGet],
    },
  {
      routePath: "/api/config",
      mountPath: "/api",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_config_js_onRequestOptions],
    },
  {
      routePath: "/api/stt",
      mountPath: "/api",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_stt_js_onRequestOptions],
    },
  {
      routePath: "/api/stt",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_stt_js_onRequestPost],
    },
  {
      routePath: "/api/usage",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_usage_js_onRequestGet],
    },
  {
      routePath: "/api/usage",
      mountPath: "/api",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_usage_js_onRequestOptions],
    },
  {
      routePath: "/api/usage",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_usage_js_onRequestPost],
    },
  ]