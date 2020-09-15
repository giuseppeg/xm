module.exports = {
  plugins: {
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
