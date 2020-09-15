const fs = require("fs");
const snapshotCompare = require("snapshot-dir").snapshotCompareSync;
const assert = require("assert");

const result = snapshotCompare("test/.tmp", require("./snapshot.json"));
assert.ok(
  !result,
  "The snapshot did not match.\n\n" + JSON.stringify(result, null, 2)
);
