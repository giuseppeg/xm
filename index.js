#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const URL = require("url").URL;
const { log, name, spawn, onCompile, help } = require("./utils");

let args = process.argv.slice(2);

log(`\n <h> ₪ ${name} </h> extensible static HTML\n`, { prefix: null });

const cmds = ["dev", "build", "help"];
const cmd = args.shift();

if (!cmds.includes(cmd)) {
  if (cmd) {
    log(
      `Invalid command <u>${cmd || ""}</u>. Valid commands are ${cmds
        .map((c) => `<u>${c}</u>`)
        .join(" ")}.`
    );
  } else {
    help();
  }
  process.exit(1);
}

if (cmd === "help" || args.some((a) => a === "-h" || a === "--help")) {
  help();
  process.exit(0);
}

const isDev = cmd === "dev";
const port = 5000;

const rootDir = args.reduce((rootDir, option, index) => {
  if (["-r", "--root"].includes(option) && args[index + 1]) {
    rootDir = args[index + 1];
  }
  return rootDir;
}, ".");

const outputOptionIndex = args.findIndex((a) => a === "-o" || a === "--output");
let devDir = `.${name}`;
let outDir = isDev
  ? path.join(rootDir, devDir)
  : (~outputOptionIndex && args[outputOptionIndex + 1]) || "out";
if (~outputOptionIndex) {
  args[outputOptionIndex + 1] = outDir;
} else {
  args.push("-o");
  args.push(outDir);
}

// Mirror the input folder tree when outputting.
args.push("-a");

const hasPattern = args.findIndex((a) => /^[-!]/.test(a));
if (hasPattern === 0) {
  args.unshift("**/*.html");
}

args.splice(1, 0, `!**/${isDev ? devDir : outDir}/**`);

args.push("-u");
args.push(`posthtml-${name}-import`);

args.push(`--posthtml-${name}-import.root`);
args.push(rootDir);

args.push(`--posthtml-${name}-import.strict`);
args.push("");

args.push("-u");
args.push("posthtml-md2html");
args.push("--posthtml-md2html.gfm");
args.push("true");

fs.rmdirSync(outDir, { recursive: true });

const htmlOnlyIndex = args.findIndex((a) => a === "-x" || a === "--htmlOnly");
const run =
  ~htmlOnlyIndex || isDev
    ? (fn) => fn()
    : (fn) => {
        require("ncp").ncp(
          rootDir,
          outDir,
          {
            filter: (filePath) =>
              !filePath.includes(outDir) && !filePath.includes(devDir),
          },
          (err) => {
            if (err) {
              throw err;
            }
            fn();
          }
        );
      };

if (~htmlOnlyIndex) {
  args.splice(htmlOnlyIndex, 1);
}

run(() => {
  if (isDev) {
    const http = require("http");
    const sirvHandler = require("sirv")(rootDir, { dev: true });
    const server = new http.createServer((req, res, next) => {
      const pathname = new URL(req.url, "https://localhost/").pathname || "/";
      let filename = path.join(rootDir, pathname);
      const extension = path.extname(filename).trim();
      const shouldRebuildRoute =
        (!extension || extension === ".html") &&
        ["index.html", ".html", ""].some((guess) => {
          let guessFilename =
            guess == "index.html"
              ? path.join(filename, guess)
              : filename + guess;
          if (fs.existsSync(path.resolve(guessFilename))) {
            filename =
              guess == "index.html"
                ? path.join(pathname, guess)
                : pathname + guess;
            return true;
          }
          return false;
        });

      if (shouldRebuildRoute) {
        // html files will be built and served from the devDir
        req.url = path.join(devDir, req.url);
        log(`Serving ${req.url} ...`);
        const [_, ...newArgs] = args;
        newArgs.unshift(filename);
        spawn("posthtml", {
          args: newArgs,
          onMsg: () => {},
        });
      }
      return sirvHandler(req, res, next);
    });

    server.listen(port, (err) => {
      if (err) {
        log(`<u>${err}</u>`);
        process.exit(1);
      }
      log(`Listening on <u>http://localhost:${port}</u>\n`);
    });
  } else {
    spawn("posthtml", {
      args,
      onMsg: () => {
        log("Done.");
      },
    });
  }
});
