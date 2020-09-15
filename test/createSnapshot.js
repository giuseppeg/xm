const fs = require("fs");
const snapshot = require("snapshot-dir").snapshot;

snapshot("test/.tmp").then((result) =>
  fs.writeFileSync("test/snapshot.json", JSON.stringify(result, null, 2))
);
