import js from "@eslint/js";

export default [
  { ignores: ["dist/**", "node_modules/**"] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: Object.fromEntries([
        "document", "window", "URL", "Blob", "FileReader", "Image", "alert",
        "requestAnimationFrame", "setTimeout", "console", "DOMParser",
        "createImageBitmap", "OffscreenCanvas", "performance",
      ].map(name => [name, "readonly"])),
    },
  },
];
