module.exports = {
  plugins: {
    "posthtml-xm-import": {
      globals: {
        domain: "giuseppegurgone.com",
      },
    },
    "posthtml-md2html": {
      highlight: function(code, language) {
        const hljs = require("highlight.js");
        const validLanguage = hljs.getLanguage(language)
          ? language
          : "plaintext";
        return hljs.highlight(validLanguage, code).value;
      },
    },
  },
};
