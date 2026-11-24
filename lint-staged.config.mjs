/** @type {import("lint-staged").Configuration} */
const config = {
  "*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}": [
    "eslint --fix --max-warnings=0",
    "prettier --write",
  ],
  "*.{json,css,yml,yaml}": "prettier --write",
};

export default config;
