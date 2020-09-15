const child_process = require("child_process");
const path = require("path");

const tagsMap = {
  b: [1, 22],
  i: [3, 23],
  u: [4, 24],
  h: [7, 27],
};
const name = require("./package.json").name;
module.exports.name = name;
function log(msg, { prefix } = { prefix: "₪" }) {
  if (prefix) {
    msg = msg.replace(
      /\S/,
      (firstChar) =>
        ` \x1b[${tagsMap.h[0]}m ${prefix} \x1b[${tagsMap.h[1]}m ${firstChar}`
    );
  }

  msg = msg.replace(/<(\/)?(.*?)>/gi, (src, isClosing, tag) => {
    return tagsMap[tag]
      ? `\x1b[${isClosing ? tagsMap[tag][1] : tagsMap[tag][0]}m`
      : src;
  });

  console.log(msg);
}
module.exports.log = log;

module.exports.onCompile = (msg) => {
  msg
    .trim()
    .split("\n")
    .forEach((line) => {
      if (line.trim()) {
        log(line);
      } else {
        log(line, { prefix: false });
      }
    });
};

module.exports.spawn = function spawn(
  cliName,
  { args = {}, options = {}, async = false, onMsg }
) {
  const child = (async ? child_process.spawn : child_process.spawnSync)(
    path.resolve(__dirname, "node_modules", ".bin", cliName),
    args,
    {
      stdio: process.env.DEBUG
        ? "inherit"
        : ["inherit", onMsg ? "pipe" : "inherit", "inherit"],
      ...options,
    }
  );
  if (onMsg && !process.env.DEBUG) {
    if (async) {
      child.stdout.on("data", onMsg);
    }
    onMsg(child.stdout.toString());
  }
  return child;
};

module.exports.help = function help() {
  log(`Usage: ${name} <command> [options]\n`);

  log(`Commands:\n`);
  log(`     <b>dev</b>     Compiles and watches the root folder`, {
    prefix: false,
  });
  log(`     <b>build</b>   Compiles the HTML files once`, { prefix: false });
  log(`     <b>help</b>    Displays help`, { prefix: false });

  log(`\nOptions:\n`);
  log(`     <b>--root</b>       Folder to complile (default ./)`, {
    prefix: false,
  });
  log(
    `     <b>--output</b>     Output (destination) folder. This is necessary only when using ${name} build`,
    {
      prefix: false,
    }
  );
  log(
    `     <b>--htmlOnly</b>   Compiles and copies only the built HTML files\n`,
    {
      prefix: false,
    }
  );
};
