// ESM entry point for ToastMark browser bundle
// This wraps the CommonJS bundle for ES module usage

import toastmark from '@toast-ui/toastmark';

export const ToastMark = toastmark.ToastMark;
export const Parser = toastmark.Parser;
export const createRenderHTML = toastmark.createRenderHTML;

// Also export as default for convenience
export default {
  ToastMark: toastmark.ToastMark,
  Parser: toastmark.Parser,
  createRenderHTML: toastmark.createRenderHTML,
};
